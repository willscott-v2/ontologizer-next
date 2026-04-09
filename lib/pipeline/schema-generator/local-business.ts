/**
 * LocalBusiness schema generator.
 * Ported from PHP generate_local_business_schema() (lines 1696-1743).
 */

import type { EnrichedEntity } from '../../types/entities';
import type { TextParts } from '../../types/analysis';
import {
  buildKnowsAbout,
  extractNameFromTitle,
  validateAndEnhance,
} from './helpers';
import { extractContactInfo, extractSocialLinks } from './additional';

export function generateLocalBusinessSchema(
  entities: EnrichedEntity[],
  textParts: TextParts,
  mainTopic: string,
  url: string,
): Record<string, unknown> {
  const businessName = extractNameFromTitle(textParts.title) ||
    (entities.length > 0 ? entities[0].name : 'Local Business');

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: businessName,
    url,
  };

  if (textParts.description) {
    schema.description = textParts.description;
  }

  // Extract contact info from HTML
  const contactInfo = extractContactInfo(textParts.htmlContent);
  if (contactInfo.telephone) {
    schema.telephone = contactInfo.telephone;
  }
  if (contactInfo.address) {
    schema.address = contactInfo.address;
  }

  // Add service offerings from entities
  const serviceKeywords = ['service', 'services', 'offering', 'solution', 'care', 'support'];
  const services: Record<string, unknown>[] = [];

  for (const entity of entities) {
    const entityLower = entity.name.toLowerCase();
    const isService = serviceKeywords.some((kw) => entityLower.includes(kw));
    if (isService && entity.confidenceScore > 50 && services.length < 5) {
      services.push({
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: entity.name,
        },
      });
    }
  }

  if (services.length > 0) {
    schema.hasOfferCatalog = {
      '@type': 'OfferCatalog',
      name: 'Services',
      itemListElement: services,
    };
  }

  // Add knowsAbout for business expertise
  const knowsAbout = buildKnowsAbout(entities);
  if (knowsAbout.length > 0) {
    schema.knowsAbout = knowsAbout;
  }

  // Add sameAs from social links
  const sameAs = extractSocialLinks(textParts.htmlContent);
  if (sameAs.length > 0) {
    schema.sameAs = sameAs;
  }

  return validateAndEnhance(schema);
}
