import { NextRequest, NextResponse } from 'next/server';
import { analyzeFanout } from '@/lib/pipeline/fanout-analyzer';
import { getCachedFanout, cacheFanout } from '@/lib/cache/fanout-cache';
import { createClient } from '@/lib/supabase/server';
import { authorizeAnalysisStep, completeAnalysisStep } from '@/lib/analysis/run-store';
import { fanoutRequestSchema, formatZodError } from '@/lib/analysis/request-schemas';
import { queryCoverageCacheKey } from '@/lib/analysis/cache-keys';
import type { FanoutResult } from '@/lib/types/analysis';

export async function POST(request: NextRequest) {
  try {
    const parsed = fanoutRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const body = parsed.data;
    const byokGeminiKey = request.headers.get('X-Gemini-Key') || undefined;
    const supabase = await createClient();
    const user = (await supabase.auth.getUser()).data.user;
    const authorization = await authorizeAnalysisStep({
      analysisRunId: body.analysisRunId,
      contentHash: body.contentHash,
      step: 'fanout',
      user,
      hasByokKey: Boolean(byokGeminiKey),
    });
    if (!authorization.allowed) {
      return NextResponse.json({ error: authorization.reason }, { status: 403 });
    }

    const cacheHash = queryCoverageCacheKey(body.contentHash);
    if (!body.clearCache) {
      const cached = await getCachedFanout(cacheHash);
      if (cached) {
        await completeAnalysisStep({ analysisRunId: body.analysisRunId, step: 'fanout' });
        return NextResponse.json({ ...cached, cacheStatus: 'cached' });
      }
    }

    const geminiKey = byokGeminiKey || (user ? process.env.GEMINI_API_KEY : undefined);
    if (!geminiKey) {
      const result: FanoutResult = {
        analysis: null,
        chunksExtracted: 0,
        chunks: [],
        error: 'AI Query Coverage needs a Gemini API key. Add one in Settings or sign in for the free tier.',
      };
      return NextResponse.json(result);
    }

    const result = await analyzeFanout(body.htmlContent, body.url, geminiKey);
    result.cacheStatus = 'fresh';
    if (result.analysis && !result.error) {
      const cacheable: FanoutResult = { ...result, usage: undefined };
      await cacheFanout(cacheHash, cacheable);
    }
    await completeAnalysisStep({
      analysisRunId: body.analysisRunId,
      step: 'fanout',
      geminiInputTokens: result.usage?.inputTokens,
      geminiOutputTokens: result.usage?.outputTokens,
      geminiCostUsd: result.usage?.costUsd,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
