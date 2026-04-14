/**
 * Google Knowledge Graph enricher.
 * Ported from PHP find_google_kg_url() and calculate_google_kg_match_score()
 * (lines 1383-1477).
 */

// ── Helpers ────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Scoring ────────────────────────────────────────────────────────────

function calculateGoogleKgMatchScore(
  entityLower: string,
  nameLower: string,
  description: string,
): number {
  let score = 0;

  if (entityLower === nameLower) {
    score = 100;
  } else if (nameLower.includes(entityLower)) {
    score = 80;
  } else if (entityLower.includes(nameLower)) {
    score = 70;
  } else {
    const entityWords = entityLower.split(/\s+/).filter(Boolean);
    const nameWords = nameLower.split(/\s+/).filter(Boolean);
    const common = entityWords.filter((w) => nameWords.includes(w));
    const ratio = common.length / Math.max(entityWords.length, nameWords.length);
    score = ratio * 60;
  }

  // Bonus for description relevance
  if (description) {
    const descLower = description.toLowerCase();
    const entityWords = entityLower.split(/\s+/).filter(Boolean);
    const foundWords = entityWords.filter(
      (w) => w.length > 2 && descLower.includes(w),
    ).length;
    score += (foundWords / Math.max(entityWords.length, 1)) * 20;
  }

  return Math.max(0, score);
}

function getGoogleSearchFallbackUrl(entity: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(entity)}`;
}

function looksLikePersonName(name: string): boolean {
  return /^[A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+$/.test(name.trim());
}

const UNRELATED_PROFESSION_WORDS = [
  'musician', 'singer', 'songwriter', 'rapper', 'drummer', 'guitarist',
  'pianist', 'violinist', 'composer', 'bassist', 'bandleader',
  'actor', 'actress', 'filmmaker', 'screenwriter', 'playwright',
  'athlete', 'footballer', 'basketball player', 'baseball player',
  'ice hockey', 'rugby player', 'cricketer', 'wrestler', 'boxer',
  'politician', 'senator', 'governor', 'diplomat', 'ambassador',
  'soldier', 'general', 'admiral', 'military officer',
  'novelist', 'poet', 'essayist',
];

/**
 * Strict person-context check for Google KG results. Reject the match unless
 * the description shares a 2+ word phrase with mainTopic, OR — for short
 * topics — shares a meaningful single word AND doesn't look like an obviously
 * unrelated profession bio.
 */
function passesPersonContextCheck(
  entity: string,
  description: string,
  mainTopic: string,
): boolean {
  if (!looksLikePersonName(entity) || !mainTopic || !description) return true;

  const descLower = description.toLowerCase();
  const topicLower = mainTopic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const stopWords = new Set([
    'the', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with',
    'by', 'a', 'an', 'is', 'are', 'was', 'were',
    'services', 'service', 'solutions',
  ]);
  const topicWords = topicLower
    .split(' ')
    .filter((w) => w.length >= 4 && !stopWords.has(w));

  if (topicWords.length >= 2) {
    for (let n = Math.min(3, topicWords.length); n >= 2; n--) {
      for (let i = 0; i <= topicWords.length - n; i++) {
        const phrase = topicWords.slice(i, i + n).join(' ');
        if (descLower.includes(phrase)) return true;
      }
    }
    // Unrelated profession signal without any phrase match → reject
    return false;
  }

  if (topicWords.length === 1) {
    const hasTopicWord = descLower.includes(topicWords[0]);
    if (!hasTopicWord) return false;
    // Even if the single word appears, reject when the description is
    // clearly about an unrelated profession
    if (UNRELATED_PROFESSION_WORDS.some((w) => descLower.includes(w))) {
      return false;
    }
    return true;
  }

  return true;
}

// ── KG API types ───────────────────────────────────────────────────────

interface KgResult {
  '@id'?: string;
  name?: string;
  description?: string;
}

interface KgResponse {
  itemListElement?: Array<{ result?: KgResult }>;
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Find the Google Knowledge Graph URL for an entity.
 * If an API key is provided, queries the KG Search API.
 * Otherwise falls back to a plain Google search URL.
 */
export async function findGoogleKgUrl(
  entity: string,
  apiKey?: string,
  mainTopic?: string,
): Promise<string | null> {
  if (apiKey) {
    const apiUrl = `https://kgsearch.googleapis.com/v1/entities:search?query=${encodeURIComponent(entity)}&key=${apiKey}&limit=5&types=Thing`;
    const data = await fetchJson<KgResponse>(apiUrl, 6000);

    if (data?.itemListElement?.length) {
      const entityLower = entity.toLowerCase().trim();
      let bestScore = 0;
      let bestResult: KgResult | null = null;

      for (const item of data.itemListElement) {
        if (!item.result) continue;
        const name = item.result.name ?? '';
        const description = item.result.description ?? '';
        const nameLower = name.toLowerCase();

        const score = calculateGoogleKgMatchScore(
          entityLower,
          nameLower,
          description,
        );

        if (score > bestScore) {
          bestScore = score;
          bestResult = item.result;
        }
      }

      // Person context check: if the entity looks like a personal name and
      // the winning KG description doesn't align with the page topic, drop it.
      if (
        bestResult &&
        !passesPersonContextCheck(
          entity,
          bestResult.description ?? '',
          mainTopic ?? '',
        )
      ) {
        bestResult = null;
      }

      if (bestScore >= 60 && bestResult?.['@id']) {
        const mid = bestResult['@id'].replace('kg:', '');
        return `https://www.google.com/search?kgmid=${mid}`;
      }
    }
  }

  // Fallback to generic Google search
  return getGoogleSearchFallbackUrl(entity);
}
