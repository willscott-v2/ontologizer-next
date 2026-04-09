import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import type { EnrichedEntity } from '@/lib/types/entities';

const ENTITY_CACHE_TTL_DAYS = 7;

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function hashEntity(name: string): string {
  return createHash('md5').update(name.toLowerCase().trim()).digest('hex');
}

export async function getCachedEntity(name: string): Promise<EnrichedEntity | null> {
  const supabase = getServiceClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from('entity_cache')
    .select('data')
    .eq('entity_hash', hashEntity(name))
    .gt('expires_at', new Date().toISOString())
    .single();

  return data?.data as EnrichedEntity | null;
}

export async function getCachedEntities(names: string[]): Promise<Map<string, EnrichedEntity>> {
  const supabase = getServiceClient();
  const result = new Map<string, EnrichedEntity>();
  if (!supabase || names.length === 0) return result;

  const hashes = names.map((n) => hashEntity(n));

  const { data } = await supabase
    .from('entity_cache')
    .select('entity_name, data')
    .in('entity_hash', hashes)
    .gt('expires_at', new Date().toISOString());

  if (data) {
    for (const row of data) {
      result.set(row.entity_name.toLowerCase(), row.data as EnrichedEntity);
    }
  }
  return result;
}

export async function cacheEntity(entity: EnrichedEntity): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) return;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ENTITY_CACHE_TTL_DAYS);

  await supabase.from('entity_cache').upsert(
    {
      entity_hash: hashEntity(entity.name),
      entity_name: entity.name.toLowerCase(),
      data: entity,
      expires_at: expiresAt.toISOString(),
    },
    { onConflict: 'entity_hash' }
  );
}

export async function cacheEntities(entities: EnrichedEntity[]): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase || entities.length === 0) return;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ENTITY_CACHE_TTL_DAYS);

  const rows = entities.map((e) => ({
    entity_hash: hashEntity(e.name),
    entity_name: e.name.toLowerCase(),
    data: e,
    expires_at: expiresAt.toISOString(),
  }));

  await supabase.from('entity_cache').upsert(rows, { onConflict: 'entity_hash' });
}
