/**
 * Fetches a webpage's HTML content with timeout and error handling.
 * Ported from PHP fetch_webpage() (lines 258-296).
 *
 * Wraps the HTTP fetch in a Supabase-backed URL cache (1hr TTL) keyed by
 * md5(normalized URL). Cache hits return the stored raw HTML and the
 * previously-computed content hash; misses do the real fetch and upsert.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MAX_BODY_SIZE = 5_000_000; // 5 MB
const URL_CACHE_TTL_HOURS = 1;

export interface FetchResult {
  html: string;
  contentHash: string;
  cached: boolean;
}

export interface FetchOptions {
  clearCache?: boolean;
}

function getServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function normalizeUrl(url: string): string {
  return url.trim().toLowerCase();
}

export function hashUrlForCache(url: string): string {
  return createHash('md5').update(normalizeUrl(url)).digest('hex');
}

export function hashContent(text: string): string {
  return createHash('md5').update(text).digest('hex');
}

/**
 * Collapse HTML into a normalized text blob used for the content hash.
 * Strips tags, collapses whitespace. Not a full DOM parse — we want this
 * cheap and deterministic. The hash just needs to be stable for identical
 * content fetched twice.
 */
function cleanedTextForHash(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function readFromUrlCache(
  supabase: SupabaseClient,
  urlHash: string,
): Promise<{ raw_html: string; content_hash: string } | null> {
  const { data, error } = await supabase
    .from('url_cache')
    .select('raw_html, content_hash')
    .eq('url', urlHash)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error || !data) return null;
  return data as { raw_html: string; content_hash: string };
}

async function incrementUrlCacheHit(
  supabase: SupabaseClient,
  urlHash: string,
): Promise<void> {
  // Best-effort increment. Read-then-write; fine for a low-contention counter.
  const { data } = await supabase
    .from('url_cache')
    .select('hit_count')
    .eq('url', urlHash)
    .maybeSingle();

  const current = (data?.hit_count as number | undefined) ?? 0;
  await supabase
    .from('url_cache')
    .update({ hit_count: current + 1 })
    .eq('url', urlHash);
}

async function writeUrlCache(
  supabase: SupabaseClient,
  params: {
    urlHash: string;
    html: string;
    contentHash: string;
    statusCode: number;
    contentType: string | null;
    contentLength: number;
  },
): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + URL_CACHE_TTL_HOURS);

  await supabase.from('url_cache').upsert(
    {
      url: params.urlHash,
      raw_html: params.html,
      cleaned_text: null,
      title: null,
      meta_description: null,
      content_hash: params.contentHash,
      status_code: params.statusCode,
      content_type: params.contentType,
      content_length: params.contentLength,
      expires_at: expiresAt.toISOString(),
      hit_count: 0,
    },
    { onConflict: 'url' },
  );
}

/**
 * Fetch a webpage's HTML, using url_cache when available.
 *
 * Returns { html, contentHash, cached } so downstream pipeline steps can
 * key content-addressed caches (extraction, fanout) off the same hash.
 */
export async function fetchWebpage(
  url: string,
  options: FetchOptions = {},
): Promise<FetchResult> {
  const { clearCache = false } = options;
  const supabase = getServiceClient();
  const urlHash = hashUrlForCache(url);

  // Cache read (skipped when clearCache is true)
  if (supabase && !clearCache) {
    const cached = await readFromUrlCache(supabase, urlHash);
    if (cached) {
      incrementUrlCacheHit(supabase, urlHash).catch(() => {});
      return {
        html: cached.raw_html,
        contentHash: cached.content_hash,
        cached: true,
      };
    }
  }

  // Cache miss (or forced refresh) — do the real HTTP fetch
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  let html: string;
  let statusCode = 0;
  let contentType: string | null = null;

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });

    statusCode = response.status;
    contentType = response.headers.get('content-type');

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    html = await response.text();

    // Truncate if the body exceeds the size limit
    if (html.length > MAX_BODY_SIZE) {
      html = html.slice(0, MAX_BODY_SIZE);
    }
  } finally {
    clearTimeout(timeout);
  }

  const contentHash = hashContent(cleanedTextForHash(html));

  // Cache write always happens (even on clearCache=true) to keep cache warm
  if (supabase) {
    writeUrlCache(supabase, {
      urlHash,
      html,
      contentHash,
      statusCode,
      contentType,
      contentLength: html.length,
    }).catch(() => {});
  }

  return { html, contentHash, cached: false };
}
