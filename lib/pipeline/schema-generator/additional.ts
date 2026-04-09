/**
 * Additional schema extraction: FAQ, HowTo, Author, Organization.
 * Ported from PHP extract_additional_schemas() and related methods (lines 2128-2921).
 *
 * Uses cheerio for HTML parsing instead of PHP's DOMDocument.
 */

import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CheerioEl = cheerio.Cheerio<AnyNode>;

// ─── Types ──────────────────────────────────────────────────────────────────

interface AdditionalSchemas {
  author: Record<string, unknown> | null;
  organization: Record<string, unknown> | null;
  faq: Record<string, unknown> | null;
  howto: Record<string, unknown> | null;
}

interface ContactInfo {
  telephone?: string;
  address?: Record<string, unknown>;
}

// ─── Main entry point ───────────────────────────────────────────────────────

/**
 * Extract all additional schema types from raw HTML.
 */
export function extractAdditionalSchemas(htmlContent: string): AdditionalSchemas {
  const result: AdditionalSchemas = {
    author: null,
    organization: null,
    faq: null,
    howto: null,
  };

  if (!htmlContent) return result;

  const $ = cheerio.load(htmlContent);

  result.author = extractAuthor($);
  result.organization = extractOrganization($);
  result.faq = extractFaq($);
  result.howto = extractHowTo($);

  return result;
}

// ─── Contact / Social helpers (used by local-business, educational) ─────────

/**
 * Extract phone and address from HTML content.
 */
export function extractContactInfo(htmlContent: string): ContactInfo {
  if (!htmlContent) return {};

  const $ = cheerio.load(htmlContent);
  const info: ContactInfo = {};

  // Phone numbers
  const text = $.text();
  const phonePatterns = [
    /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/,
    /\(\d{3}\)\s*\d{3}[-.\s]?\d{4}/,
    /\+1[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/,
  ];

  for (const pattern of phonePatterns) {
    const m = text.match(pattern);
    if (m) {
      info.telephone = m[0].trim();
      break;
    }
  }

  // Address
  const addressSelectors = [
    '[class*="address"]',
    '[id*="address"]',
    '[class*="location"]',
    '[class*="contact"]',
  ];

  for (const sel of addressSelectors) {
    const el = $(sel).first();
    if (el.length) {
      const addressText = el.text().trim();
      if (addressText.length > 10 && addressText.length < 200) {
        const parsed = parseAddress(addressText);
        if (Object.keys(parsed).length > 1) {
          info.address = parsed;
          break;
        }
      }
    }
  }

  return info;
}

/**
 * Extract social media links from HTML for sameAs arrays.
 */
export function extractSocialLinks(htmlContent: string): string[] {
  if (!htmlContent) return [];

  const $ = cheerio.load(htmlContent);
  const links: string[] = [];

  const socialDomains = [
    'facebook.com',
    'twitter.com',
    'linkedin.com',
    'instagram.com',
    'youtube.com',
    'yelp.com',
    'google.com/maps',
  ];

  for (const domain of socialDomains) {
    $(`a[href*="${domain}"]`).each((_i, el) => {
      const href = $(el).attr('href');
      if (href && isValidUrl(href)) {
        links.push(href);
      }
    });
  }

  return [...new Set(links)];
}

// ─── Author extraction ─────────────────────────────────────────────────────

function extractAuthor(
  $: cheerio.CheerioAPI,
): Record<string, unknown> | null {
  // Meta tag strategies
  const metaSelectors = [
    'meta[name="author"]',
    'meta[property="article:author"]',
    'meta[property="og:author"]',
  ];

  for (const sel of metaSelectors) {
    const content = $(sel).attr('content');
    if (content && content.trim().length > 2) {
      return { '@type': 'Person', name: content.trim() };
    }
  }

  // Element strategies
  const elementSelectors = [
    '[class*="author"]',
    '[id*="author"]',
    '[class*="byline"]',
    '[class*="writer"]',
    '[class*="contributor"]',
    '[rel="author"]',
  ];

  for (const sel of elementSelectors) {
    const el = $(sel).first();
    if (el.length) {
      const name = cleanAuthorName(el.text());
      if (name) return { '@type': 'Person', name };
    }
  }

  return null;
}

function cleanAuthorName(text: string): string | null {
  let cleaned = text.trim();
  if (!cleaned) return null;

  // Strip common prefixes
  cleaned = cleaned.replace(/^(By|Author|Written by|Contributor):?\s*/i, '').trim();

  // Take first 3 words max to avoid grabbing paragraph text
  const words = cleaned.split(/\s+/).slice(0, 3);
  const name = words.join(' ');

  if (name.length > 2 && name.length < 100) return name;
  return null;
}

// ─── Organization extraction ────────────────────────────────────────────────

function extractOrganization(
  $: cheerio.CheerioAPI,
): Record<string, unknown> | null {
  // Meta tags first
  const ogSiteName = $('meta[property="og:site_name"]').attr('content');
  if (ogSiteName && ogSiteName.trim().length > 2) {
    return { '@type': 'Organization', name: ogSiteName.trim() };
  }

  const appName = $('meta[name="application-name"]').attr('content');
  if (appName && appName.trim().length > 2) {
    return { '@type': 'Organization', name: appName.trim() };
  }

  // DOM element strategies
  const selectors = [
    '[class*="logo"]',
    '[id*="logo"]',
    '[class*="brand"]',
    '[id*="brand"]',
    '[class*="company"]',
    '[class*="organization"]',
    '[class*="site-title"]',
    '[class*="site-name"]',
  ];

  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length) {
      const text = el.text().trim();
      if (text.length > 2 && text.length < 200) {
        return { '@type': 'Organization', name: text };
      }
    }
  }

  return null;
}

// ─── FAQ extraction ─────────────────────────────────────────────────────────

function extractFaq(
  $: cheerio.CheerioAPI,
): Record<string, unknown> | null {
  const faqItems: Record<string, unknown>[] = [];

  // Strategy 1: Look for FAQ containers
  const containerSelectors = [
    '[class*="faq"]',
    '[id*="faq"]',
    '[class*="questions"]',
    '[id*="questions"]',
    '[class*="accordion"]',
    '[id*="accordion"]',
  ];

  for (const sel of containerSelectors) {
    $(sel).each((_i, container) => {
      const items = extractFaqItemsFromContainer($, $(container));
      faqItems.push(...items);
    });
  }

  // Strategy 2: Extract FAQ patterns from headings across the page
  const headingFaqs = extractFaqFromHeadings($);
  faqItems.push(...headingFaqs);

  // Deduplicate and validate
  const unique = deduplicateFaqs(faqItems);

  if (unique.length > 0) {
    return {
      '@type': 'FAQPage',
      mainEntity: unique.slice(0, 15),
    };
  }

  return null;
}

function extractFaqItemsFromContainer(
  $: cheerio.CheerioAPI,
  container: CheerioEl,
): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];

  // Find questions within the container
  const questionSelectors = [
    'h2', 'h3', 'h4', 'h5', 'h6',
    '[class*="question"]',
    '[class*="faq-question"]',
    '[class*="accordion-title"]',
    '[class*="toggle-title"]',
    '[role="button"]',
    '[aria-expanded]',
    'dt', 'strong', 'b',
  ];

  const questions: Array<{ el: CheerioEl; text: string }> = [];

  for (const sel of questionSelectors) {
    container.find(sel).each((_i, el) => {
      const text = $(el).text().trim();
      if (isValidFaqQuestion(text)) {
        questions.push({ el: $(el), text });
      }
    });
  }

  for (const { el, text } of questions) {
    const answer = findFaqAnswer($, el);
    if (answer && answer.length > 20) {
      items.push({
        '@type': 'Question',
        name: cleanFaqQuestion(text),
        acceptedAnswer: {
          '@type': 'Answer',
          text: cleanFaqAnswer(answer),
        },
      });
    }
  }

  return items;
}

function extractFaqFromHeadings(
  $: cheerio.CheerioAPI,
): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];

  $('h1, h2, h3, h4, h5, h6').each((_i, el) => {
    const text = $(el).text().trim();
    if (isValidFaqQuestion(text)) {
      const answer = findFaqAnswer($, $(el));
      if (answer && answer.length > 50) {
        items.push({
          '@type': 'Question',
          name: cleanFaqQuestion(text),
          acceptedAnswer: {
            '@type': 'Answer',
            text: cleanFaqAnswer(answer),
          },
        });
      }
    }
  });

  return items;
}

function isValidFaqQuestion(text: string): boolean {
  if (!text || text.length < 10 || text.length > 300) return false;

  const questionPatterns = [
    /\b(what|how|why|when|where|who|which|can|could|should|would|will|is|are|do|does|did)\b/i,
    /\?$/,
    /^Q:/i,
    /^Question:/i,
  ];

  return questionPatterns.some((p) => p.test(text));
}

function cleanFaqQuestion(text: string): string {
  let cleaned = text.replace(/^(Q:|Question:|FAQ:|#\d+\.?)\s*/i, '').trim();

  // Add question mark if it looks like a question but doesn't have one
  if (
    !/[?!.]$/.test(cleaned) &&
    /\b(what|how|why|when|where|who|which|can|could|should|would|will|is|are|do|does|did)\b/i.test(
      cleaned,
    )
  ) {
    cleaned += '?';
  }

  return cleaned;
}

function cleanFaqAnswer(text: string): string {
  let cleaned = text.replace(/^(A:|Answer:|Response:)\s*/i, '').trim();
  cleaned = cleaned.replace(/\s+/g, ' ');

  // Truncate at 1500 chars
  if (cleaned.length > 1500) {
    const truncated = cleaned.slice(0, 1500);
    const lastPeriod = truncated.lastIndexOf('.');
    if (lastPeriod > 1000) {
      cleaned = truncated.slice(0, lastPeriod + 1);
    } else {
      cleaned = truncated + '...';
    }
  }

  return cleaned;
}

function findFaqAnswer(
  $: cheerio.CheerioAPI,
  questionEl: CheerioEl,
): string | null {
  // Strategy 1: Accordion / collapse content
  const accordionSelectors = [
    '~ [class*="collapse"]',
    '~ [class*="accordion-content"]',
    '~ [class*="answer"]',
    '~ [class*="faq-answer"]',
  ];

  for (const sel of accordionSelectors) {
    const answer = questionEl.find(sel).first();
    if (answer.length) {
      const text = answer.text().trim();
      if (text.length > 20) return text;
    }
  }

  // Strategy 2: Next sibling elements
  let next = questionEl.next();
  for (let i = 0; i < 3 && next.length; i++) {
    const tagName = (next.prop('tagName') || '').toLowerCase();
    // Stop at next heading
    if (/^h[1-6]$/.test(tagName)) break;

    const text = next.text().trim();
    if (text.length > 20) return text;
    next = next.next();
  }

  // Strategy 3: Parent's next children after the question
  const parent = questionEl.parent();
  if (parent.length) {
    const children = parent.children().toArray();
    let foundQuestion = false;
    for (const child of children) {
      if ($(child).is(questionEl)) {
        foundQuestion = true;
        continue;
      }
      if (foundQuestion) {
        const text = $(child).text().trim();
        if (text.length > 20) return text;
      }
    }
  }

  return null;
}

function deduplicateFaqs(
  items: Record<string, unknown>[],
): Record<string, unknown>[] {
  const seen = new Set<string>();
  const unique: Record<string, unknown>[] = [];

  for (const item of items) {
    const question = ((item.name as string) || '').toLowerCase().trim();
    if (seen.has(question)) continue;

    const answer = (
      (item.acceptedAnswer as Record<string, string>)?.text || ''
    ).trim();

    // Skip low-quality answers
    if (answer.length < 20 || /^(yes|no|maybe|ok|sure)\.?$/i.test(answer)) {
      continue;
    }

    seen.add(question);
    unique.push(item);
  }

  return unique;
}

// ─── HowTo extraction ──────────────────────────────────────────────────────

function extractHowTo(
  $: cheerio.CheerioAPI,
): Record<string, unknown> | null {
  // Strategy 1: Find HowTo containers
  const containerSelectors = [
    '[class*="how-to"]',
    '[id*="how-to"]',
    '[class*="howto"]',
    '[id*="howto"]',
    '[class*="tutorial"]',
    '[id*="tutorial"]',
    '[class*="guide"]',
    '[id*="guide"]',
    '[class*="instructions"]',
    '[id*="instructions"]',
    '[class*="steps"]',
    '[id*="steps"]',
  ];

  for (const sel of containerSelectors) {
    const container = $(sel).first();
    if (container.length) {
      const howto = extractHowToFromContainer($, container);
      if (howto) return howto;
    }
  }

  // Strategy 2: Detect from page structure
  return extractHowToFromPageStructure($);
}

function extractHowToFromContainer(
  $: cheerio.CheerioAPI,
  container: CheerioEl,
): Record<string, unknown> | null {
  // Find title
  let title = '';
  const titleSelectors = ['h1', 'h2', 'h3', '[class*="title"]', '[class*="heading"]'];
  for (const sel of titleSelectors) {
    const el = container.find(sel).first();
    if (el.length) {
      title = el.text().trim();
      break;
    }
  }

  if (!title) {
    const pageTitle = $('title').text().trim();
    const howToMatch = pageTitle.match(/how\s+to\s+(.+)/i);
    if (howToMatch) {
      title = 'How to ' + howToMatch[1];
    } else {
      title = 'How-to Guide';
    }
  }

  // Find description
  let description = '';
  const descSelectors = [
    '[class*="description"]',
    '[class*="intro"]',
    '[class*="overview"]',
  ];
  for (const sel of descSelectors) {
    const el = container.find(sel).first();
    if (el.length) {
      const text = el.text().trim();
      if (text.length > 30) {
        description = text;
        break;
      }
    }
  }
  if (!description) {
    const firstP = container.find('p').first();
    if (firstP.length) {
      const text = firstP.text().trim();
      if (text.length > 30) description = text;
    }
  }

  // Extract steps
  const steps = extractSteps($, container);
  if (steps.length === 0) return null;

  const howto: Record<string, unknown> = {
    '@type': 'HowTo',
    name: title,
    step: steps,
  };

  if (description) howto.description = description;

  // Extract time info
  const timeInfo = extractTimeInfo(container.text());
  if (timeInfo) howto.totalTime = timeInfo;

  // Extract supplies
  const supplies = extractSupplies($, container);
  if (supplies.length > 0) howto.supply = supplies;

  return howto;
}

function extractSteps(
  $: cheerio.CheerioAPI,
  container: CheerioEl,
): Record<string, unknown>[] {
  const steps: Record<string, unknown>[] = [];

  // Try structured step selectors
  const stepSelectors = [
    '[class*="step"]',
    '[class*="instruction"]',
    '[class*="direction"]',
    'ol > li',
  ];

  for (const sel of stepSelectors) {
    container.find(sel).each((i, el) => {
      const $el = $(el);
      const fullText = $el.text().trim();

      // Try to extract step name from heading within step
      let stepName = '';
      const heading = $el.find('h1, h2, h3, h4, h5, h6, [class*="step-title"]').first();
      if (heading.length) {
        stepName = heading.text().trim();
      }

      let stepText = fullText;
      if (stepName) {
        stepText = fullText.replace(stepName, '').trim();
      }

      if (stepText.length > 15) {
        const step: Record<string, unknown> = {
          '@type': 'HowToStep',
          position: steps.length + 1,
          text: cleanStepText(stepText),
        };

        if (stepName) {
          step.name = cleanStepName(stepName);
        }

        steps.push(step);
      }
    });

    if (steps.length > 0) break;
  }

  // Fallback: extract numbered text patterns
  if (steps.length === 0) {
    const text = container.text();
    const patterns = [
      /(?:^|\n)\s*(\d+)[.)]\s*([^\n]+(?:\n(?!\s*\d+[.)]).*?)*)/gm,
      /(?:^|\n)\s*Step\s+(\d+):?\s*([^\n]+(?:\n(?!Step\s+\d+).*?)*)/gim,
    ];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const stepText = match[2].trim();
        if (stepText.length > 15) {
          steps.push({
            '@type': 'HowToStep',
            position: parseInt(match[1], 10),
            text: cleanStepText(stepText),
          });
        }
      }
      if (steps.length > 0) break;
    }
  }

  return steps.slice(0, 25);
}

function extractHowToFromPageStructure(
  $: cheerio.CheerioAPI,
): Record<string, unknown> | null {
  const h1 = $('h1').first();
  if (!h1.length) return null;

  const title = h1.text().trim();
  if (!/\b(how\s+to|guide|tutorial|instructions|steps)\b/i.test(title)) {
    return null;
  }

  // Look for step-like headings
  const stepHeadings: CheerioEl[] = [];
  $('h2, h3').each((_i, el) => {
    const text = $(el).text().trim();
    if (/^(Step\s+\d+|[123456789]\d*\.)/.test(text)) {
      stepHeadings.push($(el));
    }
  });

  if (stepHeadings.length < 2) return null;

  const steps: Record<string, unknown>[] = [];
  for (let i = 0; i < stepHeadings.length; i++) {
    const heading = stepHeadings[i];
    const stepTitle = heading.text().trim();

    // Collect content until next heading
    let content = '';
    let next = heading.next();
    while (next.length) {
      const tagName = (next.prop('tagName') || '').toLowerCase();
      if (/^h[1-6]$/.test(tagName)) break;
      content += ' ' + next.text().trim();
      next = next.next();
    }

    if (content.trim()) {
      steps.push({
        '@type': 'HowToStep',
        position: i + 1,
        name: cleanStepName(stepTitle),
        text: cleanStepText(content.trim()),
      });
    }
  }

  if (steps.length >= 2) {
    return {
      '@type': 'HowTo',
      name: title,
      step: steps.slice(0, 20),
    };
  }

  return null;
}

function extractTimeInfo(text: string): string | null {
  const patterns = [
    /(\d+)\s*(minutes?|mins?)/i,
    /(\d+)\s*(hours?|hrs?)/i,
    /(\d+)\s*(days?)/i,
  ];

  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m) {
      const duration = parseInt(m[1], 10);
      const unit = m[2].toLowerCase();
      if (unit.startsWith('hour') || unit.startsWith('hr')) return `PT${duration}H`;
      if (unit.startsWith('day')) return `P${duration}D`;
      return `PT${duration}M`;
    }
  }

  return null;
}

function extractSupplies(
  $: cheerio.CheerioAPI,
  container: CheerioEl,
): Record<string, unknown>[] {
  const supplies: Record<string, unknown>[] = [];

  const selectors = [
    '[class*="supplies"] li',
    '[class*="tools"] li',
    '[class*="materials"] li',
    '[class*="equipment"] li',
  ];

  for (const sel of selectors) {
    container.find(sel).each((_i, el) => {
      const text = $(el).text().trim();
      if (text.length > 0 && text.length < 100 && supplies.length < 10) {
        supplies.push({
          '@type': 'HowToSupply',
          name: text,
        });
      }
    });
    if (supplies.length > 0) break;
  }

  return supplies;
}

function cleanStepName(text: string): string {
  return text.replace(/^(Step\s*\d+:?\s*|#\d+\.?\s*)/i, '').trim();
}

function cleanStepText(text: string): string {
  let cleaned = text.replace(/^(Step\s*\d+:?\s*|#\d+\.?\s*)/i, '').trim();
  cleaned = cleaned.replace(/\s+/g, ' ');

  if (cleaned.length > 1000) {
    const truncated = cleaned.slice(0, 1000);
    const lastPeriod = truncated.lastIndexOf('.');
    if (lastPeriod > 800) {
      cleaned = truncated.slice(0, lastPeriod + 1);
    } else {
      cleaned = truncated + '...';
    }
  }

  return cleaned;
}

// ─── Address parsing ────────────────────────────────────────────────────────

function parseAddress(text: string): Record<string, unknown> {
  const address: Record<string, unknown> = { '@type': 'PostalAddress' };

  // ZIP code
  const zipMatch = text.match(/\b\d{5}(-\d{4})?\b/);
  if (zipMatch) address.postalCode = zipMatch[0];

  // State (2-letter code)
  const stateMatch = text.match(/\b[A-Z]{2}\b/);
  if (stateMatch) address.addressRegion = stateMatch[0];

  // Country
  if (/usa|united states/i.test(text)) {
    address.addressCountry = 'US';
  }

  // Street address
  let cleanAddress = text
    .replace(/\b\d{5}(-\d{4})?\b.*$/, '')
    .replace(/\b[A-Z]{2}\b.*$/, '')
    .trim();

  if (cleanAddress) {
    const parts = cleanAddress.split(',');
    if (parts.length >= 2) {
      address.streetAddress = parts[0].trim();
      address.addressLocality = parts[1].trim();
    } else {
      address.streetAddress = cleanAddress;
    }
  }

  // Only return if we extracted something beyond @type
  return Object.keys(address).length > 1 ? address : {};
}

function isValidUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}
