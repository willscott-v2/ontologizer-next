import 'server-only';

import { createClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
import { ANALYSIS_VERSION } from './version';

export type AnalysisStepName = 'enrich' | 'generate' | 'fanout';

interface RunRow {
  id: string;
  user_id: string | null;
  content_hash: string | null;
  analysis_version: string | null;
  completed_steps: string[] | null;
  expires_at: string | null;
  key_source: 'byok' | 'free_tier';
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function createAnalysisRun(params: {
  user: User | null;
  url?: string;
  analysisType: 'full' | 'paste';
  keySource: 'byok' | 'free_tier';
  contentHash: string;
  entitiesFound: number;
  openaiInputTokens?: number;
  openaiOutputTokens?: number;
  openaiCostUsd?: number;
}): Promise<string | null> {
  const supabase = getServiceClient();
  if (!supabase) return null;

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('analysis_log')
    .insert({
      user_id: params.user?.id ?? null,
      url: params.url ?? null,
      analysis_type: params.analysisType,
      key_source: params.keySource,
      entities_found: params.entitiesFound,
      status: 'in_progress',
      content_hash: params.contentHash,
      analysis_version: ANALYSIS_VERSION,
      completed_steps: [],
      expires_at: expiresAt,
      openai_input_tokens: params.openaiInputTokens ?? 0,
      openai_output_tokens: params.openaiOutputTokens ?? 0,
      openai_cost_usd: params.openaiCostUsd ?? 0,
      total_cost_usd: params.openaiCostUsd ?? 0,
    })
    .select('id')
    .single();

  if (error || !data?.id) return null;
  return data.id as string;
}

export async function authorizeAnalysisStep(params: {
  analysisRunId: string;
  contentHash: string;
  step: AnalysisStepName;
  user: User | null;
  hasByokKey: boolean;
}): Promise<{ allowed: boolean; reason?: string; run?: RunRow }> {
  const supabase = getServiceClient();
  if (!supabase) {
    return params.hasByokKey
      ? { allowed: true }
      : { allowed: false, reason: 'Analysis run store is not configured.' };
  }

  const { data } = await supabase
    .from('analysis_log')
    .select('id, user_id, content_hash, analysis_version, completed_steps, expires_at, key_source')
    .eq('id', params.analysisRunId)
    .maybeSingle();

  if (!data) return { allowed: false, reason: 'Analysis run not found.' };
  const run = data as RunRow;

  if (run.content_hash !== params.contentHash) {
    return { allowed: false, reason: 'Analysis content does not match this run.' };
  }
  if (run.analysis_version !== ANALYSIS_VERSION) {
    return { allowed: false, reason: 'Analysis run version is no longer current.' };
  }
  if (run.expires_at && new Date(run.expires_at).getTime() <= Date.now()) {
    return { allowed: false, reason: 'Analysis run expired. Start a new analysis.' };
  }
  if (run.user_id && run.user_id !== params.user?.id) {
    return { allowed: false, reason: 'This analysis run belongs to another user.' };
  }
  if (!run.user_id && run.key_source !== 'byok' && !params.hasByokKey) {
    return { allowed: false, reason: 'Your API key is required for this analysis step.' };
  }
  if ((run.completed_steps ?? []).includes(params.step) && !params.hasByokKey) {
    return { allowed: false, reason: 'This analysis step has already completed.' };
  }

  return { allowed: true, run };
}

export async function completeAnalysisStep(params: {
  analysisRunId: string;
  step: AnalysisStepName;
  openaiInputTokens?: number;
  openaiOutputTokens?: number;
  openaiCostUsd?: number;
  geminiInputTokens?: number;
  geminiOutputTokens?: number;
  geminiCostUsd?: number;
}): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) return;

  const { data } = await supabase
    .from('analysis_log')
    .select('completed_steps, openai_input_tokens, openai_output_tokens, openai_cost_usd, gemini_input_tokens, gemini_output_tokens, gemini_cost_usd, total_cost_usd')
    .eq('id', params.analysisRunId)
    .maybeSingle();
  if (!data) return;

  const completed = Array.from(new Set([...(data.completed_steps ?? []), params.step]));
  const openaiCost = Number(data.openai_cost_usd ?? 0) + (params.openaiCostUsd ?? 0);
  const geminiCost = Number(data.gemini_cost_usd ?? 0) + (params.geminiCostUsd ?? 0);

  await supabase
    .from('analysis_log')
    .update({
      completed_steps: completed,
      updated_at: new Date().toISOString(),
      openai_input_tokens: Number(data.openai_input_tokens ?? 0) + (params.openaiInputTokens ?? 0),
      openai_output_tokens: Number(data.openai_output_tokens ?? 0) + (params.openaiOutputTokens ?? 0),
      openai_cost_usd: openaiCost,
      gemini_input_tokens: Number(data.gemini_input_tokens ?? 0) + (params.geminiInputTokens ?? 0),
      gemini_output_tokens: Number(data.gemini_output_tokens ?? 0) + (params.geminiOutputTokens ?? 0),
      gemini_cost_usd: geminiCost,
      total_cost_usd: openaiCost + geminiCost,
    })
    .eq('id', params.analysisRunId);
}

export async function finalizeAnalysisRun(params: {
  analysisRunId: string;
  user: User | null;
  status: 'complete' | 'failed';
  entitiesFound?: number;
  processingTimeMs?: number;
  errorStep?: string;
  errorMessage?: string;
}): Promise<boolean> {
  const supabase = getServiceClient();
  if (!supabase) return false;

  const { data } = await supabase
    .from('analysis_log')
    .select('user_id, expires_at')
    .eq('id', params.analysisRunId)
    .maybeSingle();
  if (!data) return false;
  if (data.user_id && data.user_id !== params.user?.id) return false;
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return false;

  await supabase
    .from('analysis_log')
    .update({
      status: params.status,
      entities_found: params.entitiesFound ?? 0,
      processing_time_ms: params.processingTimeMs ?? 0,
      error_step: params.errorStep ?? null,
      error_message: params.errorMessage ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.analysisRunId);

  return true;
}
