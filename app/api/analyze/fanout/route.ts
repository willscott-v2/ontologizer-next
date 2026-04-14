/**
 * POST /api/analyze/fanout
 *
 * Accepts HTML content + a content hash and optional URL, runs
 * Gemini-powered fan-out analysis to predict how Google's AI Mode might
 * decompose queries.
 *
 * Cached in fanout_cache (1hr TTL) keyed by contentHash. Cache read is
 * skipped when body.clearCache === true; cache write still happens.
 *
 * Headers:
 *   X-Gemini-Key (optional) - BYOK Gemini API key
 *
 * Body:
 *   { htmlContent, contentHash, url?, clearCache? }
 */

import { NextRequest, NextResponse } from 'next/server';
import type { FanoutResult } from '../../../../lib/types/analysis';
import { analyzeFanout } from '../../../../lib/pipeline/fanout-analyzer';
import { hashContent } from '@/lib/pipeline/fetcher';
import { getCachedFanout, cacheFanout } from '@/lib/cache/fanout-cache';
import { createClient } from '@/lib/supabase/server';

interface FanoutRequestBody {
  htmlContent: string;
  url?: string;
  contentHash?: string;
  clearCache?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as FanoutRequestBody;
    const { htmlContent, url } = body;
    const clearCache = !!body.clearCache;

    if (!htmlContent) {
      return NextResponse.json(
        { error: 'Missing required field: htmlContent' },
        { status: 400 },
      );
    }

    // Prefer caller-provided hash (from extract step). Fall back to local
    // hash of htmlContent if the caller didn't pass one.
    const contentHash = body.contentHash || hashContent(htmlContent);

    // Cache read
    if (!clearCache) {
      const cached = await getCachedFanout(contentHash);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    let geminiKey = request.headers.get('X-Gemini-Key') || undefined;

    // Signed-in users fall back to the app's Gemini key
    if (!geminiKey) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        geminiKey = process.env.GEMINI_API_KEY || undefined;
      }
    }

    if (!geminiKey) {
      const result: FanoutResult = {
        analysis: null,
        chunksExtracted: 0,
        chunks: [],
        error:
          'Gemini API key required — add one in Settings, or sign in to use the free tier.',
      };
      return NextResponse.json(result, { status: 200 });
    }

    const result = await analyzeFanout(htmlContent, url, geminiKey);

    // Write to cache only when the call actually produced an analysis.
    // Don't poison the cache with transient errors.
    if (result.analysis && !result.error) {
      cacheFanout(contentHash, result).catch(() => {});
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
