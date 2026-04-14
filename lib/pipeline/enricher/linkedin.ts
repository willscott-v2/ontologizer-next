/**
 * LinkedIn URL enricher.
 *
 * Scans the *source page* for LinkedIn profile links and tries to match one
 * to a named person. The disambiguation signal is the page itself — if the
 * page has a link to a LinkedIn profile and the anchor text, aria-label, or
 * surrounding copy contains the person's name, that's high-confidence the
 * right person. We don't try to guess a profile URL; no match → null.
 */

import * as cheerio from 'cheerio';

const LINKEDIN_PROFILE_RE = /linkedin\.com\/in\/[A-Za-z0-9_.-]+/i;
const LINKEDIN_COMPANY_RE = /linkedin\.com\/company\/[A-Za-z0-9_.-]+/i;

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function nameAppearsIn(name: string, haystack: string): boolean {
  const hNorm = normalize(haystack);
  const nNorm = normalize(name);
  if (!hNorm || !nNorm) return false;
  if (hNorm.includes(nNorm)) return true;

  // Match on slug-ified version: "will-scott" against anchor "willscott"
  const slug = nNorm.replace(/\s+/g, '');
  return hNorm.replace(/\s+/g, '').includes(slug);
}

function looksLikePersonName(name: string): boolean {
  return /^[A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+/.test(name.trim());
}

/**
 * Try to find a LinkedIn profile URL for a named person by inspecting the
 * source HTML. Returns null if no high-confidence match exists.
 */
export function findLinkedInFromHtml(
  name: string,
  htmlContent: string,
): string | null {
  if (!htmlContent || !name) return null;
  if (!looksLikePersonName(name)) return null;

  const $ = cheerio.load(htmlContent);

  let best: { url: string; score: number } | null = null;

  $('a[href*="linkedin.com/in/"]').each((_i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const profileMatch = href.match(LINKEDIN_PROFILE_RE);
    if (!profileMatch) return;

    const url = new URL(
      profileMatch[0].startsWith('http') ? profileMatch[0] : `https://${profileMatch[0]}`,
    )
      .toString()
      .split('?')[0]
      .replace(/\/$/, '');

    let score = 0;

    const anchorText = $(el).text();
    const aria = $(el).attr('aria-label') || '';
    const title = $(el).attr('title') || '';

    // Strongest signal: anchor text or aria-label mentions the person
    if (nameAppearsIn(name, anchorText)) score += 80;
    if (nameAppearsIn(name, aria)) score += 60;
    if (nameAppearsIn(name, title)) score += 50;

    // URL slug contains person name
    if (nameAppearsIn(name, url)) score += 40;

    // Parent element context (e.g., bio card containing name + socials)
    const parentText = $(el).parent().text();
    if (parentText && parentText.length < 600 && nameAppearsIn(name, parentText)) {
      score += 30;
    }

    // Grandparent (author card patterns)
    const grandparentText = $(el).parent().parent().text();
    if (
      grandparentText &&
      grandparentText.length < 1200 &&
      nameAppearsIn(name, grandparentText)
    ) {
      score += 15;
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { url, score };
    }
  });

  // Require a strong signal (anchor/aria/title or URL slug match)
  if (best && (best as { url: string; score: number }).score >= 40) {
    return (best as { url: string; score: number }).url;
  }
  return null;
}

/** Variant for Organization entities — matches a /company/ LinkedIn URL. */
export function findLinkedInCompanyFromHtml(
  name: string,
  htmlContent: string,
): string | null {
  if (!htmlContent || !name) return null;

  const $ = cheerio.load(htmlContent);
  let best: { url: string; score: number } | null = null;

  $('a[href*="linkedin.com/company/"]').each((_i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const m = href.match(LINKEDIN_COMPANY_RE);
    if (!m) return;

    const url = `https://${m[0]}`.split('?')[0].replace(/\/$/, '');
    let score = 0;

    const anchorText = $(el).text();
    if (nameAppearsIn(name, anchorText)) score += 80;
    if (nameAppearsIn(name, url)) score += 40;

    const parentText = $(el).parent().text();
    if (parentText && parentText.length < 600 && nameAppearsIn(name, parentText)) {
      score += 20;
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { url, score };
    }
  });

  if (best && (best as { url: string; score: number }).score >= 40) {
    return (best as { url: string; score: number }).url;
  }
  return null;
}
