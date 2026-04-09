/**
 * Fetches a webpage's HTML content with timeout and error handling.
 * Ported from PHP fetch_webpage() (lines 258-296).
 */

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MAX_BODY_SIZE = 5_000_000; // 5 MB

export async function fetchWebpage(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

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

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    let html = await response.text();

    // Truncate if the body exceeds the size limit
    if (html.length > MAX_BODY_SIZE) {
      html = html.slice(0, MAX_BODY_SIZE);
    }

    return html;
  } finally {
    clearTimeout(timeout);
  }
}
