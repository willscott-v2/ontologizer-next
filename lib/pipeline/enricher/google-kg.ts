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

      // Only return matches with reasonable confidence
      if (bestScore >= 60 && bestResult?.['@id']) {
        const mid = bestResult['@id'].replace('kg:', '');
        return `https://www.google.com/search?kgmid=${mid}`;
      }
    }
  }

  // Fallback to generic Google search
  return getGoogleSearchFallbackUrl(entity);
}
