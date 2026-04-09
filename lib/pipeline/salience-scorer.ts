/**
 * Topical salience scorer.
 * Calculates a 0-100 score based on entity quality and provides improvement tips.
 *
 * Ported from PHP calculate_topical_salience_score(),
 * get_salience_improvement_tips(), and identify_irrelevant_entities()
 * (lines 3102-3250).
 */

import type { EnrichedEntity } from '../types/entities';
import type { TextParts } from '../types/analysis';

interface SalienceResult {
  score: number;
  tips: string[];
  irrelevantEntities: string[];
}

/**
 * Calculate topical salience and return improvement tips.
 *
 * Score components (weighted average):
 * - 50% average entity confidence score
 * - 35% percentage of high-confidence entities (>= 85)
 * - 15% percentage of entities with Knowledge Graph presence
 */
export function calculateSalience(
  entities: EnrichedEntity[],
  textParts: TextParts,
  mainTopic: string,
): SalienceResult {
  const score = calculateScore(entities);
  const irrelevantEntities = identifyIrrelevantEntities(
    entities,
    textParts,
    mainTopic,
  );
  const tips = getSalienceTips(entities, mainTopic, irrelevantEntities);

  return { score, tips, irrelevantEntities };
}

// ─── Score calculation ──────────────────────────────────────────────────────

function calculateScore(entities: EnrichedEntity[]): number {
  if (entities.length === 0) return 0;

  const totalEntities = entities.length;

  const sumOfScores = entities.reduce(
    (sum, e) => sum + e.confidenceScore,
    0,
  );

  const highConfidenceCount = entities.filter(
    (e) => e.confidenceScore >= 85,
  ).length;

  const kgCount = entities.filter(
    (e) => e.googleKgUrl && e.googleKgUrl.includes('kgmid='),
  ).length;

  // Weighted components
  const avgScoreComponent = sumOfScores / totalEntities; // 0-100
  const highConfidenceComponent =
    (highConfidenceCount / totalEntities) * 100; // 0-100
  const kgComponent = (kgCount / totalEntities) * 100; // 0-100

  const finalScore =
    avgScoreComponent * 0.5 +
    highConfidenceComponent * 0.35 +
    kgComponent * 0.15;

  return Math.round(finalScore);
}

// ─── Irrelevant entity detection ────────────────────────────────────────────

function identifyIrrelevantEntities(
  entities: EnrichedEntity[],
  textParts: TextParts,
  mainTopic: string,
): string[] {
  const irrelevant: string[] = [];
  const mainTopicLc = mainTopic.toLowerCase();

  // Build topic-specific relevance patterns
  const topicPatterns = getTopicRelevancePatterns(mainTopicLc);

  for (const entity of entities) {
    // Never flag high-confidence entities
    if (entity.confidenceScore >= 80) continue;

    const entityLc = entity.name.toLowerCase();

    // Check if entity appears in title, headings, or body (multiple times)
    const inTitle = textParts.title.toLowerCase().includes(entityLc);
    const inHeadings = textParts.headings.some((h) =>
      h.text.toLowerCase().includes(entityLc),
    );
    const bodyLc = textParts.body.toLowerCase();
    const inBody = countOccurrences(bodyLc, entityLc) > 1;

    // If the entity doesn't appear in title, headings, or body more than once,
    // it's a candidate for irrelevance
    if (!inTitle && !inHeadings && !inBody) {
      irrelevant.push(entity.name);
      continue;
    }

    // Check topic relevance if we have patterns
    if (topicPatterns.length > 0) {
      const isTopicRelevant = topicPatterns.some((p) => p.test(entityLc));

      // Check for example entities (e.g. universities mentioned in SEO articles)
      let isExampleEntity = false;
      if (mainTopicLc.includes('seo') || mainTopicLc.includes('search')) {
        if (
          /university|college|school.*business/i.test(entityLc) &&
          !/marketing|seo|search|digital/i.test(entityLc)
        ) {
          isExampleEntity = true;
        }
      }

      if (
        (entity.confidenceScore < 40 && !isTopicRelevant) ||
        isExampleEntity
      ) {
        irrelevant.push(entity.name);
      }
    }
  }

  return irrelevant;
}

function getTopicRelevancePatterns(mainTopicLc: string): RegExp[] {
  // Limo / Transportation
  if (
    mainTopicLc.includes('limo') ||
    mainTopicLc.includes('transportation')
  ) {
    return [
      /airport/i, /transportation/i, /limo/i, /chauffeur/i,
      /car.?service/i, /ground.?transportation/i, /sedan/i,
      /suv/i, /vehicle/i, /limousine/i, /luxury/i,
    ];
  }

  // SEO / Search
  if (mainTopicLc.includes('seo') || mainTopicLc.includes('search')) {
    return [
      /seo/i, /search/i, /ranking/i, /optimization/i,
      /markup/i, /schema/i, /visibility/i, /traffic/i,
      /google/i, /analytics/i, /html/i, /javascript/i,
    ];
  }

  // Higher Education
  if (
    mainTopicLc.includes('higher ed') ||
    mainTopicLc.includes('education')
  ) {
    return [
      /university/i, /college/i, /education/i, /academic/i,
      /student/i, /program/i, /mba/i, /enrollment/i,
      /campus/i, /degree/i,
    ];
  }

  return [];
}

// ─── Improvement tips ───────────────────────────────────────────────────────

function getSalienceTips(
  entities: EnrichedEntity[],
  mainTopic: string,
  irrelevantEntities: string[],
): string[] {
  const tips: string[] = [];

  tips.push(
    `Increase the frequency and contextual relevance of your main topic ('${mainTopic}') throughout the content.`,
  );

  // Check if main topic is a Person with contextual entities
  const mainEntity = entities.find(
    (e) => e.name.toLowerCase() === mainTopic.toLowerCase(),
  );
  const contextualTypes: string[] = [
    'Place', 'Organization', 'Product',
    'Service', 'Concept', 'CreativeWork',
  ];

  if (mainEntity?.type === 'Person') {
    const contextualEntities = entities
      .filter((e) => e.type && contextualTypes.includes(e.type))
      .map((e) => e.name);

    if (contextualEntities.length > 0) {
      tips.push(
        'Strengthen the narrative connection to related entities like: ' +
          contextualEntities.join(', ') +
          '. These entities provide essential context and support topical authority.',
      );
    }
  } else if (irrelevantEntities.length > 0) {
    tips.push(
      'Align or integrate related entities with your main topic where possible. Only consider removing content if it is truly irrelevant or off-topic: ' +
        irrelevantEntities.join(', ') +
        '.',
    );
  }

  tips.push(
    `Add more detailed sections, examples, or FAQs about '${mainTopic}' to boost topical authority.`,
  );

  return tips;
}

// ─── Utility ────────────────────────────────────────────────────────────────

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}
