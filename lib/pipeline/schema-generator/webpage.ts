/**
 * WebPage schema generator (fallback default).
 * Ported from PHP generate_webpage_schema() (lines 1918-1966).
 */

import type { EnrichedEntity } from '../../types/entities';
import type { TextParts } from '../../types/analysis';
import {
  buildAboutEntities,
  validateAndEnhance,
} from './helpers';
import { extractAdditionalSchemas } from './additional';

export function generateWebPageSchema(
  entities: EnrichedEntity[],
  textParts: TextParts,
  url: string,
): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    url,
  };

  if (textParts.title) {
    schema.name = textParts.title;
  }
  if (textParts.description) {
    schema.description = textParts.description;
  }

  // Extract additional schemas (author, org, FAQ, HowTo) from HTML
  const additional = extractAdditionalSchemas(textParts.htmlContent);

  if (additional.author) {
    schema.author = additional.author;
  }
  if (additional.organization) {
    schema.publisher = additional.organization;
  }
  if (additional.faq) {
    schema.mainEntity = additional.faq;
  }
  // HowTo overrides FAQ for mainEntity if both present (matches PHP behavior)
  if (additional.howto) {
    schema.mainEntity = additional.howto;
  }

  // Add entity references
  const aboutEntities = buildAboutEntities(entities);
  if (aboutEntities.length > 0) {
    schema.about = aboutEntities;
    schema.mentions = aboutEntities;
  }

  return validateAndEnhance(schema);
}
