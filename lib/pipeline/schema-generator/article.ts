/**
 * Article schema generator.
 * Ported from PHP generate_article_schema() (lines 1856-1916).
 */

import type { EnrichedEntity } from '../../types/entities';
import type { TextParts } from '../../types/analysis';
import { buildAboutEntities, validateAndEnhance } from './helpers';
import { extractAdditionalSchemas } from './additional';

export function generateArticleSchema(
  entities: EnrichedEntity[],
  textParts: TextParts,
  url: string,
): Record<string, unknown> {
  const additional = extractAdditionalSchemas(textParts.htmlContent);

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    url,
    name: textParts.title,
  };

  if (textParts.description) {
    schema.description = textParts.description;
  }

  // Create Article as mainEntity
  const article: Record<string, unknown> = {
    '@type': 'Article',
    headline: textParts.title,
  };

  if (textParts.description) {
    article.description = textParts.description;
  }

  if (additional.author) {
    article.author = additional.author;
  }

  schema.mainEntity = article;

  // Add FAQ and HowTo as hasPart
  const hasPart: Record<string, unknown>[] = [];
  if (additional.faq) hasPart.push(additional.faq);
  if (additional.howto) hasPart.push(additional.howto);

  if (hasPart.length > 0) {
    schema.hasPart = hasPart;
  }

  // Add entity references
  const aboutEntities = buildAboutEntities(entities);
  if (aboutEntities.length > 0) {
    schema.about = aboutEntities[0]; // Primary topic
    if (aboutEntities.length > 1) {
      schema.mentions = aboutEntities.slice(1); // Secondary topics
    }
  }

  // Add publisher
  if (additional.organization) {
    schema.publisher = additional.organization;
  }

  return validateAndEnhance(schema);
}
