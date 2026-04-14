/**
 * Content-hash keyed cache for OpenAI entity-extraction results.
 * 24hr TTL. Shared across users.
 *
 * Key: md5 of the cleaned page text (same hash used by url_cache).
 * Value: the OpenAI-derived fields { entities, mainTopic, mainTopicConfidence,
 * tokenUsage, costUsd } — NOT the textParts, which always come from the
 * fresh fetch.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { RawEntity } from '@/lib/types/entities';

const EXTRACTION_CACHE_TTL_HOURS = 24;

export interface CachedExtraction {
  entities: RawEntity[];
  mainTopic: string;
  mainTopicConfidence: number;
  tokenUsage?: number;
  costUsd?: number;
}

function getServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function getCachedExtraction(
  contentHash: string,
): Promise<CachedExtraction | null> {
  const supabase = getServiceClient();
  if (!supabase || !contentHash) return null;

  const { data, error } = await supabase
    .from('extraction_cache')
    .select('data')
    .eq('content_hash', contentHash)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error || !data) return null;
  return (data.data ?? null) as CachedExtraction | null;
}

export async function cacheExtraction(
  contentHash: string,
  data: CachedExtraction,
): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase || !contentHash) return;

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + EXTRACTION_CACHE_TTL_HOURS);

  await supabase.from('extraction_cache').upsert(
    {
      content_hash: contentHash,
      data,
      expires_at: expiresAt.toISOString(),
    },
    { onConflict: 'content_hash' },
  );
}
