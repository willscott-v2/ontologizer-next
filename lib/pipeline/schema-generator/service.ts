/**
 * Service schema generator.
 * Ported from PHP generate_service_schema() (lines 1652-1694).
 */

import type { EnrichedEntity } from '../../types/entities';
import type { TextParts } from '../../types/analysis';
import {
  extractNameFromTitle,
  validateAndEnhance,
} from './helpers';
import { extractAdditionalSchemas } from './additional';

/** Map content keywords to recognized service types. */
const SERVICE_TYPE_MAP: Record<string, string> = {
  'assisted living': 'Assisted living',
  limo: 'Limousine service',
  limousine: 'Limousine service',
  transportation: 'Transportation service',
  chauffeur: 'Chauffeur service',
  'car service': 'Car service',
  medical: 'Medical service',
  education: 'Educational service',
  consulting: 'Consulting service',
};

/** Wikipedia sameAs links keyed by service type. */
const WIKI_SAME_AS: Record<string, string> = {
  'Assisted living': 'https://en.wikipedia.org/wiki/Assisted_living',
  'Limousine service': 'https://en.wikipedia.org/wiki/Limousine',
  'Transportation service': 'https://en.wikipedia.org/wiki/Transport',
  'Chauffeur service': 'https://en.wikipedia.org/wiki/Chauffeur',
};

const WIKIDATA_SAME_AS: Record<string, string> = {
  'Assisted living': 'https://www.wikidata.org/wiki/Q315412',
  'Limousine service': 'https://www.wikidata.org/wiki/Q188475',
};

function detectServiceType(textParts: TextParts): string {
  const combined = (textParts.title + ' ' + textParts.description).toLowerCase();
  for (const [keyword, type] of Object.entries(SERVICE_TYPE_MAP)) {
    if (combined.includes(keyword)) return type;
  }
  return 'Professional service';
}

function buildServiceSameAs(serviceType: string): string[] {
  const sameAs: string[] = [];
  if (WIKI_SAME_AS[serviceType]) sameAs.push(WIKI_SAME_AS[serviceType]);
  if (WIKIDATA_SAME_AS[serviceType]) sameAs.push(WIKIDATA_SAME_AS[serviceType]);
  return sameAs;
}

function extractServiceProvider(
  textParts: TextParts,
  entities: EnrichedEntity[],
): Record<string, unknown> {
  const provider: Record<string, unknown> = {
    '@type': 'LocalBusiness',
    name: extractNameFromTitle(textParts.title) ||
      (entities.length > 0 ? entities[0].name : 'Organization'),
  };

  if (textParts.description) {
    provider.description = textParts.description;
  }

  return provider;
}

export function generateServiceSchema(
  entities: EnrichedEntity[],
  textParts: TextParts,
  url: string,
): Record<string, unknown> {
  const serviceName = extractNameFromTitle(textParts.title) ||
    (entities.length > 0 ? entities[0].name : 'Professional Service');
  const serviceType = detectServiceType(textParts);

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org/',
    '@type': 'Service',
    serviceType,
    name: serviceName,
    url,
  };

  if (textParts.description) {
    schema.description = textParts.description;
  }

  // Add sameAs and additionalType for known service types
  const serviceSameAs = buildServiceSameAs(serviceType);
  if (serviceSameAs.length > 0) {
    schema.sameAs = serviceSameAs;
    schema.additionalType =
      'http://www.productontology.org/id/' +
      serviceType.replace(/ /g, '_');
  }

  // Add provider organization
  const provider = extractServiceProvider(textParts, entities);
  schema.provider = provider;

  // Add FAQ or HowTo if detected
  const additional = extractAdditionalSchemas(textParts.htmlContent);
  if (additional.faq) {
    schema.mainEntity = additional.faq;
  } else if (additional.howto) {
    schema.mainEntity = additional.howto;
  }

  return validateAndEnhance(schema);
}
