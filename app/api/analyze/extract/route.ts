/**
 * POST /api/analyze/extract
 *
 * Accepts a URL (fetches + parses) or pasteContent (parses directly),
 * extracts entities via OpenAI (with BYOK) or regex fallback,
 * and returns an ExtractResult.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { fetchWebpage } from '@/lib/pipeline/fetcher';
import { extractTextFromHtml } from '@/lib/pipeline/parser';
import { extractEntities } from '@/lib/pipeline/entity-extractor';
import {
  checkFreeUsage,
  incrementFreeUsage,
  logAnalysis,
} from '@/lib/metering/usage-tracker';
import { createClient } from '@/lib/supabase/server';
import type { ExtractResult } from '@/lib/types/analysis';

interface ExtractRequestBody {
  url?: string;
  pasteContent?: string;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    const body = (await request.json()) as ExtractRequestBody;

    // BYOK: read OpenAI key from header
    const byokOpenaiKey = request.headers.get('X-OpenAI-Key') || undefined;
    const isByok = !!byokOpenaiKey;

    let userId: string | undefined;
    const keySource: 'byok' | 'free_tier' = isByok ? 'byok' : 'free_tier';

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
      userId = user.id;

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

    if (body.url) {
      try {
        html = await fetchWebpage(body.url);
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
    } else {
      return NextResponse.json(
        { error: 'Provide either a "url" or "pasteContent" field.' },
        { status: 400 },
      );
    }

    // Parse HTML into structured text parts
    const textParts = extractTextFromHtml(html);

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

    // Extract entities
    const extraction = await extractEntities(fullText, openaiKey);

    const result: ExtractResult = {
      textParts,
      mainTopic: extraction.mainTopic,
      mainTopicConfidence: extraction.mainTopicConfidence,
      entities: extraction.entities,
      tokenUsage: extraction.tokenUsage,
      costUsd: extraction.costUsd,
    };

    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
