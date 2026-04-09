/**
 * Extracts structured text from HTML using cheerio.
 * Ported from PHP extract_text_from_html() (lines 353-467) and extract_headings() (lines 342-351).
 */

import * as cheerio from 'cheerio';
import type { TextParts, Heading } from '../types/analysis';

/** CSS selectors for elements to strip before extracting body text. */
const SELECTORS_TO_REMOVE = [
  'script',
  'style',
  'noscript',
  'header',
  'footer',
  'nav',
  'aside',
  'form',
  // Class/ID-based selectors matching the PHP XPath equivalents
  '[class*="sidebar"]',
  '[id*="sidebar"]',
  '[class*="comment"]',
  '[id*="comment"]',
  '[class*="nav"]',
  '[class*="footer"]',
  '[class*="header"]',
  '[id*="cookie"]',
  '[class*="cookie"]',
  '[id*="consent"]',
  '[class*="consent"]',
  '[aria-label="cookieconsent"]',
  '[class*="widget"]',
  '[class*="ad"]',
  '[class*="advertisement"]',
  '[class*="banner"]',
  '[class*="promo"]',
  '[class*="social"]',
  '[class*="share"]',
  '[class*="related"]',
  '[class*="popular"]',
  '[class*="trending"]',
  '[class*="sponsored"]',
  '[id*="widget"]',
  '[id*="ad"]',
];

/** CSS selectors for likely main-content containers, ordered by specificity. */
const MAIN_CONTENT_SELECTORS = [
  'article',
  'main',
  '[role="main"]',
  '.post-content',
  '.entry-content',
  '#main',
  '.main',
  '#content',
  '.content',
];

/**
 * Extract headings (h1-h3) from the loaded cheerio document.
 * Returns them in document order with their level.
 */
function extractHeadings($: cheerio.CheerioAPI): Heading[] {
  const headings: Heading[] = [];
  $('h1, h2, h3, h4').each((_i, el) => {
    const tagName = ('tagName' in el ? (el.tagName as string) : '').toLowerCase();
    const level = parseInt(tagName.replace('h', ''), 10);
    const text = $(el).text().trim();
    if (text && !isNaN(level)) {
      headings.push({ text, level });
    }
  });
  return headings;
}

/**
 * Parse HTML and return structured text parts.
 */
export function extractTextFromHtml(html: string): TextParts {
  if (!html) {
    return { title: '', description: '', headings: [], body: '', htmlContent: '' };
  }

  const $ = cheerio.load(html);

  // Extract <title>
  let title = $('title').first().text().trim();
  // Fallback to og:title
  if (!title) {
    title = $('meta[property="og:title"]').attr('content')?.trim() ?? '';
  }

  // Extract meta description
  const description =
    $('meta[name="description"]').attr('content')?.trim() ?? '';

  // Extract headings BEFORE removing elements (headings live in the content)
  const headings = extractHeadings($);

  // Remove non-content elements
  $(SELECTORS_TO_REMOVE.join(', ')).remove();

  // Find the best main-content node (largest text length)
  let bestText = '';
  let bestLength = 0;

  for (const selector of MAIN_CONTENT_SELECTORS) {
    $(selector).each((_i, el) => {
      const text = $(el).text().trim();
      if (text.length > bestLength) {
        bestLength = text.length;
        bestText = text;
      }
    });
  }

  // Fallback to entire <body> if no main-content area matched
  if (!bestText) {
    bestText = $('body').text().trim();
  }

  // Clean up whitespace (collapse runs of whitespace to a single space)
  const body = bestText.replace(/\s+/g, ' ').trim();

  return { title, description, headings, body, htmlContent: html };
}
