/**
 * Shared helper functions for schema generators.
 * Ported from various PHP helper methods in class-ontologizer-processor.php.
 */

import type { EnrichedEntity } from '../../types/entities';

/**
 * Build an array of schema.org Thing objects from enriched entities.
 * Each Thing includes name, optional additionalType, and sameAs links.
 * Ported from PHP build_about_entities().
 */
export function buildAboutEntities(
  entities: EnrichedEntity[],
): Record<string, unknown>[] {
  return entities.map((entity) => {
    const sameAs: string[] = [];
    if (entity.wikipediaUrl) sameAs.push(entity.wikipediaUrl);
    if (entity.wikidataUrl) sameAs.push(entity.wikidataUrl);
    if (entity.googleKgUrl) sameAs.push(entity.googleKgUrl);

    const thing: Record<string, unknown> = {
      '@type': 'Thing',
      name: entity.name,
    };

    if (entity.productOntologyUrl) {
      thing.additionalType = entity.productOntologyUrl;
    }

    if (sameAs.length > 0) {
      thing.sameAs = sameAs;
    }

    return thing;
  });
}

/**
 * Build a knowsAbout array for high-confidence entities with KG presence.
 * Ported from PHP build_knows_about_array().
 */
export function buildKnowsAbout(
  entities: EnrichedEntity[],
  maxItems = 12,
): Record<string, unknown>[] {
  const relevant = entities.filter(
    (e) => e.confidenceScore > 60 && e.wikipediaUrl,
  );

  return relevant.slice(0, maxItems).map((entity) => {
    const sameAs: string[] = [];
    if (entity.wikipediaUrl) sameAs.push(entity.wikipediaUrl);
    if (entity.googleKgUrl) sameAs.push(entity.googleKgUrl);

    const thing: Record<string, unknown> = {
      '@type': 'Thing',
      name: entity.name.toLowerCase(),
    };

    if (sameAs.length > 0) {
      thing.sameAs = sameAs;
    }

    return thing;
  });
}

/**
 * Extract the primary name from a page title by stripping common separators.
 * "Service Name | Company" -> "Service Name"
 */
export function extractNameFromTitle(title: string): string {
  if (!title) return '';
  const cleaned = title.replace(/\s*[-|]\s*.+$/, '').trim();
  return cleaned || title;
}

/**
 * Add speakable specification for voice search optimization.
 */
export function addSpeakable(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...schema,
    speakable: {
      '@type': 'SpeakableSpecification',
      xpath: [
        '/html/head/title',
        '/html/head/meta[@name="description"]',
        '/html/body//h1',
        '/html/body//h2',
        '/html/body//h3',
        '/html/body//p',
      ],
    },
  };
}

/**
 * Validate and enhance a schema with required properties and speakable.
 * Ported from PHP validate_and_enhance_schema().
 */
export function validateAndEnhance(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  if (!schema['@context']) {
    schema['@context'] = 'https://schema.org';
  }
  if (!schema['@type']) {
    schema['@type'] = 'Thing';
  }

  const schemaType = schema['@type'] as string;
  if (['WebPage', 'Article'].includes(schemaType)) {
    return addSpeakable(schema);
  }

  return schema;
}
