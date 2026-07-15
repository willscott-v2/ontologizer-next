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
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MAX_BODY_SIZE = 5_000_000; // 5 MB
const MAX_REDIRECTS = 5;
const URL_CACHE_TTL_HOURS = 1;

export interface FetchResult {
  html: string;
  contentHash: string;
  cached: boolean;
  finalUrl: string;
  redirectCount: number;
  contentType: string | null;
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
  const parsed = new URL(url.trim());
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();
  parsed.hash = '';
  if (
    (parsed.protocol === 'https:' && parsed.port === '443') ||
    (parsed.protocol === 'http:' && parsed.port === '80')
  ) {
    parsed.port = '';
  }
  return parsed.toString();
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

function isPrivateOrReservedIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value))) {
    return true;
  }

  const [a, b, c] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

export function isPrivateOrReservedIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isPrivateOrReservedIpv4(address);
  if (version !== 6) return true;

  const normalized = address.toLowerCase();
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    return mapped.includes('.') ? isPrivateOrReservedIpv4(mapped) : true;
  }

  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith('ff') ||
    normalized.startsWith('2001:db8:')
  );
}

export async function validatePublicUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('Enter a valid webpage URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only HTTP and HTTPS webpage URLs are supported.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('URLs containing credentials are not supported.');
  }

  const hostname = parsed.hostname
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^\[|\]$/g, '');
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('Private or local network URLs are not supported.');
  }

  const literalVersion = isIP(hostname);
  let addresses: Array<{ address: string }>;
  try {
    addresses = literalVersion
      ? [{ address: hostname }]
      : await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('The webpage hostname could not be resolved.');
  }

  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isPrivateOrReservedIp(address))
  ) {
    throw new Error('Private or reserved network URLs are not supported.');
  }

  return parsed;
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

async function readHtmlBody(response: Response): Promise<string> {
  if (!response.body) {
    const fallback = await response.text();
    if (Buffer.byteLength(fallback, 'utf8') > MAX_BODY_SIZE) {
      throw new Error('The webpage is larger than the 5 MB analysis limit.');
    }
    return fallback;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytesRead = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > MAX_BODY_SIZE) {
      await reader.cancel();
      throw new Error('The webpage is larger than the 5 MB analysis limit.');
    }
    chunks.push(decoder.decode(value, { stream: true }));
  }

  chunks.push(decoder.decode());
  return chunks.join('');
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
  const validatedUrl = await validatePublicUrl(url);
  const supabase = getServiceClient();
  const urlHash = hashUrlForCache(validatedUrl.toString());

  // Cache read (skipped when clearCache is true)
  if (supabase && !clearCache) {
    const cached = await readFromUrlCache(supabase, urlHash);
    if (cached) {
      incrementUrlCacheHit(supabase, urlHash).catch(() => {});
      return {
        html: cached.raw_html,
        contentHash: cached.content_hash,
        cached: true,
        finalUrl: validatedUrl.toString(),
        redirectCount: 0,
        contentType: 'text/html',
      };
    }
  }

  // Cache miss (or forced refresh) — do the real HTTP fetch
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  let html = '';
  let statusCode = 0;
  let contentType: string | null = null;
  let finalUrl = validatedUrl.toString();
  let redirectCount = 0;

  try {
    let currentUrl = validatedUrl;
    let response: Response | null = null;

    for (let redirectAttempt = 0; redirectAttempt <= MAX_REDIRECTS; redirectAttempt += 1) {
      response = await fetch(currentUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml;q=0.9',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'manual',
      });

      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      if (redirectAttempt === MAX_REDIRECTS) {
        throw new Error(`The webpage redirected more than ${MAX_REDIRECTS} times.`);
      }

      const location = response.headers.get('location');
      if (!location) throw new Error('The webpage returned an invalid redirect.');
      currentUrl = await validatePublicUrl(new URL(location, currentUrl).toString());
      redirectCount = redirectAttempt + 1;
    }

    if (!response) throw new Error('The webpage did not return a response.');

    statusCode = response.status;
    contentType = response.headers.get('content-type');

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const mediaType = contentType?.split(';', 1)[0].trim().toLowerCase();
    if (mediaType && !['text/html', 'application/xhtml+xml'].includes(mediaType)) {
      throw new Error(`Unsupported content type: ${mediaType}`);
    }

    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_SIZE) {
      throw new Error('The webpage is larger than the 5 MB analysis limit.');
    }

    finalUrl = currentUrl.toString();
    html = await readHtmlBody(response);
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

  return {
    html,
    contentHash,
    cached: false,
    finalUrl,
    redirectCount,
    contentType,
  };
}
