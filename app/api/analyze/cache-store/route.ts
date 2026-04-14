/**
 * POST /api/analyze/cache-store
 *
 * Writes a completed AnalysisResult to analysis_cache (1hr TTL). Called
 * fire-and-forget from the client after the pipeline assembles the final
 * result.
 *
 * Body: { url: string, result: AnalysisResult }
 */

import { NextResponse, type NextRequest } from 'next/server';
import { cacheAnalysis } from '@/lib/cache/analysis-cache';
import type { AnalysisResult } from '@/lib/types/analysis';

interface CacheStoreBody {
  url?: string;
  result?: AnalysisResult;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CacheStoreBody;
    const url = body.url?.trim();

    if (!url || !body.result) {
      return NextResponse.json({ ok: false, error: 'url and result required' }, { status: 400 });
    }

    await cacheAnalysis(url, body.result as unknown as Record<string, unknown>);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
