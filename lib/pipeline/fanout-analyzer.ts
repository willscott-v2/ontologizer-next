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

  // Primary topic from title + h1
  const title = $('title').text().trim();
  const h1 = $('h1').first().text().trim();
  if (title || h1) {
    chunks.push({
      type: 'primary_topic',
      content: (title + ' ' + h1).trim(),
    });
  }

  // Sections from h2/h3 headings with their content
  $('h2, h3').each((_i, el) => {
    const heading = $(el);
    const headingText = heading.text().trim();
    const currentLevel = parseInt((heading.prop('tagName') || 'H2').slice(1), 10);

    let sectionContent = '';
    let next = heading.next();

    while (next.length) {
      const tagName = (next.prop('tagName') || '').toLowerCase();

      // Stop at same-level or higher heading
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

  // Key lists (max 5)
  let listCount = 0;
  $('ul, ol').each((_i, el) => {
    if (listCount >= 5) return false; // break

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

  // Existing structured data
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

  return chunks;
}

// ─── Prompt construction ────────────────────────────────────────────────────

function buildFanoutPrompt(chunks: SemanticChunk[], url?: string): string {
  const urlText = url ? `URL: ${url}\n\n` : '';

  return `You are analyzing a webpage for Google's AI Mode query fan-out potential. Google's AI Mode decomposes user queries into multiple sub-queries to synthesize comprehensive answers.

${urlText}SEMANTIC CHUNKS FROM PAGE:
${JSON.stringify(chunks, null, 2)}

Based on this content, perform the following analysis:

1. IDENTIFY PRIMARY ENTITY: What is the main ontological entity or topic of this page?

2. PREDICT FAN-OUT QUERIES: Generate 8-10 likely sub-queries that Google's AI might create when a user asks about this topic. Consider:
   - Related queries (broader context)
   - Implicit queries (unstated user needs)
   - Comparative queries (alternatives, comparisons)
   - Procedural queries (how-to aspects)
   - Contextual refinements (budget, size, location specifics)

3. SEMANTIC COVERAGE SCORE: For each predicted query, assess if the page content provides information to answer it (Yes/Partial/No).

4. FOLLOW-UP QUESTION POTENTIAL: What follow-up questions would users likely ask after reading this content?

OUTPUT FORMAT:
PRIMARY ENTITY: [entity name]

FAN-OUT QUERIES:
• [Query 1] - Coverage: [Yes/Partial/No]
• [Query 2] - Coverage: [Yes/Partial/No]
...

FOLLOW-UP POTENTIAL:
• [Follow-up question 1]
• [Follow-up question 2]
...

COVERAGE SCORE: [X/10 queries covered]
RECOMMENDATIONS: [Specific content gaps to fill]`;
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
      maxOutputTokens: 2048,
    },
  };

  const baseUrl =
    'https://generativelanguage.googleapis.com/v1beta/models';
  const models = ['gemini-2.0-flash-exp', 'gemini-2.0-flash'];

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

      // If the experimental model 404s, try the stable model
      if (response.status === 404 && model === 'gemini-2.0-flash-exp') {
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

      // If it's the experimental model, try stable before giving up
      if (model === 'gemini-2.0-flash-exp') continue;

      return {
        error:
          err instanceof Error ? err.message : 'Gemini API request failed',
      };
    }
  }

  return { error: 'All Gemini model endpoints failed' };
}
