/**
 * POST /api/analyze/log
 *
 * Fire-and-forget audit logging of analysis runs. Called by the
 * useAnalysis hook on every exit: successful completion (fresh or
 * cache-hit) AND pipeline failures. Anonymous BYOK users are logged with
 * user_id=null. Completed runs include the full result payload and token
 * usage/cost totals.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { logAnalysis } from '@/lib/metering/usage-tracker';
import { createClient } from '@/lib/supabase/server';

interface LogBody {
  url?: string;
  analysisType?: 'full' | 'fanout_only' | 'paste';
  keySource?: 'byok' | 'free_tier';
  entitiesFound?: number;
  processingTimeMs?: number;
  status?: 'complete' | 'failed';
  errorStep?: 'extract' | 'enrich' | 'generate';
  errorMessage?: string;
  result?: Record<string, unknown>;
  openaiInputTokens?: number;
  openaiOutputTokens?: number;
  openaiCostUsd?: number;
  geminiInputTokens?: number;
  geminiOutputTokens?: number;
  geminiCostUsd?: number;
  totalCostUsd?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as LogBody;

    if (!body.analysisType || !body.keySource) return NextResponse.json({ ok: true });

    let userId: string | undefined;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) userId = user.id;
    } catch {
      // Supabase unavailable — log anonymously
    }

    await logAnalysis({
      userId,
      url: body.url,
      analysisType: body.analysisType,
      keySource: body.keySource,
      entitiesFound: body.entitiesFound,
      processingTimeMs: body.processingTimeMs,
      status: body.status,
      errorStep: body.errorStep,
      errorMessage: body.errorMessage,
      result: body.result,
      openaiInputTokens: body.openaiInputTokens,
      openaiOutputTokens: body.openaiOutputTokens,
      openaiCostUsd: body.openaiCostUsd,
      geminiInputTokens: body.geminiInputTokens,
      geminiOutputTokens: body.geminiOutputTokens,
      geminiCostUsd: body.geminiCostUsd,
      totalCostUsd: body.totalCostUsd,
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Never block the client on logging errors
    return NextResponse.json({ ok: true });
  }
}
