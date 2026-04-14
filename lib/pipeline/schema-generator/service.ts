/**
 * Service schema generator.
 * Emits a @graph with Organization + WebPage + Service nodes so external
 * references (provider, publisher, isPartOf) resolve via @id.
 */

import type { EnrichedEntity } from '../../types/entities';
import type { TextParts } from '../../types/analysis';
import {
  buildAboutEntities,
  buildOrganizationNode,
  buildWebSiteNode,
  extractNameFromTitle,
  getOriginFromUrl,
  organizationId,
  webPageId,
  websiteId,
} from './helpers';
import { extractAdditionalSchemas } from './additional';
import * as cheerio from 'cheerio';

// ─── Service type detection ────────────────────────────────────────────────

interface ServiceTypeMatch {
  serviceType: string;
  sameAs: string[];
}

/** Common marketing/digital service types and their entity references. */
const SERVICE_TYPE_PATTERNS: Array<{
  pattern: RegExp;
  serviceType: string;
  sameAs: string[];
}> = [
  {
    pattern: /\b(SEO|search engine optimization|organic search)\b/i,
    serviceType: 'Search Engine Optimization',
    sameAs: [
      'https://en.wikipedia.org/wiki/Search_engine_optimization',
      'https://www.wikidata.org/wiki/Q180711',
    ],
  },
  {
    pattern: /\b(PPC|pay.?per.?click|paid search|google ads|search ads)\b/i,
    serviceType: 'Pay-per-click Advertising',
    sameAs: [
      'https://en.wikipedia.org/wiki/Pay-per-click',
      'https://www.wikidata.org/wiki/Q836811',
    ],
  },
  {
    pattern: /\bcontent marketing\b/i,
    serviceType: 'Content Marketing',
    sameAs: [
      'https://en.wikipedia.org/wiki/Content_marketing',
      'https://www.wikidata.org/wiki/Q2720854',
    ],
  },
  {
    pattern: /\bsocial media marketing\b/i,
    serviceType: 'Social Media Marketing',
    sameAs: [
      'https://en.wikipedia.org/wiki/Social_media_marketing',
      'https://www.wikidata.org/wiki/Q1394170',
    ],
  },
  {
    pattern: /\bemail marketing\b/i,
    serviceType: 'Email Marketing',
    sameAs: [
      'https://en.wikipedia.org/wiki/Email_marketing',
      'https://www.wikidata.org/wiki/Q1049475',
    ],
  },
  {
    pattern: /\b(CRO|conversion rate optimization|conversion optimization)\b/i,
    serviceType: 'Conversion Rate Optimization',
    sameAs: [
      'https://en.wikipedia.org/wiki/Conversion_rate_optimization',
      'https://www.wikidata.org/wiki/Q1128376',
    ],
  },
  {
    pattern: /\b(digital marketing|online marketing|internet marketing)\b/i,
    serviceType: 'Digital Marketing',
    sameAs: [
      'https://en.wikipedia.org/wiki/Digital_marketing',
      'https://www.wikidata.org/wiki/Q5276122',
    ],
  },
  {
    pattern: /\b(web design|website design)\b/i,
    serviceType: 'Web Design',
    sameAs: [
      'https://en.wikipedia.org/wiki/Web_design',
      'https://www.wikidata.org/wiki/Q189249',
    ],
  },
  {
    pattern: /\b(web development|website development)\b/i,
    serviceType: 'Web Development',
    sameAs: [
      'https://en.wikipedia.org/wiki/Web_development',
      'https://www.wikidata.org/wiki/Q386275',
    ],
  },
  {
    pattern: /\blink building\b/i,
    serviceType: 'Link Building',
    sameAs: ['https://en.wikipedia.org/wiki/Link_building'],
  },
  {
    pattern: /\b(assisted living)\b/i,
    serviceType: 'Assisted living',
    sameAs: [
      'https://en.wikipedia.org/wiki/Assisted_living',
      'https://www.wikidata.org/wiki/Q315412',
    ],
  },
  {
    pattern: /\b(limo|limousine service)\b/i,
    serviceType: 'Limousine service',
    sameAs: [
      'https://en.wikipedia.org/wiki/Limousine',
      'https://www.wikidata.org/wiki/Q188475',
    ],
  },
  {
    pattern: /\b(chauffeur)\b/i,
    serviceType: 'Chauffeur service',
    sameAs: ['https://en.wikipedia.org/wiki/Chauffeur'],
  },
];

function detectServiceType(textParts: TextParts): ServiceTypeMatch {
  const haystack = (
    textParts.title +
    ' ' +
    textParts.description +
    ' ' +
    textParts.headings.map((h) => h.text).join(' ')
  ).toLowerCase();

  for (const { pattern, serviceType, sameAs } of SERVICE_TYPE_PATTERNS) {
    if (pattern.test(haystack)) {
      return { serviceType, sameAs };
    }
  }

  return { serviceType: 'Professional Service', sameAs: [] };
}

// ─── Audience detection ────────────────────────────────────────────────────

interface AudienceMatch {
  audience: Record<string, unknown>;
  industryLabel: string;
}

/** Industry audiences this service targets (B2B clients). */
const AUDIENCE_PATTERNS: Array<{
  pattern: RegExp;
  audience: Record<string, unknown>;
  industryLabel: string;
}> = [
  {
    pattern: /\b(higher education|universit(y|ies)|college[s]?|academic)\b/i,
    audience: {
      '@type': 'EducationalAudience',
      name: 'Higher Education Institutions',
      educationalRole: 'Administrator',
    },
    industryLabel: 'Higher Education',
  },
  {
    pattern: /\bk.?12\b|primary school|elementary school|high school/i,
    audience: {
      '@type': 'EducationalAudience',
      name: 'K-12 Schools',
      educationalRole: 'Administrator',
    },
    industryLabel: 'K-12 Education',
  },
  {
    pattern: /\b(healthcare|hospital|medical practice|clinic|provider network)\b/i,
    audience: {
      '@type': 'Audience',
      name: 'Healthcare Organizations',
      audienceType: 'Healthcare',
    },
    industryLabel: 'Healthcare',
  },
  {
    pattern: /\b(e.?commerce|online retail|retailer[s]?|dtc|shopify|woocommerce)\b/i,
    audience: {
      '@type': 'Audience',
      name: 'E-commerce Brands',
      audienceType: 'E-commerce',
    },
    industryLabel: 'E-commerce',
  },
  {
    pattern: /\b(b2b|enterprise|saas|software company)\b/i,
    audience: {
      '@type': 'Audience',
      name: 'B2B Companies',
      audienceType: 'B2B',
    },
    industryLabel: 'B2B',
  },
  {
    pattern: /\b(legal|law firm|attorney|attorneys)\b/i,
    audience: {
      '@type': 'Audience',
      name: 'Law Firms',
      audienceType: 'Legal',
    },
    industryLabel: 'Legal',
  },
  {
    pattern: /\b(real estate|realtor|brokerage)\b/i,
    audience: {
      '@type': 'Audience',
      name: 'Real Estate Brands',
      audienceType: 'Real Estate',
    },
    industryLabel: 'Real Estate',
  },
];

function detectAudience(textParts: TextParts): AudienceMatch | null {
  const haystack = (
    textParts.title +
    ' ' +
    textParts.description +
    ' ' +
    textParts.headings
      .slice(0, 10)
      .map((h) => h.text)
      .join(' ')
  ).toLowerCase();

  for (const candidate of AUDIENCE_PATTERNS) {
    if (candidate.pattern.test(haystack)) return candidate;
  }

  return null;
}

// ─── Main generator ────────────────────────────────────────────────────────

export function generateServiceSchema(
  entities: EnrichedEntity[],
  textParts: TextParts,
  url: string,
): Record<string, unknown> {
  const origin = getOriginFromUrl(url);
  const $ = cheerio.load(textParts.htmlContent || '');

  const orgNode = buildOrganizationNode(url, textParts.htmlContent);
  const websiteNode = buildWebSiteNode(url, $);

  const serviceName =
    extractNameFromTitle(textParts.title) ||
    (entities.length > 0 ? entities[0].name : 'Professional Service');

  const { serviceType, sameAs } = detectServiceType(textParts);
  const audienceMatch = detectAudience(textParts);

  // ── Service node
  const serviceNode: Record<string, unknown> = {
    '@type': 'Service',
    name: serviceName,
    serviceType,
  };

  if (textParts.description) {
    serviceNode.description = textParts.description;
  }

  if (sameAs.length > 0) {
    serviceNode.sameAs = sameAs;
    serviceNode.additionalType =
      'http://www.productontology.org/id/' +
      serviceType.replace(/ /g, '_');
  }

  if (orgNode) {
    serviceNode.provider = { '@id': organizationId(url) };
  }

  if (audienceMatch) {
    serviceNode.audience = audienceMatch.audience;
    serviceNode.areaServed = {
      '@type': 'AdministrativeArea',
      name: 'United States',
    };
    // Keep industry-context visible as a category for Google/AI readers
    serviceNode.category = audienceMatch.industryLabel;
  }

  // About entities (top 3) and mentions (next 5) as knowledge-graph anchors
  const aboutEntities = buildAboutEntities(entities);
  if (aboutEntities.length > 0) {
    serviceNode.about = aboutEntities.slice(0, 3);
    if (aboutEntities.length > 3) {
      serviceNode.mentions = aboutEntities.slice(3, 8);
    }
  }

  // ── WebPage node
  const webPageNode: Record<string, unknown> = {
    '@type': 'WebPage',
    '@id': webPageId(url),
    url,
    name: textParts.title || serviceName,
  };
  if (textParts.description) {
    webPageNode.description = textParts.description;
  }
  if (orgNode) {
    webPageNode.publisher = { '@id': organizationId(url) };
  }
  if (websiteNode) {
    webPageNode.isPartOf = { '@id': websiteId(url) };
  }
  webPageNode.primaryImageOfPage =
    $('meta[property="og:image"]').attr('content') || undefined;
  if (!webPageNode.primaryImageOfPage) delete webPageNode.primaryImageOfPage;

  webPageNode.mainEntity = serviceNode;
  webPageNode.speakable = {
    '@type': 'SpeakableSpecification',
    xpath: [
      '/html/head/title',
      '/html/head/meta[@name="description"]',
      '/html/body//h1',
      '/html/body//h2',
    ],
  };

  // FAQ / HowTo as hasPart
  const additional = extractAdditionalSchemas(textParts.htmlContent);
  const hasPart: Record<string, unknown>[] = [];
  if (additional.faq) hasPart.push(additional.faq);
  if (additional.howto) hasPart.push(additional.howto);
  if (hasPart.length > 0) webPageNode.hasPart = hasPart;

  // ── Assemble graph
  const graph: Record<string, unknown>[] = [];
  if (orgNode) graph.push(orgNode);
  if (websiteNode) graph.push(websiteNode);
  graph.push(webPageNode);

  // Only emit the origin-level homepage anchor when the current URL isn't it
  if (origin && url !== `${origin}/`) {
    // nothing extra; the Organization already carries the homepage URL
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  };
}
