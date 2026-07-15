import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import type { EnrichedEntity } from '@/lib/types/entities';
import { ENRICHMENT_VERSION } from '@/lib/analysis/version';

const ENTITY_CACHE_TTL_DAYS = 7;

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export function hashEntity(name: string, mainTopic: string): string {
  const signature = [
    ENRICHMENT_VERSION,
    name.toLowerCase().trim().replace(/\s+/g, ' '),
    mainTopic.toLowerCase().trim().replace(/\s+/g, ' '),
  ].join('|');
  return createHash('md5').update(signature).digest('hex');
}

export async function getCachedEntity(
  name: string,
  mainTopic: string,
): Promise<EnrichedEntity | null> {
  const supabase = getServiceClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from('entity_cache')
    .select('data')
    .eq('entity_hash', hashEntity(name, mainTopic))
    .gt('expires_at', new Date().toISOString())
    .single();

  return data?.data as EnrichedEntity | null;
}

export async function getCachedEntities(
  names: string[],
  mainTopic: string,
): Promise<Map<string, EnrichedEntity>> {
  const supabase = getServiceClient();
  const result = new Map<string, EnrichedEntity>();
  if (!supabase || names.length === 0) return result;

  const hashes = names.map((n) => hashEntity(n, mainTopic));

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

export async function cacheEntity(
  entity: EnrichedEntity,
  mainTopic: string,
): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) return;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ENTITY_CACHE_TTL_DAYS);

  await supabase.from('entity_cache').upsert(
    {
      entity_hash: hashEntity(entity.name, mainTopic),
      entity_name: entity.name.toLowerCase(),
      data: entity,
      expires_at: expiresAt.toISOString(),
    },
    { onConflict: 'entity_hash' }
  );
}

export async function cacheEntities(
  entities: EnrichedEntity[],
  mainTopic: string,
): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase || entities.length === 0) return;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ENTITY_CACHE_TTL_DAYS);

  const rows = entities.map((e) => ({
    entity_hash: hashEntity(e.name, mainTopic),
    entity_name: e.name.toLowerCase(),
    data: e,
    expires_at: expiresAt.toISOString(),
  }));

  await supabase.from('entity_cache').upsert(rows, { onConflict: 'entity_hash' });
}
