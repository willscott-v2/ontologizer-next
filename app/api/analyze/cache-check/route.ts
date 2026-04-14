/**
 * POST /api/analyze/cache-check
 *
 * Checks analysis_cache (1hr TTL) for a cached full AnalysisResult for the
 * given URL. No auth required; the cache is cross-user.
 *
 * Body:    { url: string }
 * Returns: { cached: AnalysisResult | null }
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getCachedAnalysis } from '@/lib/cache/analysis-cache';
import type { AnalysisResult } from '@/lib/types/analysis';

interface CacheCheckBody {
  url?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CacheCheckBody;
    const url = body.url?.trim();

    if (!url) {
      return NextResponse.json({ cached: null });
    }

    const cached = (await getCachedAnalysis(url)) as AnalysisResult | null;
    return NextResponse.json({ cached });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message, cached: null }, { status: 500 });
  }
}
