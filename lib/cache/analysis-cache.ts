import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const ANALYSIS_CACHE_TTL_HOURS = 1;

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function hashUrl(url: string): string {
  return createHash('md5').update(url.toLowerCase().trim()).digest('hex');
}

export async function getCachedAnalysis(url: string): Promise<Record<string, unknown> | null> {
  const supabase = getServiceClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from('analysis_cache')
    .select('result')
    .eq('url_hash', hashUrl(url))
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (!data) return null;
  return (data.result ?? null) as Record<string, unknown> | null;
}

export async function cacheAnalysis(url: string, result: Record<string, unknown>): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) return;

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + ANALYSIS_CACHE_TTL_HOURS);

  await supabase.from('analysis_cache').upsert(
    {
      url_hash: hashUrl(url),
      url,
      result,
      expires_at: expiresAt.toISOString(),
    },
    { onConflict: 'url_hash' }
  );
}
