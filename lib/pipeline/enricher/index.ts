/**
 * Entity enrichment orchestrator.
 * Ported from PHP enrich_entities() (lines 689-843) but restructured for
 * parallel execution using Promise.allSettled.
 */

import type { RawEntity, EnrichedEntity, EntityType } from '../../types/entities';
import { findWikipediaUrl } from './wikipedia';
import { findWikidataUrl } from './wikidata';
import { findGoogleKgUrl } from './google-kg';
import { findProductOntologyUrl } from './product-ontology';

// ── Filtering ──────────────────────────────────────────────────────────

const NON_ENTITY_PATTERNS = [
  /pricing/i, /location/i, /reliability/i, /efficiency/i, /comfort/i,
  /framework/i, /reports?/i, /surveys?/i, /meet.?greet/i, /pick.?up/i, /drop.?off/i,
  /car.?seat/i, /booster/i, /flight.?status/i, /white.?papers/i, /ai.?search.?success/i,
  /intelligence.?reports/i, /working.?genius/i, /widget/i, /sidebar/i,
  /advertisement/i, /banner/i, /cookie/i, /consent/i, /share/i,
  /^wonder$/i, /^invention$/i, /^discernment$/i, /^tenacity$/i, /^enablement$/i,
  /^galvanizing$/i, /^empowerment$/i, /^synergy$/i, /^leverage$/i, /^optimization$/i,
  /^transformation$/i, /^innovation$/i, /^excellence$/i, /^leadership$/i,
];

const UNLIKELY_WIKIPEDIA_PATTERNS = [
  /^(seo tracking|seo strategy|local seo|national seo|technical seo|ai seo)$/i,
  /^(search rankings|ranking keywords|ranking factors)$/i,
  /^(student recruitment|prospective students|enrollment goals)$/i,
  /^(organic traffic|crawl errors|schema markup)$/i,
  /^(program pages|geo-targeted keywords)$/i,
];

/** Entities that almost always come from template chrome (sharing widgets,
 *  RSS icons, newsletter forms) and rarely belong to the actual page topic. */
const TEMPLATE_ENTITIES = new Set([
  'subscribe', 'newsletter', 'rss',
]);

/** Known reference entities we short-circuit to avoid flaky Wikipedia search.
 *  Lowercase key → canonical enrichment targets. */
const KNOWN_ENTITIES: Record<
  string,
  {
    wikipedia: string;
    wikidata: string;
    googleKg?: string;
    type?: EntityType;
  }
> = {
  'social media': {
    wikipedia: 'https://en.wikipedia.org/wiki/Social_media',
    wikidata: 'https://www.wikidata.org/wiki/Q202833',
    type: 'Thing',
  },
  instagram: {
    wikipedia: 'https://en.wikipedia.org/wiki/Instagram',
    wikidata: 'https://www.wikidata.org/wiki/Q209330',
    type: 'Organization',
  },
  facebook: {
    wikipedia: 'https://en.wikipedia.org/wiki/Facebook',
    wikidata: 'https://www.wikidata.org/wiki/Q355',
    type: 'Organization',
  },
  twitter: {
    wikipedia: 'https://en.wikipedia.org/wiki/Twitter',
    wikidata: 'https://www.wikidata.org/wiki/Q918',
    type: 'Organization',
  },
  'x (formerly twitter)': {
    wikipedia: 'https://en.wikipedia.org/wiki/Twitter',
    wikidata: 'https://www.wikidata.org/wiki/Q918',
    type: 'Organization',
  },
  linkedin: {
    wikipedia: 'https://en.wikipedia.org/wiki/LinkedIn',
    wikidata: 'https://www.wikidata.org/wiki/Q207621',
    type: 'Organization',
  },
  youtube: {
    wikipedia: 'https://en.wikipedia.org/wiki/YouTube',
    wikidata: 'https://www.wikidata.org/wiki/Q866',
    type: 'Organization',
  },
  tiktok: {
    wikipedia: 'https://en.wikipedia.org/wiki/TikTok',
    wikidata: 'https://www.wikidata.org/wiki/Q58412393',
    type: 'Organization',
  },
  pinterest: {
    wikipedia: 'https://en.wikipedia.org/wiki/Pinterest',
    wikidata: 'https://www.wikidata.org/wiki/Q255381',
    type: 'Organization',
  },
  reddit: {
    wikipedia: 'https://en.wikipedia.org/wiki/Reddit',
    wikidata: 'https://www.wikidata.org/wiki/Q1136',
    type: 'Organization',
  },
  snapchat: {
    wikipedia: 'https://en.wikipedia.org/wiki/Snapchat',
    wikidata: 'https://www.wikidata.org/wiki/Q1058874',
    type: 'Organization',
  },
  'google analytics': {
    wikipedia: 'https://en.wikipedia.org/wiki/Google_Analytics',
    wikidata: 'https://www.wikidata.org/wiki/Q2712646',
    type: 'Product',
  },
  'google search console': {
    wikipedia: 'https://en.wikipedia.org/wiki/Google_Search_Console',
    wikidata: 'https://www.wikidata.org/wiki/Q18431136',
    type: 'Product',
  },
  semrush: {
    wikipedia: 'https://en.wikipedia.org/wiki/Semrush',
    wikidata: 'https://www.wikidata.org/wiki/Q30120921',
    type: 'Organization',
  },
  ahrefs: {
    wikipedia: 'https://en.wikipedia.org/wiki/Ahrefs',
    wikidata: 'https://www.wikidata.org/wiki/Q105701132',
    type: 'Organization',
  },
  moz: {
    wikipedia: 'https://en.wikipedia.org/wiki/Moz_(marketing_software)',
    wikidata: 'https://www.wikidata.org/wiki/Q6913421',
    type: 'Organization',
  },
  chatgpt: {
    wikipedia: 'https://en.wikipedia.org/wiki/ChatGPT',
    wikidata: 'https://www.wikidata.org/wiki/Q115564437',
    type: 'Product',
  },
  gemini: {
    wikipedia: 'https://en.wikipedia.org/wiki/Gemini_(language_model)',
    wikidata: 'https://www.wikidata.org/wiki/Q123709030',
    type: 'Product',
  },
  claude: {
    wikipedia: 'https://en.wikipedia.org/wiki/Claude_(language_model)',
    wikidata: 'https://www.wikidata.org/wiki/Q123902751',
    type: 'Product',
  },
  seo: {
    wikipedia: 'https://en.wikipedia.org/wiki/Search_engine_optimization',
    wikidata: 'https://www.wikidata.org/wiki/Q180711',
    type: 'Thing',
  },
  'search engine optimization': {
    wikipedia: 'https://en.wikipedia.org/wiki/Search_engine_optimization',
    wikidata: 'https://www.wikidata.org/wiki/Q180711',
    type: 'Thing',
  },
  'content marketing': {
    wikipedia: 'https://en.wikipedia.org/wiki/Content_marketing',
    wikidata: 'https://www.wikidata.org/wiki/Q2720854',
    type: 'Thing',
  },
  'digital marketing': {
    wikipedia: 'https://en.wikipedia.org/wiki/Digital_marketing',
    wikidata: 'https://www.wikidata.org/wiki/Q5276122',
    type: 'Thing',
  },
  'higher education': {
    wikipedia: 'https://en.wikipedia.org/wiki/Higher_education',
    wikidata: 'https://www.wikidata.org/wiki/Q136822',
    type: 'Thing',
  },
  'artificial intelligence': {
    wikipedia: 'https://en.wikipedia.org/wiki/Artificial_intelligence',
    wikidata: 'https://www.wikidata.org/wiki/Q11660',
    type: 'Thing',
  },
  'machine learning': {
    wikipedia: 'https://en.wikipedia.org/wiki/Machine_learning',
    wikidata: 'https://www.wikidata.org/wiki/Q2539',
    type: 'Thing',
  },
};

const GENERIC_SINGLE_WORDS = new Set([
  'domestic', 'international', 'private', 'public', 'service', 'services',
  'location', 'locations', 'type', 'types', 'area', 'areas',
]);

function shouldSkipEntity(entity: string): boolean {
  const entityLower = entity.toLowerCase();
  const wordCount = entity.split(/\s+/).length;

  // Max 5 words
  if (wordCount > 5) return true;

  // Template entities
  if (TEMPLATE_ENTITIES.has(entityLower)) return true;

  // Generic single words
  if (wordCount === 1 && GENERIC_SINGLE_WORDS.has(entityLower)) return true;

  // Unlikely Wikipedia patterns
  for (const pat of UNLIKELY_WIKIPEDIA_PATTERNS) {
    if (pat.test(entityLower)) return true;
  }

  // Non-entity patterns
  for (const pat of NON_ENTITY_PATTERNS) {
    if (pat.test(entityLower)) return true;
  }

  return false;
}

// ── Confidence scoring ─────────────────────────────────────────────────

function calculateConfidenceScore(
  enriched: {
    wikipediaUrl: string | null;
    wikidataUrl: string | null;
    googleKgUrl: string | null;
    productOntologyUrl: string | null;
    type: EntityType;
  },
  baseScore: number,
): number {
  let sourceBonus = 0;
  let validationBonus = 0;

  // Base source bonuses
  if (enriched.wikipediaUrl) sourceBonus += 15;
  if (enriched.wikidataUrl) sourceBonus += 10;
  if (enriched.googleKgUrl?.includes('kgmid=')) sourceBonus += 15;
  if (enriched.productOntologyUrl) sourceBonus += 5;

  // Multiple-source validation bonus
  let sourceCount = 0;
  if (enriched.wikipediaUrl) sourceCount++;
  if (enriched.wikidataUrl) sourceCount++;
  if (enriched.googleKgUrl?.includes('kgmid=')) sourceCount++;
  if (enriched.productOntologyUrl) sourceCount++;

  if (sourceCount >= 3) {
    validationBonus += 20;
  } else if (sourceCount >= 2) {
    validationBonus += 10;
  }

  // Entity type bonus
  if (enriched.type) {
    switch (enriched.type) {
      case 'Person':
      case 'Organization':
        validationBonus += 10;
        break;
      case 'Place':
        validationBonus += 8;
        break;
      case 'Product':
      case 'Service':
        validationBonus += 6;
        break;
      default:
        validationBonus += 3;
        break;
    }
  }

  return Math.min(100, Math.round(baseScore + sourceBonus + validationBonus));
}

// ── Entity type detection ──────────────────────────────────────────────

const WIKIDATA_TYPE_MAP: Record<string, EntityType> = {
  Q5: 'Person',
  Q43229: 'Organization',
  Q4830453: 'LocalBusiness',
  Q3918: 'Organization',
  Q95074: 'Organization',
  Q16521: 'Thing',
  Q571: 'CreativeWork',
  Q11424: 'CreativeWork',
  Q13442814: 'CreativeWork',
  Q12737077: 'Service',
};

async function detectEntityType(
  name: string,
  wikidataUrl: string | null,
): Promise<EntityType> {
  // Try Wikidata P31 (instance of) if we have a Wikidata URL
  if (wikidataUrl) {
    const wikidataId = wikidataUrl.split('/').pop();
    if (wikidataId) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      try {
        const apiUrl = `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${encodeURIComponent(wikidataId)}&property=P31&format=json`;
        const res = await fetch(apiUrl, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          const instanceId =
            data?.claims?.P31?.[0]?.mainsnak?.datavalue?.value?.id;
          if (instanceId && WIKIDATA_TYPE_MAP[instanceId]) {
            return WIKIDATA_TYPE_MAP[instanceId];
          }
        }
      } catch {
        // continue to fallback
      } finally {
        clearTimeout(timer);
      }
    }
  }

  // Fallback: guess from name patterns
  if (/^[A-Z][a-z]+ [A-Z][a-z]+$/.test(name)) return 'Person';
  if (/university|school/i.test(name)) return 'Organization';

  return 'Thing';
}

// ── Single entity enrichment ───────────────────────────────────────────

interface ApiKeys {
  googleKg?: string;
}

async function enrichSingleEntity(
  entity: RawEntity,
  index: number,
  totalEntities: number,
  mainTopic: string,
  apiKeys: ApiKeys,
): Promise<EnrichedEntity> {
  const baseScore =
    ((totalEntities - index) / totalEntities) * 70;

  // Short-circuit: if we have a known canonical entity, seed those values
  // and skip the Wikipedia/Wikidata round-trips (Google KG still runs so the
  // user sees KGMID coverage when available).
  const knownKey = entity.name.toLowerCase().trim();
  const knownMatch = KNOWN_ENTITIES[knownKey];

  // ProductOntology is for concepts/products — skip for person names
  const isLikelyPerson = /^[A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+$/.test(
    entity.name.trim(),
  );

  // Phase 1: Run Wikipedia, Google KG, and ProductOntology in parallel
  const [wikiResult, kgResult, poResult] = await Promise.allSettled([
    knownMatch ? Promise.resolve(knownMatch.wikipedia) : findWikipediaUrl(entity.name, mainTopic),
    findGoogleKgUrl(entity.name, apiKeys.googleKg, mainTopic),
    isLikelyPerson ? Promise.resolve(null) : findProductOntologyUrl(entity.name),
  ]);

  const wikipediaUrl =
    wikiResult.status === 'fulfilled' ? wikiResult.value : null;
  const googleKgUrl =
    kgResult.status === 'fulfilled' ? kgResult.value : null;
  const productOntologyUrl =
    poResult.status === 'fulfilled' ? poResult.value : null;

  // Phase 2: Wikidata — short-circuit if known
  const wikidataUrl = knownMatch
    ? knownMatch.wikidata
    : await findWikidataUrl(entity.name, wikipediaUrl, mainTopic);

  // Detect entity type (may use Wikidata)
  const type = knownMatch?.type
    ? knownMatch.type
    : await detectEntityType(entity.name, wikidataUrl);

  const enriched = {
    wikipediaUrl,
    wikidataUrl,
    googleKgUrl,
    productOntologyUrl,
    type,
  };

  return {
    name: entity.name,
    ...enriched,
    confidenceScore: calculateConfidenceScore(enriched, baseScore),
  };
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Enrich a batch of raw entities in parallel.
 * Filters out non-entities, enriches the rest, and returns sorted by confidence.
 */
export async function enrichEntities(
  entities: RawEntity[],
  mainTopic: string,
  apiKeys: ApiKeys = {},
): Promise<EnrichedEntity[]> {
  // Limit to 20 entities
  const maxEntities = 20;
  const filtered = entities
    .slice(0, maxEntities)
    .filter((e) => !shouldSkipEntity(e.name));

  const totalEntities = filtered.length;

  // Enrich all entities in parallel
  const results = await Promise.allSettled(
    filtered.map((entity, index) =>
      enrichSingleEntity(entity, index, totalEntities, mainTopic, apiKeys),
    ),
  );

  const enriched: EnrichedEntity[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      enriched.push(result.value);
    }
  }

  // Sort by confidence descending
  enriched.sort((a, b) => b.confidenceScore - a.confidenceScore);

  return enriched;
}
