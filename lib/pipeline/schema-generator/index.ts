/**
 * Schema generator dispatcher.
 * Detects the best schema type for the content, then delegates to the
 * appropriate generator.
 */

import type { EnrichedEntity } from '../../types/entities';
import type { TextParts } from '../../types/analysis';
import { generateWebPageSchema } from './webpage';
import { generateArticleSchema } from './article';
import { generateServiceSchema } from './service';
import { generateLocalBusinessSchema } from './local-business';
import { generateEducationalSchema } from './educational';

type SchemaType =
  | 'Service'
  | 'LocalBusiness'
  | 'EducationalOccupationalProgram'
  | 'Article'
  | 'WebPage';

// ─── Pattern groups for content classification ──────────────────────────────

/** Core service-offering language. */
const SERVICE_PATTERNS = [
  /\b(service|services|solution|solutions|offering|offerings)\b/gi,
  /\b(assisted living|limo|limousine|transportation|chauffeur|car service)\b/gi,
  /\b(provider|support|assistance|consulting|agency)\b/gi,
  /\b(SEO|search engine optimization|PPC|paid search|content marketing|email marketing|social media marketing|web design|web development|conversion optimization|CRO|link building)\b/gi,
];

/** Signals the page is an agency/provider *describing* what it does,
 *  not an organization *being* what it claims (e.g., "our clients", "we help"). */
const AGENCY_CONTEXT_PATTERNS = [
  /\b(we help|we work with|our clients|our team|our services|our approach|our experts|contact us|get in touch|request a quote|free consultation|case studies|client results|client success|years of experience|full-service)\b/gi,
  /\b(agency|consultancy|firm|partner|practice)\b/gi,
];

const BUSINESS_PATTERNS = [
  /\b(phone|telephone|\(\d{3}\)|address|location|hours|opening hours)\b/gi,
  /\b(restaurant|hotel|store|shop|clinic|office|center|facility|boutique|dealership)\b/gi,
];

/** Language that signals an ACTUAL educational program offering
 *  (a university/college describing its own program). */
const EDUCATIONAL_PROGRAM_PATTERNS = [
  /\b(degree program|academic program|bachelor['\u2019]s|master['\u2019]s|doctorate|phd|mba|associate['\u2019]s degree)\b/gi,
  /\b(curriculum|coursework|prerequisites|syllabus|accreditation|credit hours|credits to graduate|semester credits)\b/gi,
  /\b(enroll now|apply now|admissions requirements|application deadline|financial aid|tuition|scholarships?)\b/gi,
  /\b(graduate program|undergraduate program|certificate program|course catalog)\b/gi,
];

const ARTICLE_PATTERNS = [
  /\b(how to|guide|tutorial|tips|advice|blog|article|post)\b/gi,
  /\b(author|posted|published|written by|updated on)\b/gi,
];

function countMatches(text: string, patterns: RegExp[]): number {
  let total = 0;
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const matches = text.match(pattern);
    total += matches ? matches.length : 0;
  }
  return total;
}

/**
 * Detect the most appropriate schema type by scoring content patterns.
 * Key rule change vs. original: a page with agency context + industry
 * keywords (e.g. "higher education SEO services") is a Service targeting
 * that industry — not an EducationalOccupationalProgram.
 */
function detectPrimarySchemaType(textParts: TextParts): SchemaType {
  if (!textParts.htmlContent) return 'WebPage';

  const headingsText = textParts.headings.map((h) => h.text).join(' ');
  const bodySample = textParts.body ? textParts.body.slice(0, 4000) : '';
  const combined = (
    textParts.title +
    ' ' +
    textParts.description +
    ' ' +
    headingsText +
    ' ' +
    bodySample
  ).toLowerCase();

  const service = countMatches(combined, SERVICE_PATTERNS);
  const agencyContext = countMatches(combined, AGENCY_CONTEXT_PATTERNS);
  const business = countMatches(combined, BUSINESS_PATTERNS);
  const educational = countMatches(combined, EDUCATIONAL_PROGRAM_PATTERNS);
  const article = countMatches(combined, ARTICLE_PATTERNS);

  // Strong agency signal → Service wins over Educational even if education
  // keywords are present (they're describing the target audience, not the product)
  if (service >= 2 && agencyContext >= 1) return 'Service';

  // Article beats Service if it clearly reads as a post
  if (article >= 3 && article > service) return 'Article';

  const scores: Array<[SchemaType, number]> = [
    ['Service', service],
    ['LocalBusiness', business],
    ['EducationalOccupationalProgram', educational],
    ['Article', article],
  ];

  scores.sort((a, b) => b[1] - a[1]);
  const [topType, topScore] = scores[0];

  // Require at least 2 matches to override WebPage default
  return topScore >= 2 ? topType : 'WebPage';
}

/**
 * Generate JSON-LD schema for the given content.
 */
export function generateJsonLd(
  entities: EnrichedEntity[],
  textParts: TextParts,
  mainTopic: string,
  url: string,
): Record<string, unknown> {
  const schemaType = detectPrimarySchemaType(textParts);

  switch (schemaType) {
    case 'Service':
      return generateServiceSchema(entities, textParts, url);
    case 'LocalBusiness':
      return generateLocalBusinessSchema(entities, textParts, mainTopic, url);
    case 'EducationalOccupationalProgram':
      return generateEducationalSchema(entities, textParts, url);
    case 'Article':
      return generateArticleSchema(entities, textParts, url);
    default:
      return generateWebPageSchema(entities, textParts, url);
  }
}
