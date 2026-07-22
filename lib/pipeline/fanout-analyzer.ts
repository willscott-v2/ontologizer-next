/**
 * Fan-out query analyzer using Gemini.
 * Extracts semantic chunks from HTML, builds a prompt, and calls Gemini
 * to predict how Google AI Mode might decompose queries about the content.
 *
 * Ported from PHP generate_fanout_analysis(), extract_semantic_chunks(),
 * build_fanout_prompt(), call_gemini_api() (lines 4759-5043).
 */

import * as cheerio from 'cheerio';
import { z } from 'zod';
import type { SemanticChunk, FanoutResult, AiUsage, QueryCoverageAnalysis } from '../types/analysis';
import { computeCost } from '../pricing';
import { QUERY_COVERAGE_VERSION } from '@/lib/analysis/version';

const questionSchema = z.object({
  question: z.string().min(8).max(180),
  intent: z.enum(['definition', 'comparison', 'procedure', 'evaluation', 'audience', 'trust', 'local']),
  coverage: z.enum(['covered', 'partial', 'missing']),
  evidenceChunkIds: z.array(z.string().min(1).max(40)).max(4),
  checkedScope: z.string().min(10).max(240),
  gapAction: z.string().min(10).max(240).optional(),
}).superRefine((question, context) => {
  if (question.coverage !== 'missing' && question.evidenceChunkIds.length === 0) {
    context.addIssue({ code: 'custom', message: 'Covered and partial questions require evidence chunk IDs.' });
  }
  if (question.coverage !== 'covered' && !question.gapAction) {
    context.addIssue({ code: 'custom', message: 'Partial and missing questions require a gap action.' });
  }
});

export const queryCoverageResponseSchema = z.object({
  primaryEntity: z.string().min(2).max(120),
  questions: z.array(questionSchema).min(5).max(8),
}).strict();

export function normalizeQueryCoverageModelOutput(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const source = value as Record<string, unknown>;
  if (!Array.isArray(source.questions)) return value;
  return {
    primaryEntity: source.primaryEntity,
    questions: source.questions.map((candidate) => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return candidate;
      const question = candidate as Record<string, unknown>;
      const coverageAliases: Record<string, string> = {
        fully_covered: 'covered',
        partially_covered: 'partial',
        not_covered: 'missing',
      };
      const rawCoverage = typeof question.coverage === 'string' ? question.coverage : '';
      const checkedScope = Array.isArray(question.checkedScope) && question.checkedScope.every((item) => typeof item === 'string')
        ? question.checkedScope.join(' ')
        : question.checkedScope;
      const evidenceChunkIds = Array.isArray(question.evidenceChunkIds)
        ? question.evidenceChunkIds.slice(0, 4)
        : question.evidenceChunkIds;
      const normalized: Record<string, unknown> = {
        question: question.question,
        intent: question.intent,
        coverage: coverageAliases[rawCoverage] ?? question.coverage,
        evidenceChunkIds,
        checkedScope,
      };
      if (question.gapAction !== null && question.gapAction !== undefined) normalized.gapAction = question.gapAction;
      return normalized;
    }),
  };
}

export function validateQueryCoverageResponse(
  value: unknown,
  chunks: SemanticChunk[],
): QueryCoverageAnalysis | null {
  const validated = queryCoverageResponseSchema.safeParse(normalizeQueryCoverageModelOutput(value));
  if (!validated.success) return null;
  const validChunkIds = new Set(chunks.map((chunk) => chunk.id));
  if (validated.data.questions.some((question) =>
    question.evidenceChunkIds.some((id) => !validChunkIds.has(id)))) {
    return null;
  }
  const normalizedQuestions = new Set(
    validated.data.questions.map((question) => question.question.toLowerCase().replace(/[^a-z0-9]/g, '')),
  );
  if (normalizedQuestions.size !== validated.data.questions.length) return null;
  const summary = validated.data.questions.reduce(
    (counts, question) => ({ ...counts, [question.coverage]: counts[question.coverage] + 1 }),
    { covered: 0, partial: 0, missing: 0 },
  );
  return {
    ...validated.data,
    summary,
    promptVersion: QUERY_COVERAGE_VERSION,
    disclosure: 'Modeled questions based on this page, not observed Google searches.',
  };
}

export function queryCoverageValidationIssue(
  value: unknown,
  chunks: SemanticChunk[],
): string | null {
  const validated = queryCoverageResponseSchema.safeParse(normalizeQueryCoverageModelOutput(value));
  if (!validated.success) {
    const issue = validated.error.issues[0];
    return `contract_${issue.path.join('_') || 'root'}_${issue.code}`;
  }
  const validChunkIds = new Set(chunks.map((chunk) => chunk.id));
  if (validated.data.questions.some((question) =>
    question.evidenceChunkIds.some((id) => !validChunkIds.has(id)))) return 'unsupported_evidence_id';
  const normalized = validated.data.questions.map((question) => question.question.toLowerCase().replace(/[^a-z0-9]/g, ''));
  if (new Set(normalized).size !== normalized.length) return 'duplicate_question';
  return null;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Run the full fan-out analysis pipeline.
 * Returns analysis text from Gemini, the extracted chunks, and metadata.
 */
export async function analyzeFanout(
  htmlContent: string,
  url?: string,
  geminiKey?: string,
): Promise<FanoutResult> {
  if (!geminiKey) {
    return {
      analysis: null,
      chunksExtracted: 0,
      chunks: [],
      error: 'Gemini API key not configured',
    };
  }

  const chunks = extractSemanticChunks(htmlContent);
  const prompt = buildQueryCoveragePrompt(chunks, url);

  try {
    const analysis = await callGeminiApi(prompt, geminiKey, chunks);

    if ('error' in analysis) {
      return {
        analysis: null,
        chunksExtracted: chunks.length,
        chunks,
        error: analysis.error,
        usage: analysis.usage,
      };
    }

    return {
      analysis: analysis.analysis,
      chunksExtracted: chunks.length,
      chunks,
      usage: analysis.usage,
    };
  } catch (err) {
    return {
      analysis: null,
      chunksExtracted: chunks.length,
      chunks,
      error: err instanceof Error ? err.message : 'Fan-out analysis failed',
    };
  }
}

// ─── Semantic chunk extraction ──────────────────────────────────────────────

/**
 * Extract layout-aware semantic chunks from HTML.
 * Produces a compact representation of the page's key content blocks.
 */
export function extractSemanticChunks(htmlContent: string): SemanticChunk[] {
  const chunks: Array<Omit<SemanticChunk, 'id'>> = [];

  if (!htmlContent) return [];

  const $ = cheerio.load(htmlContent);

  // Strip noise before chunking
  $(
    'script, style, noscript, nav, aside, header, footer, form, ' +
      '[class*="nav"], [class*="menu"], [class*="footer"], [class*="header"], ' +
      '[class*="sidebar"], [class*="cookie"], [class*="consent"]',
  ).remove();

  // ── Primary topic: title + h1 + meta description
  const title = $('title').text().trim();
  const h1 = $('h1').first().text().trim();
  const metaDesc =
    $('meta[name="description"]').attr('content')?.trim() ??
    $('meta[property="og:description"]').attr('content')?.trim() ??
    '';

  const primaryParts = [title, h1, metaDesc].filter(Boolean);
  if (primaryParts.length) {
    chunks.push({
      type: 'primary_topic',
      content: primaryParts.join(' — ').slice(0, 600),
    });
  }

  // ── Sections from h2/h3 headings with content between them
  $('h2, h3').each((_i, el) => {
    const heading = $(el);
    const headingText = heading.text().trim();
    const currentLevel = parseInt((heading.prop('tagName') || 'H2').slice(1), 10);

    let sectionContent = '';
    let next = heading.next();

    while (next.length) {
      const tagName = (next.prop('tagName') || '').toLowerCase();
      if (/^h[1-6]$/.test(tagName)) {
        const siblingLevel = parseInt(tagName.slice(1), 10);
        if (siblingLevel <= currentLevel) break;
      }
      const text = next.text().trim();
      if (text) sectionContent += ' ' + text;
      next = next.next();
    }

    if (sectionContent) {
      chunks.push({
        type: 'section',
        heading: headingText,
        content: sectionContent.trim().slice(0, 500),
      });
    }
  });

  // ── Key lists (max 5)
  let listCount = 0;
  $('ul, ol').each((_i, el) => {
    if (listCount >= 5) return false;
    const items: string[] = [];
    $(el)
      .find('li')
      .each((_j, li) => {
        items.push($(li).text().trim());
      });
    if (items.length > 2) {
      chunks.push({
        type: 'list',
        content: items.join(' | ').slice(0, 300),
      });
      listCount++;
    }
  });

  // ── Existing structured data
  $('script[type="application/ld+json"]').each((_i, el) => {
    try {
      const data = JSON.parse($(el).html() || '');
      if (data['@type']) {
        chunks.push({
          type: 'structured_data',
          content: `Type: ${data['@type']}, ${JSON.stringify(data).slice(0, 200)}`,
        });
      }
    } catch {
      // Ignore JSON parse errors
    }
  });

  // ── Fallback: if we have few chunks (page is div-heavy with sparse headings),
  // pull in substantial paragraphs and question-style sentences from the body.
  const hasFewSections = chunks.filter((c) => c.type === 'section').length < 3;
  if (hasFewSections) {
    const root = $('article, main, [role="main"]').first();
    const scope = root.length ? root : $('body');

    const paragraphs: string[] = [];
    scope.find('p').each((_i, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text.length >= 80 && paragraphs.length < 6) {
        paragraphs.push(text.slice(0, 400));
      }
    });
    if (paragraphs.length) {
      chunks.push({
        type: 'paragraphs',
        content: paragraphs.join(' | ').slice(0, 1200),
      });
    }

    // Pull out any question-style sentences — strong signal for implicit user queries
    const bodyText = scope.text().replace(/\s+/g, ' ').trim();
    const questions = bodyText
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.includes('?') && s.length > 10 && s.length < 250)
      .slice(0, 6);
    if (questions.length) {
      chunks.push({
        type: 'questions_on_page',
        content: questions.join(' | ').slice(0, 600),
      });
    }

    // Prominent emphasized terms (h4/strong/b) — often the brand/product/feature names
    const emphasized = new Set<string>();
    scope.find('h4, h5, h6, strong, b').each((_i, el) => {
      const t = $(el).text().trim();
      if (t.length >= 2 && t.length <= 80) emphasized.add(t);
    });
    if (emphasized.size) {
      chunks.push({
        type: 'key_terms',
        content: Array.from(emphasized).slice(0, 20).join(' | ').slice(0, 400),
      });
    }

    // OG metadata signals
    const ogSignals: string[] = [];
    const ogType = $('meta[property="og:type"]').attr('content');
    const ogSite = $('meta[property="og:site_name"]').attr('content');
    const twTitle = $('meta[name="twitter:title"]').attr('content');
    if (ogType) ogSignals.push(`og:type=${ogType}`);
    if (ogSite) ogSignals.push(`og:site=${ogSite}`);
    if (twTitle) ogSignals.push(`twitter:title=${twTitle}`);
    if (ogSignals.length) {
      chunks.push({
        type: 'page_metadata',
        content: ogSignals.join(' | ').slice(0, 300),
      });
    }
  }

  return chunks.map((chunk, index) => ({ ...chunk, id: `chunk-${index + 1}` }));
}

// ─── Prompt construction ────────────────────────────────────────────────────

export function buildQueryCoveragePrompt(chunks: SemanticChunk[], url?: string): string {
  const urlText = url ? `URL: ${url}\n\n` : '';

  return `Model adjacent questions a person may ask about this page and judge whether the supplied page chunks can answer them. These are modeled questions, not observed Google searches or Search Console data.

${urlText}SEMANTIC CHUNKS FROM PAGE:
${JSON.stringify(chunks, null, 2)}

Return 5-8 distinct questions across these intent labels only: definition, comparison, procedure, evaluation, audience, trust, local.

For each question:
- covered: cite one or more supplied chunk IDs that directly answer it.
- partial: cite supplied chunk IDs and provide one concise gapAction.
- missing: use an empty evidenceChunkIds array, explain which supplied chunks were checked in checkedScope, and provide one concise gapAction.
- For covered questions, omit gapAction entirely. Do not return null.
- Never cite a chunk ID that was not supplied.
- checkedScope must be one plain-text sentence, not an array or object.
- Use only covered, partial, or missing for coverage.
- Cite no more than four evidence chunk IDs per question.
- Return exactly the two top-level keys shown below. Do not add summary, disclosure, or commentary.

Return only JSON using this contract:
{"primaryEntity":"...","questions":[{"question":"...","intent":"definition","coverage":"covered","evidenceChunkIds":["chunk-1"],"checkedScope":"What was checked and why the judgment follows.","gapAction":"Required only for partial or missing."}]}`;
}

// ─── Gemini API call ────────────────────────────────────────────────────────

async function callGeminiApi(
  prompt: string,
  apiKey: string,
  chunks: SemanticChunk[],
): Promise<{ analysis: QueryCoverageAnalysis; usage?: AiUsage } | { error: string; usage?: AiUsage }> {
  // Gemini 3.x guidance: don't pin a low temperature (looping risk) and
  // prefer default thinking behavior — thinking tokens bill as output and
  // 12288 leaves room for thinking plus a full 12-15 query response.
  const requestData = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
    },
  };

  const baseUrl =
    'https://generativelanguage.googleapis.com/v1beta/models';
  // Gemini 2.5 models all shut down 2026-10-16. Chain is cost-ascending:
  // 3.1-flash-lite is GA and positioned as frontier-class at low cost.
  // 3.6-flash (GA 2026-07-21) replaces 3.5-flash: same input price, cheaper
  // output ($7.50 vs $9.00 per 1M).
  const models = ['gemini-3.1-flash-lite', 'gemini-3.6-flash', 'gemini-3.1-pro-preview'];

  // Status codes that warrant trying the next model in the fallback chain.
  // 503 = model overloaded, 429 = rate limit, 500/502/504 = transient infra,
  // 404 = model retired.
  const RETRYABLE_STATUSES = new Set([404, 429, 500, 502, 503, 504]);

  let lastError = 'All Gemini model endpoints failed';

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const url = `${baseUrl}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        let errorMessage = `API error: HTTP ${response.status}`;

        try {
          const errorData = JSON.parse(body);
          if (errorData?.error?.message) {
            errorMessage += ' - ' + errorData.error.message;
          }
        } catch {
          if (body) {
            errorMessage += ' - Response: ' + body.slice(0, 200);
          }
        }

        if (response.status === 401 || response.status === 403) {
          errorMessage += ' (Check: API key is valid and has proper permissions)';
        } else if (response.status === 400) {
          errorMessage += ' (Check: Request format is correct, prompt is not too long)';
        }

        // Fall through to the next model on transient failures
        const hasNextModel = i < models.length - 1;
        if (RETRYABLE_STATUSES.has(response.status) && hasNextModel) {
          lastError = errorMessage;
          // Back off briefly before hitting the next model — avoid
          // hammering a cascade of overloaded endpoints
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }

        return { error: errorMessage };
      }

      const data = await response.json();

      const text =
        data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        return {
          error:
            'Invalid API response format. Response: ' +
            JSON.stringify(data).slice(0, 200),
        };
      }

      let usage: AiUsage | undefined;
      const meta = data?.usageMetadata;
      if (meta) {
        const inputTokens = meta.promptTokenCount ?? 0;
        // Thinking tokens bill at the output rate
        const outputTokens =
          (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0);
        usage = {
          provider: 'gemini',
          model,
          inputTokens,
          outputTokens,
          costUsd: computeCost(model, inputTokens, outputTokens) ?? 0,
        };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ''));
      } catch {
        return { error: 'Gemini returned invalid JSON for AI Query Coverage.', usage };
      }
      const validated = validateQueryCoverageResponse(parsed, chunks);
      if (!validated) {
        const issue = queryCoverageValidationIssue(parsed, chunks) ?? 'unknown_contract_error';
        return { error: `Gemini returned an invalid AI Query Coverage response (${issue}).`, usage };
      }
      return {
        analysis: validated,
        usage,
      };
    } catch (err) {
      clearTimeout(timeout);

      if (err instanceof Error && err.name === 'AbortError') {
        lastError = 'Gemini API request timed out (60s)';
      } else {
        lastError = err instanceof Error ? err.message : 'Gemini API request failed';
      }

      // Try the next fallback model before giving up
      const hasNextModel = i < models.length - 1;
      if (hasNextModel) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      return { error: lastError };
    }
  }

  return { error: lastError };
}
