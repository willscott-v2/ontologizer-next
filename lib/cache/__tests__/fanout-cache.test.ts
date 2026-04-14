import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockSupabase, type MockSupabase } from './_mock-supabase';
import type { FanoutResult } from '@/lib/types/analysis';

let mockSb: MockSupabase;
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSb.client,
}));

const fixture: FanoutResult = {
  analysis: 'Query: foo\nCoverage: Yes',
  chunksExtracted: 4,
  chunks: [{ type: 'section', heading: 'About', content: 'info' }],
};

describe('fanout-cache', () => {
  beforeEach(() => {
    mockSb = createMockSupabase();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-role-key';
    vi.resetModules();
  });

  it('returns null on cache miss', async () => {
    const { getCachedFanout } = await import('../fanout-cache');
    mockSb.queueResponse({ data: null, error: null });

    const result = await getCachedFanout('abc123');
    expect(result).toBeNull();
  });

  it('returns stored result on hit', async () => {
    const { getCachedFanout } = await import('../fanout-cache');
    mockSb.queueResponse({ data: { result: fixture }, error: null });

    const result = await getCachedFanout('abc123');
    expect(result).toEqual(fixture);

    const select = mockSb.queries.find((q) => q.op === 'select');
    expect(select?.table).toBe('fanout_cache');
  });

  it('cacheFanout upserts with 1hr TTL and onConflict=content_hash', async () => {
    const { cacheFanout } = await import('../fanout-cache');

    const before = Date.now();
    await cacheFanout('abc123', fixture);
    const after = Date.now();

    const upsert = mockSb.queries.find((q) => q.op === 'upsert');
    expect(upsert).toBeDefined();
    expect(upsert!.table).toBe('fanout_cache');
    expect(upsert!.onConflict).toBe('content_hash');

    const payload = upsert!.payload as Record<string, unknown>;
    expect(payload.content_hash).toBe('abc123');
    expect(payload.result).toEqual(fixture);

    const expires = new Date(payload.expires_at as string).getTime();
    expect(expires - before).toBeGreaterThan(59 * 60 * 1000);
    expect(expires - after).toBeLessThan(61 * 60 * 1000);
  });

  it('is a no-op when contentHash is empty', async () => {
    const { getCachedFanout, cacheFanout } = await import('../fanout-cache');
    expect(await getCachedFanout('')).toBeNull();
    await cacheFanout('', fixture);
    expect(mockSb.queries).toHaveLength(0);
  });
});
