/**
 * POST /api/analyze/extract
 *
 * Accepts a URL (fetches + parses) or pasteContent (parses directly),
 * extracts entities via OpenAI (with BYOK) or regex fallback,
 * and returns an ExtractResult.
 *
 * Cache layers:
 *   - url_cache (1hr TTL) via fetchWebpage
 *   - extraction_cache (24hr TTL) keyed by content_hash of cleaned text
 * Both are bypassed (read-skip, write-through) when body.clearCache === true.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { fetchWebpage, hashContent } from '@/lib/pipeline/fetcher';
import { extractTextFromHtml } from '@/lib/pipeline/parser';
import { extractEntities } from '@/lib/pipeline/entity-extractor';
import {
  checkFreeUsage,
  incrementFreeUsage,
} from '@/lib/metering/usage-tracker';
import {
  getCachedExtraction,
  cacheExtraction,
} from '@/lib/cache/extraction-cache';
import { createClient } from '@/lib/supabase/server';
import type { ExtractResult } from '@/lib/types/analysis';

interface ExtractRequestBody {
  url?: string;
  pasteContent?: string;
  clearCache?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ExtractRequestBody;
    const clearCache = !!body.clearCache;

    // BYOK: read OpenAI key from header
    const byokOpenaiKey = request.headers.get('X-OpenAI-Key') || undefined;
    const isByok = !!byokOpenaiKey;

    // If no BYOK key, check free tier eligibility
    let openaiKey = byokOpenaiKey;
    if (!isByok) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json(
          { error: 'Sign in for free analyses or add your own API keys in Settings.' },
          { status: 401 },
        );
      }

      const usage = await checkFreeUsage(user.id);
      if (!usage.allowed) {
        return NextResponse.json(
          { error: usage.reason },
          { status: 429 },
        );
      }

      openaiKey = process.env.OPENAI_API_KEY ?? undefined;

      // Increment usage counter (fire and forget; no-op for unlimited domains)
      incrementFreeUsage(user.id).catch(() => {});
    }

    // Get HTML content from URL or pasted text
    let html: string;
    let contentHash: string;

    if (body.url) {
      try {
        const fetched = await fetchWebpage(body.url, { clearCache });
        html = fetched.html;
        contentHash = fetched.contentHash;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to fetch webpage';
        return NextResponse.json({ error: message }, { status: 502 });
      }
    } else if (body.pasteContent) {
      // Treat pasted content as raw HTML (or wrap plain text in minimal HTML)
      html = body.pasteContent.trim().startsWith('<')
        ? body.pasteContent
        : `<html><body>${body.pasteContent}</body></html>`;
      // Hash the pasted content directly — no url_cache round-trip
      contentHash = hashContent(body.pasteContent);
    } else {
      return NextResponse.json(
        { error: 'Provide either a "url" or "pasteContent" field.' },
        { status: 400 },
      );
    }

    // Parse HTML into structured text parts (always from the fresh fetch)
    const textParts = extractTextFromHtml(html);

    // Try the extraction cache before hitting OpenAI
    let cachedExtraction = null;
    if (!clearCache) {
      cachedExtraction = await getCachedExtraction(contentHash);
    }

    if (cachedExtraction) {
      const result: ExtractResult = {
        textParts,
        mainTopic: cachedExtraction.mainTopic,
        mainTopicConfidence: cachedExtraction.mainTopicConfidence,
        entities: cachedExtraction.entities,
        tokenUsage: cachedExtraction.tokenUsage,
        costUsd: cachedExtraction.costUsd,
        cached: true,
        contentHash,
      };
      return NextResponse.json(result);
    }

    // Build a single text blob for entity extraction (matching PHP approach)
    const headingTexts = textParts.headings.map((h) => h.text);
    const fullText = [
      textParts.title,
      textParts.description,
      ...headingTexts,
      textParts.body,
    ]
      .filter(Boolean)
      .join('. ');

    // Extract entities (cache miss or clearCache)
    const extraction = await extractEntities(fullText, openaiKey);

    // Write-through to extraction cache (fire and forget)
    cacheExtraction(contentHash, {
      entities: extraction.entities,
      mainTopic: extraction.mainTopic,
      mainTopicConfidence: extraction.mainTopicConfidence,
      tokenUsage: extraction.tokenUsage,
      costUsd: extraction.costUsd,
    }).catch(() => {});

    const result: ExtractResult = {
      textParts,
      mainTopic: extraction.mainTopic,
      mainTopicConfidence: extraction.mainTopicConfidence,
      entities: extraction.entities,
      tokenUsage: extraction.tokenUsage,
      costUsd: extraction.costUsd,
      cached: false,
      contentHash,
    };

    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
