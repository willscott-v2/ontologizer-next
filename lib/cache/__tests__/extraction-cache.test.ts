import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockSupabase, type MockSupabase } from './_mock-supabase';
import type { RawEntity } from '@/lib/types/entities';

let mockSb: MockSupabase;
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSb.client,
}));

const fixture = {
  entities: [{ name: 'OpenAI', type: 'Organization' as const }] as RawEntity[],
  mainTopic: 'AI platforms',
  mainTopicConfidence: 0.9,
  tokenUsage: 1200,
  costUsd: 0.03,
};

describe('extraction-cache', () => {
  beforeEach(() => {
    mockSb = createMockSupabase();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-role-key';
    vi.resetModules();
  });

  it('returns null on cache miss', async () => {
    const { getCachedExtraction } = await import('../extraction-cache');
    mockSb.queueResponse({ data: null, error: null });

    const result = await getCachedExtraction('abc123');
    expect(result).toBeNull();
  });

  it('returns cached data on hit', async () => {
    const { getCachedExtraction } = await import('../extraction-cache');
    mockSb.queueResponse({ data: { data: fixture }, error: null });

    const result = await getCachedExtraction('abc123');
    expect(result).toEqual(fixture);

    const select = mockSb.queries.find((q) => q.op === 'select');
    expect(select?.table).toBe('extraction_cache');
    const eq = select?.filters.find((f) => f.method === 'eq');
    expect(eq?.args).toEqual(['content_hash', 'abc123']);
  });

  it('returns null when contentHash is empty (no query issued)', async () => {
    const { getCachedExtraction } = await import('../extraction-cache');
    const result = await getCachedExtraction('');
    expect(result).toBeNull();
    expect(mockSb.queries).toHaveLength(0);
  });

  it('cacheExtraction upserts with 24hr TTL and onConflict=content_hash', async () => {
    const { cacheExtraction } = await import('../extraction-cache');

    const before = Date.now();
    await cacheExtraction('abc123', fixture);
    const after = Date.now();

    const upsert = mockSb.queries.find((q) => q.op === 'upsert');
    expect(upsert).toBeDefined();
    expect(upsert!.table).toBe('extraction_cache');
    expect(upsert!.onConflict).toBe('content_hash');

    const payload = upsert!.payload as Record<string, unknown>;
    expect(payload.content_hash).toBe('abc123');
    expect(payload.data).toEqual(fixture);

    const expires = new Date(payload.expires_at as string).getTime();
    // 24 hours = 86_400_000ms
    expect(expires - before).toBeGreaterThan(23.9 * 60 * 60 * 1000);
    expect(expires - after).toBeLessThan(24.1 * 60 * 60 * 1000);
  });

  it('cacheExtraction is a no-op when contentHash is empty', async () => {
    const { cacheExtraction } = await import('../extraction-cache');
    await cacheExtraction('', fixture);
    expect(mockSb.queries).toHaveLength(0);
  });

  it('is a no-op when Supabase env vars are missing', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { getCachedExtraction, cacheExtraction } = await import(
      '../extraction-cache'
    );

    const res = await getCachedExtraction('abc123');
    expect(res).toBeNull();
    await cacheExtraction('abc123', fixture);
    expect(mockSb.queries).toHaveLength(0);
  });
});
