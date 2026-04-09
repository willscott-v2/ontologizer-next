/**
 * Schema generator dispatcher.
 * Detects the best schema type for the content, then delegates to the
 * appropriate generator.
 *
 * Ported from PHP detect_primary_schema_type() + generate_json_ld()
 * (lines 1563-1650).
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

const SERVICE_PATTERNS = [
  /\b(service|services|assisted living|limo|limousine|transportation|chauffeur|car service)\b/gi,
  /\b(provider|offering|support|care|assistance)\b/gi,
];

const BUSINESS_PATTERNS = [
  /\b(phone|telephone|\(\d{3}\)|address|location|contact|hours|business)\b/gi,
  /\b(restaurant|hotel|store|shop|clinic|office|center|facility)\b/gi,
];

const EDUCATION_PATTERNS = [
  /\b(program|course|degree|diploma|certificate|education|training|academy|university|college)\b/gi,
  /\b(student|enrollment|curriculum|credits|accreditation)\b/gi,
];

const ARTICLE_PATTERNS = [
  /\b(how to|guide|tutorial|tips|advice|blog|article)\b/gi,
  /\b(author|posted|published|written by)\b/gi,
];

/**
 * Count total regex matches across a set of patterns.
 */
function countMatches(text: string, patterns: RegExp[]): number {
  let total = 0;
  for (const pattern of patterns) {
    // Reset lastIndex since we reuse regex objects
    pattern.lastIndex = 0;
    const matches = text.match(pattern);
    total += matches ? matches.length : 0;
  }
  return total;
}

/**
 * Detect the most appropriate schema type by scoring content patterns.
 * Returns 'WebPage' when no type scores at least 2 matches.
 */
function detectPrimarySchemaType(textParts: TextParts): SchemaType {
  if (!textParts.htmlContent) return 'WebPage';

  const headingsText = textParts.headings.map((h) => h.text).join(' ');
  const combined = (
    textParts.title +
    ' ' +
    textParts.description +
    ' ' +
    headingsText
  ).toLowerCase();

  const scores: Record<SchemaType, number> = {
    Service: countMatches(combined, SERVICE_PATTERNS),
    LocalBusiness: countMatches(combined, BUSINESS_PATTERNS),
    EducationalOccupationalProgram: countMatches(combined, EDUCATION_PATTERNS),
    Article: countMatches(combined, ARTICLE_PATTERNS),
    WebPage: 0,
  };

  // Find highest scoring type (excluding WebPage)
  let maxType: SchemaType = 'WebPage';
  let maxScore = 0;

  for (const [type, score] of Object.entries(scores)) {
    if (type !== 'WebPage' && score > maxScore) {
      maxScore = score;
      maxType = type as SchemaType;
    }
  }

  // Require at least 2 matches to override the default
  return maxScore >= 2 ? maxType : 'WebPage';
}

/**
 * Generate JSON-LD schema for the given content.
 * Detects the best schema type and delegates to the appropriate generator.
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
