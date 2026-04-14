import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockSupabase, type MockSupabase } from './_mock-supabase';

// Mock @supabase/supabase-js before importing the cache module
let mockSb: MockSupabase;
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSb.client,
}));

describe('analysis-cache', () => {
  beforeEach(() => {
    mockSb = createMockSupabase();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-role-key';
    vi.resetModules();
  });

  it('url_hash is a stable md5 of normalized URL', async () => {
    const { getCachedAnalysis } = await import('../analysis-cache');

    mockSb.queueResponse({ data: null, error: null });
    await getCachedAnalysis('https://Example.com/Foo');

    mockSb.queueResponse({ data: null, error: null });
    await getCachedAnalysis('https://example.com/Foo');

    // Two calls, both to analysis_cache, eq on url_hash
    const selects = mockSb.queries.filter((q) => q.op === 'select');
    expect(selects).toHaveLength(2);
    const hashA = selects[0].filters.find((f) => f.method === 'eq')?.args[1];
    const hashB = selects[1].filters.find((f) => f.method === 'eq')?.args[1];
    expect(hashA).toBeTypeOf('string');
    expect((hashA as string).length).toBe(32);
    // Note: we normalize case differently than hashUrlForCache — analysis-cache
    // lowercases but preserves path casing after lowercase(). Either way, both
    // inputs lowercase to the same string, so hashes must match.
    expect(hashA).toBe(hashB);
  });

  it('returns null on cache miss', async () => {
    const { getCachedAnalysis } = await import('../analysis-cache');
    mockSb.queueResponse({ data: null, error: null });

    const result = await getCachedAnalysis('https://example.com');
    expect(result).toBeNull();
  });

  it('returns result data on cache hit', async () => {
    const { getCachedAnalysis } = await import('../analysis-cache');
    const stored = { entities: [], jsonLd: {}, fake: true };
    mockSb.queueResponse({ data: { result: stored }, error: null });

    const result = await getCachedAnalysis('https://example.com');
    expect(result).toEqual(stored);
  });

  it('filters by expires_at > now()', async () => {
    const { getCachedAnalysis } = await import('../analysis-cache');
    mockSb.queueResponse({ data: null, error: null });

    await getCachedAnalysis('https://example.com');

    const select = mockSb.queries.find((q) => q.op === 'select');
    const gt = select?.filters.find((f) => f.method === 'gt');
    expect(gt?.args[0]).toBe('expires_at');
    // ISO string within 2s of now
    const when = new Date(gt!.args[1] as string).getTime();
    expect(Math.abs(when - Date.now())).toBeLessThan(2000);
  });

  it('cacheAnalysis upserts with 1hr TTL and onConflict=url_hash', async () => {
    const { cacheAnalysis } = await import('../analysis-cache');

    const before = Date.now();
    await cacheAnalysis('https://example.com/page', { foo: 'bar' });
    const after = Date.now();

    const upsert = mockSb.queries.find((q) => q.op === 'upsert');
    expect(upsert).toBeDefined();
    expect(upsert!.table).toBe('analysis_cache');
    expect(upsert!.onConflict).toBe('url_hash');

    const payload = upsert!.payload as Record<string, unknown>;
    expect(payload.url).toBe('https://example.com/page');
    expect(payload.result).toEqual({ foo: 'bar' });
    expect((payload.url_hash as string).length).toBe(32);

    // expires_at is between +59min and +61min (accounting for test jitter)
    const expires = new Date(payload.expires_at as string).getTime();
    expect(expires - before).toBeGreaterThan(59 * 60 * 1000);
    expect(expires - after).toBeLessThan(61 * 60 * 1000);
  });

  it('is a no-op when Supabase env vars are missing', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { getCachedAnalysis, cacheAnalysis } = await import('../analysis-cache');

    const res = await getCachedAnalysis('https://example.com');
    expect(res).toBeNull();
    await cacheAnalysis('https://example.com', { x: 1 });
    expect(mockSb.queries).toHaveLength(0);
  });
});
