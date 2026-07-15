import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockSupabase, type MockSupabase } from './_mock-supabase';

let mockSb: MockSupabase;
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSb.client,
}));
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => [{ address: '93.184.216.34', family: 4 }]),
}));

function mockFetchOnce(html: string, status = 200, contentType = 'text/html') {
  const fetchMock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'ERR',
    headers: {
      get: (k: string) => {
        if (k.toLowerCase() === 'content-type') return contentType;
        return null;
      },
    },
    text: async () => html,
  }));
  // @ts-expect-error — override for test
  globalThis.fetch = fetchMock;
  return fetchMock;
}

describe('fetcher + url_cache', () => {
  beforeEach(() => {
    mockSb = createMockSupabase();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-role-key';
    vi.resetModules();
  });

  afterEach(() => {
    // @ts-expect-error — restore
    delete globalThis.fetch;
  });

  it('cache hit: returns stored html without HTTP fetch', async () => {
    const { fetchWebpage } = await import('../../pipeline/fetcher');
    const fetchMock = mockFetchOnce('<html>live</html>');

    // First select() is the cache read — return stored data
    mockSb.queueResponse({
      data: { raw_html: '<html>cached</html>', content_hash: 'cached-hash' },
      error: null,
    });
    // hit_count read
    mockSb.queueResponse({ data: { hit_count: 7 }, error: null });

    const result = await fetchWebpage('https://example.com');

    expect(result.html).toBe('<html>cached</html>');
    expect(result.contentHash).toBe('cached-hash');
    expect(result.cached).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cache hit increments hit_count by 1', async () => {
    const { fetchWebpage } = await import('../../pipeline/fetcher');
    mockFetchOnce('<html>live</html>');

    mockSb.queueResponse({
      data: { raw_html: '<html>cached</html>', content_hash: 'h' },
      error: null,
    });
    mockSb.queueResponse({ data: { hit_count: 7 }, error: null });

    await fetchWebpage('https://example.com');
    // fire-and-forget — wait a tick for pending microtasks
    await new Promise((r) => setTimeout(r, 10));

    const updates = mockSb.queries.filter((q) => q.op === 'update');
    expect(updates.length).toBeGreaterThan(0);
    const update = updates[0];
    expect(update.table).toBe('url_cache');
    expect(update.payload).toEqual({ hit_count: 8 });
  });

  it('cache miss: fetches via HTTP and writes to url_cache', async () => {
    const { fetchWebpage } = await import('../../pipeline/fetcher');
    const fetchMock = mockFetchOnce('<html><body>hello world</body></html>');

    // Cache lookup returns nothing
    mockSb.queueResponse({ data: null, error: null });

    const result = await fetchWebpage('https://example.com');
    // allow fire-and-forget write to register
    await new Promise((r) => setTimeout(r, 10));

    expect(result.html).toBe('<html><body>hello world</body></html>');
    expect(result.cached).toBe(false);
    expect(result.contentHash).toMatch(/^[a-f0-9]{32}$/);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const upsert = mockSb.queries.find((q) => q.op === 'upsert');
    expect(upsert).toBeDefined();
    expect(upsert!.table).toBe('url_cache');
    expect(upsert!.onConflict).toBe('url');
    const payload = upsert!.payload as Record<string, unknown>;
    expect(payload.raw_html).toBe('<html><body>hello world</body></html>');
    expect(payload.content_hash).toBe(result.contentHash);
    expect(payload.status_code).toBe(200);
    expect(payload.content_type).toBe('text/html');
    expect(payload.hit_count).toBe(0);
  });

  it('clearCache=true: skips cache read but still writes', async () => {
    const { fetchWebpage } = await import('../../pipeline/fetcher');
    const fetchMock = mockFetchOnce('<html>fresh</html>');

    // Even though we'd have a cache hit available, clearCache should skip it.
    // Queue a "cache hit" response just to prove it isn't consumed.
    mockSb.queueResponse({
      data: { raw_html: '<html>cached</html>', content_hash: 'stale' },
      error: null,
    });

    const result = await fetchWebpage('https://example.com', {
      clearCache: true,
    });
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.html).toBe('<html>fresh</html>');
    expect(result.cached).toBe(false);

    // no select() should have been issued
    const selects = mockSb.queries.filter((q) => q.op === 'select');
    expect(selects).toHaveLength(0);

    // write-through DID happen
    const upsert = mockSb.queries.find((q) => q.op === 'upsert');
    expect(upsert).toBeDefined();
  });

  it('hashContent is stable across calls for same input', async () => {
    const { hashContent } = await import('../../pipeline/fetcher');
    const a = hashContent('hello world');
    const b = hashContent('hello world');
    const c = hashContent('different');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[a-f0-9]{32}$/);
  });

  it('hashUrlForCache normalizes case and whitespace', async () => {
    const { hashUrlForCache } = await import('../../pipeline/fetcher');
    expect(hashUrlForCache('https://example.com/page')).toBe(
      hashUrlForCache(' HTTPS://Example.com/page '),
    );
  });

  it('HTTP error during cache miss propagates', async () => {
    const { fetchWebpage } = await import('../../pipeline/fetcher');
    mockFetchOnce('not found', 404);
    mockSb.queueResponse({ data: null, error: null });

    await expect(fetchWebpage('https://example.com')).rejects.toThrow(
      /HTTP 404/,
    );
  });

  it('rejects private and local network targets before cache access', async () => {
    const { fetchWebpage } = await import('../../pipeline/fetcher');
    const fetchMock = mockFetchOnce('<html>private</html>');

    await expect(fetchWebpage('http://127.0.0.1/admin')).rejects.toThrow(
      /Private or reserved/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockSb.queries).toHaveLength(0);
  });

  it.each([
    'http://localhost/admin',
    'http://169.254.169.254/latest/meta-data',
    'http://10.0.0.1',
    'http://172.16.0.1',
    'http://192.168.1.1',
    'http://[::1]/',
    'http://[fd00::1]/',
  ])('rejects private target %s', async (target) => {
    const { validatePublicUrl } = await import('../../pipeline/fetcher');
    await expect(validatePublicUrl(target)).rejects.toThrow(/Private|local/);
  });

  it.each([
    'ftp://example.com/file',
    'file:///etc/passwd',
    'https://user:password@example.com',
    'not a url',
  ])('rejects unsupported or malformed target %s', async (target) => {
    const { validatePublicUrl } = await import('../../pipeline/fetcher');
    await expect(validatePublicUrl(target)).rejects.toThrow();
  });

  it('revalidates redirect targets before following them', async () => {
    const { fetchWebpage } = await import('../../pipeline/fetcher');
    mockSb.queueResponse({ data: null, error: null });
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 302,
      statusText: 'Found',
      headers: {
        get: (key: string) => key.toLowerCase() === 'location'
          ? 'http://169.254.169.254/latest/meta-data'
          : null,
      },
    }));
    // @ts-expect-error test response stub
    globalThis.fetch = fetchMock;

    await expect(fetchWebpage('https://example.com')).rejects.toThrow(/Private/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects non-HTML responses', async () => {
    const { fetchWebpage } = await import('../../pipeline/fetcher');
    mockFetchOnce('{"secret":true}', 200, 'application/json');
    mockSb.queueResponse({ data: null, error: null });

    await expect(fetchWebpage('https://example.com/data')).rejects.toThrow(
      /Unsupported content type/,
    );
  });
});
