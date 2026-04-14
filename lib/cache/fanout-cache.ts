/**
 * Content-hash keyed cache for Gemini fan-out analysis results.
 * 1hr TTL. Shared across users.
 *
 * Key: md5 of the cleaned page text (same hash used by url_cache +
 * extraction_cache).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { FanoutResult } from '@/lib/types/analysis';

const FANOUT_CACHE_TTL_HOURS = 1;

function getServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function getCachedFanout(
  contentHash: string,
): Promise<FanoutResult | null> {
  const supabase = getServiceClient();
  if (!supabase || !contentHash) return null;

  const { data, error } = await supabase
    .from('fanout_cache')
    .select('result')
    .eq('content_hash', contentHash)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error || !data) return null;
  return (data.result ?? null) as FanoutResult | null;
}

export async function cacheFanout(
  contentHash: string,
  result: FanoutResult,
): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase || !contentHash) return;

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + FANOUT_CACHE_TTL_HOURS);

  await supabase.from('fanout_cache').upsert(
    {
      content_hash: contentHash,
      result,
      expires_at: expiresAt.toISOString(),
    },
    { onConflict: 'content_hash' },
  );
}
