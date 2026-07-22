/**
 * Schema generator dispatcher.
 * Detects the best schema type for the content, then delegates to the
 * appropriate generator.
 */

import type { EnrichedEntity } from '../../types/entities';
import type { TextParts } from '../../types/analysis';
import type { SchemaArtifact } from '../../types/analysis';
import * as cheerio from 'cheerio';
import { generateWebPageSchema } from './webpage';
import { generateArticleSchema } from './article';
import { generateServiceSchema } from './service';
import { generateLocalBusinessSchema } from './local-business';
import { generateEducationalSchema } from './educational';
import { buildSchemaArtifact } from './artifact';
import { hasExternalIdentifier } from './helpers';

export type SchemaType =
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
  /\b(audit|audits|assessment|repair|installation)\b/gi,
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
export interface SchemaDetection {
  type: SchemaType;
  confidence: number;
  evidence: string[];
}

export function detectPrimarySchemaType(textParts: TextParts, url = ''): SchemaDetection {
  if (!textParts.htmlContent) return { type: 'WebPage', confidence: 0.4, evidence: ['No HTML supplied'] };

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
  const $ = cheerio.load(textParts.htmlContent);
  const prominent = `${textParts.title} ${textParts.description} ${headingsText} ${bodySample.slice(0, 1200)}`.toLowerCase();
  const evidence: string[] = [];
  const hasDate = Boolean(
    $('time[datetime], meta[property="article:published_time"], [itemprop="datePublished"]').length,
  );
  const hasLocalContact = Boolean(
    $('[itemprop="address"], address').length
    || combined.match(/\b\d{1,5}\s+[A-Za-z0-9 .'-]+\s(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln)\b/i),
  ) && Boolean(combined.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/));
  const hasProgramCredential = /\b(certificate|degree|diploma|credential|bachelor|master|doctorate|associate)\b/i.test(combined);
  const hasProgramDetails = /\b(curriculum|coursework|credit hours|admissions requirements|tuition|application deadline|prerequisites)\b/i.test(combined);
  const hasEducationProvider = /\b(university|college|school|institute|academy)\b/i.test(combined);
  const ogType = $('meta[property="og:type"]').attr('content')?.toLowerCase();
  const hasAuthor = Boolean($('meta[name="author"], meta[property="article:author"], [rel="author"], [itemprop="author"]').length);
  const hasArticleIntent = /\b(how to|guide|tutorial|tips|blog|article)\b/i.test(prominent);
  const hasExplicitServiceOffer = /\b(we (?:help|provide|offer)|our services?|provides? [^.]{0,60}(?:services?|audits?|consulting|installation|repair|solutions?)|request (?:an? )?(?:quote|consultation|audit)|get (?:a )?(?:quote|estimate)|book (?:a )?(?:service|consultation)|hire us)\b/i.test(prominent);
  const isInstitutionPage = hasEducationProvider && !hasProgramCredential && !hasProgramDetails;
  const isProfilePage = ogType === 'profile' || /\b(author|staff|team member|profile)\b/i.test(`${textParts.title} ${textParts.description}`);
  let isHomepage = false;
  try {
    const parsedUrl = new URL(url);
    isHomepage = parsedUrl.pathname === '/' || parsedUrl.pathname === '';
  } catch {
    isHomepage = false;
  }

  if (isProfilePage || isInstitutionPage) {
    evidence.push(isProfilePage ? 'Profile page evidence' : 'Institution page without one named program');
    return { type: 'WebPage', confidence: 0.86, evidence };
  }

  if (!isHomepage && (ogType === 'article' || (hasDate && $('article').length === 1 && !hasExplicitServiceOffer && (hasAuthor || hasArticleIntent || article > 0)))) {
    evidence.push('Article or guide language', 'Visible author evidence', 'Published-date evidence');
    return { type: 'Article', confidence: 0.9, evidence };
  }

  // Strong agency signal → Service wins over Educational if education terms
  // describe the audience rather than a real credential-bearing program.
  const directAgencySignal = /\b(we help|we work with|our clients|our services|agency|consultancy|consulting firm)\b/i.test(combined);
  const directServiceSignal = /\b(service|services|marketing|consulting|audit|audits|solution|solutions)\b/i.test(combined);
  if ((agencyContext >= 1 || directAgencySignal || hasExplicitServiceOffer) && hasExplicitServiceOffer && (service >= 1 || directServiceSignal)) {
    evidence.push('Named service language', 'Provider or agency context');
    return { type: 'Service', confidence: Math.min(0.95, 0.72 + service * 0.03), evidence };
  }

  if (business >= 2 && hasLocalContact) {
    evidence.push('Local business language', 'Visible address and telephone evidence');
    return { type: 'LocalBusiness', confidence: 0.88, evidence };
  }

  if (educational >= 2 && hasProgramCredential && hasProgramDetails && hasEducationProvider) {
    evidence.push('Named credential', 'Program curriculum or admissions facts', 'Education provider evidence');
    return { type: 'EducationalOccupationalProgram', confidence: 0.9, evidence };
  }

  if (service >= 2 && hasExplicitServiceOffer) {
    evidence.push('Named service language', 'Provider context');
    return { type: 'Service', confidence: 0.76, evidence };
  }

  const scores: Array<[SchemaType, number]> = [
    ['Service', service],
    ['LocalBusiness', business],
    ['EducationalOccupationalProgram', educational],
    ['Article', article],
  ];

  scores.sort((a, b) => b[1] - a[1]);
  const [topType, topScore] = scores[0];
  const fallbackEvidence = topScore > 0
    ? [`${topType} signals were present but required page facts were missing`]
    : ['No specialized page-type evidence met the minimum threshold'];
  return { type: 'WebPage', confidence: topScore > 0 ? 0.65 : 0.8, evidence: fallbackEvidence };
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
  const schemaType = detectPrimarySchemaType(textParts, url).type;

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

export function generateSchemaArtifact(
  entities: EnrichedEntity[],
  textParts: TextParts,
  mainTopic: string,
  url: string,
): SchemaArtifact {
  const detection = detectPrimarySchemaType(textParts, url);
  const raw = (() => {
    switch (detection.type) {
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
  })();
  const omittedEntityNames = entities
    .filter((entity) => !hasExternalIdentifier(entity))
    .map((entity) => entity.name);
  return buildSchemaArtifact(raw, detection, textParts, url, omittedEntityNames);
}
