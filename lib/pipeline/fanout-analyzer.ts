/**
 * Fan-out query analyzer using Gemini.
 * Extracts semantic chunks from HTML, builds a prompt, and calls Gemini
 * to predict how Google AI Mode might decompose queries about the content.
 *
 * Ported from PHP generate_fanout_analysis(), extract_semantic_chunks(),
 * build_fanout_prompt(), call_gemini_api() (lines 4759-5043).
 */

import * as cheerio from 'cheerio';
import type { SemanticChunk, FanoutResult } from '../types/analysis';

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
  const prompt = buildFanoutPrompt(chunks, url);

  try {
    const analysis = await callGeminiApi(prompt, geminiKey);

    if (typeof analysis === 'object' && analysis !== null && 'error' in analysis) {
      return {
        analysis: null,
        chunksExtracted: chunks.length,
        chunks,
        error: (analysis as { error: string }).error,
      };
    }

    return {
      analysis: analysis as string,
      chunksExtracted: chunks.length,
      chunks,
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
  const chunks: SemanticChunk[] = [];

  if (!htmlContent) return chunks;

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

  return chunks;
}

// ─── Prompt construction ────────────────────────────────────────────────────

function buildFanoutPrompt(chunks: SemanticChunk[], url?: string): string {
  const urlText = url ? `URL: ${url}\n\n` : '';

  return `You are analyzing a webpage for Google's AI Mode query fan-out potential. Google's AI Mode decomposes user queries into multiple sub-queries to synthesize comprehensive answers across sources.

${urlText}SEMANTIC CHUNKS FROM PAGE:
${JSON.stringify(chunks, null, 2)}

Based on this content, perform the following analysis:

1. IDENTIFY PRIMARY ENTITY: What is the main ontological entity or topic of this page?

2. PREDICT FAN-OUT QUERIES: Generate 12-15 distinct sub-queries that Google's AI Mode is likely to decompose a user's question about this topic into. Cover multiple intent types:
   - Definitional / explanatory ("what is X", "what does X mean")
   - Related / adjacent topics (broader or neighbouring concepts)
   - Implicit needs (unstated problems this page solves)
   - Comparative (X vs Y, alternatives, "is X better than Y")
   - Procedural / how-to (steps, processes)
   - Evaluative (cost, quality, reviews, pros/cons, ROI)
   - Contextual / audience-specific (for-whom, when, where, budget)
   - Trust / credibility (credentials, experience, case studies)

3. SEMANTIC COVERAGE SCORE: For each predicted query, assess if the page provides the information needed to answer it:
   - Yes = the page directly and meaningfully answers the query
   - Partial = the page touches the topic but lacks depth, specifics, or examples
   - No = the page does not address this query

4. RATIONALE: For each query, add a one-sentence "Why:" note explaining (a) why a user would implicitly ask this sub-query, and (b) what specifically on the page covers (or fails to cover) it.

5. FOLLOW-UP QUESTION POTENTIAL: List 5-8 questions users would likely ask AFTER reading this content — next-step intents, not re-phrasings.

STRICT OUTPUT FORMAT (do not deviate; use plain text, one item per line, no markdown bold):

PRIMARY ENTITY: [entity name]

FAN-OUT QUERIES:
• [Query 1] - Coverage: [Yes/Partial/No] - Why: [one-sentence rationale]
• [Query 2] - Coverage: [Yes/Partial/No] - Why: [one-sentence rationale]
... (12-15 queries total)

FOLLOW-UP POTENTIAL:
• [Follow-up question 1]
• [Follow-up question 2]
... (5-8 total)

COVERAGE SCORE: [X/Y queries fully covered]
RECOMMENDATIONS: [2-4 sentences listing the highest-leverage content gaps to fill, grouped by theme]`;
}

// ─── Gemini API call ────────────────────────────────────────────────────────

async function callGeminiApi(
  prompt: string,
  apiKey: string,
): Promise<string | { error: string }> {
  const requestData = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      topK: 20,
      topP: 0.9,
      // Gemini 2.5 models spend part of maxOutputTokens on internal thinking.
      // 12288 gives room for ~2k thinking + a full 12-15 query response.
      maxOutputTokens: 12288,
      thinkingConfig: {
        thinkingBudget: 2048,
      },
    },
  };

  const baseUrl =
    'https://generativelanguage.googleapis.com/v1beta/models';
  const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'];

  for (const model of models) {
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

      // If this model 404s (retired/unavailable), try the next fallback
      if (response.status === 404 && model !== models[models.length - 1]) {
        continue;
      }

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

        // Add troubleshooting hints
        if (response.status === 401 || response.status === 403) {
          errorMessage += ' (Check: API key is valid and has proper permissions)';
        } else if (response.status === 400) {
          errorMessage += ' (Check: Request format is correct, prompt is not too long)';
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

      return text;
    } catch (err) {
      clearTimeout(timeout);

      if (err instanceof Error && err.name === 'AbortError') {
        return { error: 'Gemini API request timed out (60s)' };
      }

      // Try the next fallback model before giving up
      if (model !== models[models.length - 1]) continue;

      return {
        error:
          err instanceof Error ? err.message : 'Gemini API request failed',
      };
    }
  }

  return { error: 'All Gemini model endpoints failed' };
}
