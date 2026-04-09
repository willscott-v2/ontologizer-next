/**
 * Wikipedia URL enricher.
 * Ported from PHP find_wikipedia_url(), find_best_wikipedia_match(),
 * calculate_wikipedia_match_score(), verify_wikipedia_page_content()
 * (lines 844-1179).
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

/** Semantic mismatches: entity pattern -> forbidden title substrings. */
const SEMANTIC_MISMATCHES: Record<string, string[]> = {
  seo: ['seoul', 'ai seoul summit'],
  'ai seo': ['seoul', 'ai seoul summit'],
  'colleges & universities': ['wood county', 'texas', 'in wood county'],
  'higher education': ['accreditation', 'higher education accreditation'],
  'academic programs': ['international', 'academic programs international'],
  analytics: ['google analytics', 'web analytics'],
  'content marketing': ['strategy', 'content marketing strategy'],
};

const IRRELEVANT_TITLE_PATTERNS = [
  /food.?depository/i,
  /ufo.?sighting/i,
  /transit.?system/i,
  /gen.?z.?slang/i,
  /mba.?programme.?rankings/i,
  /soccer.?league/i,
  /marine.?consortium/i,
  /^search.?ranking$/i,
  /wood.?county/i,
  /in.?texas/i,
  /texas$/i,
  /\(.+\)$/, // parenthetical descriptions (unless exact match)
];

// ── Scoring ────────────────────────────────────────────────────────────

function calculateWikipediaMatchScore(
  entityLower: string,
  titleLower: string,
  titleOriginal: string,
): number {
  let score = 0;

  if (entityLower === titleLower) {
    score = 100;
  } else if (
    entityLower.includes('airport') &&
    titleLower.includes('airport')
  ) {
    const entityName = entityLower
      .replace(/airport/g, '')
      .replace(/international/g, '')
      .trim();
    const titleName = titleLower
      .replace(/airport/g, '')
      .replace(/international/g, '')
      .trim();
    if (entityName === titleName) {
      score = 95;
    } else if (titleName.includes(entityName) || entityName.includes(titleName)) {
      score = 85;
    }
  } else if (titleLower.includes(entityLower)) {
    const titleWords = titleLower.split(/\s+/);
    const entityWords = entityLower.split(/\s+/);
    const extraWords = titleWords.length - entityWords.length;
    score = extraWords <= 2 ? 85 : 60;
  } else if (entityLower.includes(titleLower)) {
    score = 75;
  } else {
    // Word-based matching
    const stopWords = new Set([
      'the', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by',
    ]);
    const entityWords = entityLower
      .split(/\s+/)
      .filter((w) => w && !stopWords.has(w));
    const titleWords = titleLower
      .split(/\s+/)
      .filter((w) => w && !stopWords.has(w));

    if (entityWords.length === 0 || titleWords.length === 0) {
      score = 0;
    } else {
      const common = entityWords.filter((w) => titleWords.includes(w));
      const entityRatio = common.length / entityWords.length;
      const titleRatio = common.length / titleWords.length;
      const minRatio = Math.min(entityRatio, titleRatio);
      const avgRatio = (entityRatio + titleRatio) / 2;

      score = minRatio >= 0.7 && avgRatio >= 0.8 ? avgRatio * 50 : 0;
    }
  }

  // Bonus for proper capitalization
  if (/^[A-Z][a-z]/.test(titleOriginal)) {
    score += 5;
  }

  // Penalty for very long titles
  if (titleOriginal.length > entityLower.length * 2.5) {
    score -= 30;
  }

  // Penalty for unwanted geographic specificity
  const geoPattern =
    /\b(county|texas|california|florida|new york|state|city)\b/i;
  const entityHasGeo = geoPattern.test(entityLower);
  const titleHasGeo = geoPattern.test(titleLower);
  if (!entityHasGeo && titleHasGeo) {
    score -= 40;
  }

  return Math.max(0, score);
}

// ── Verification ───────────────────────────────────────────────────────

async function verifyWikipediaPageContent(
  url: string,
  entityLower: string,
): Promise<boolean> {
  const pageTitle = decodeURIComponent(url.split('/').pop() ?? '');
  const apiUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&titles=${encodeURIComponent(pageTitle)}&format=json&exlimit=1`;

  const data = await fetchJson<{
    query?: { pages?: Record<string, { extract?: string }> };
  }>(apiUrl, 6000);

  if (!data?.query?.pages) return false;

  for (const page of Object.values(data.query.pages)) {
    if (page.extract) {
      // Strip HTML tags from the extract
      const extract = page.extract.replace(/<[^>]+>/g, '');
      const extractLower = extract.toLowerCase();

      // Check entity name in first paragraph
      if (extractLower.includes(entityLower)) return true;

      // Check entity words
      const words = entityLower.split(/\s+/).filter((w) => w.length > 2);
      if (words.length === 0) return false;
      const foundWords = words.filter((w) => extractLower.includes(w)).length;
      return foundWords / words.length >= 0.5;
    }
  }

  return false;
}

// ── Best match selection ───────────────────────────────────────────────

interface WikiMatch {
  title: string;
  url: string;
  confidence: number;
}

async function findBestWikipediaMatch(
  entity: string,
  titles: string[],
  urls: string[],
): Promise<WikiMatch | null> {
  const entityLower = entity.toLowerCase().trim();
  let bestMatch: WikiMatch | null = null;
  let bestScore = 0;

  const count = Math.min(titles.length, urls.length);

  for (let i = 0; i < count; i++) {
    const title = titles[i];
    const url = urls[i];
    const titleLower = title.toLowerCase();

    // Semantic mismatch check
    let isMismatch = false;
    for (const [pattern, forbidden] of Object.entries(SEMANTIC_MISMATCHES)) {
      if (entityLower.includes(pattern)) {
        if (forbidden.some((f) => titleLower.includes(f))) {
          isMismatch = true;
          break;
        }
      }
    }
    if (isMismatch) continue;

    // SEO/Seoul special case
    if (entityLower === 'seo' && titleLower.includes('seoul')) continue;

    // Irrelevant pattern check
    let isIrrelevant = false;
    for (const pat of IRRELEVANT_TITLE_PATTERNS) {
      if (pat.test(titleLower) && entityLower !== titleLower) {
        isIrrelevant = true;
        break;
      }
    }
    if (isIrrelevant) continue;

    let score = calculateWikipediaMatchScore(entityLower, titleLower, title);

    // Minimum score thresholds
    const minScore = title.includes('(') ? 85 : 65;

    // Content verification for high-scoring matches
    if (score > 70) {
      const contentMatch = await verifyWikipediaPageContent(url, entityLower);
      score += contentMatch ? 10 : -30;
    }

    // Disambiguation penalty
    if (titleLower.includes('disambiguation')) {
      score -= 50;
    }

    // Redirect/stub penalty
    if (titleLower.includes('redirect') || titleLower.includes('stub')) {
      score -= 30;
    }

    if (score > bestScore && score >= minScore) {
      bestScore = score;
      bestMatch = { title, url, confidence: score };
    }
  }

  return bestScore >= 65 ? bestMatch : null;
}

// ── Search helpers ─────────────────────────────────────────────────────

type OpenSearchResult = [string, string[], string[], string[]];

async function searchWikipedia(
  searchTerm: string,
  limit = 5,
): Promise<OpenSearchResult | null> {
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(searchTerm)}&limit=${limit}&namespace=0&format=json`;
  return fetchJson<OpenSearchResult>(url, 8000);
}

async function tryWikipediaSearch(
  searchTerm: string,
  entity: string,
): Promise<string | null> {
  const data = await searchWikipedia(searchTerm);
  if (!data || !data[1]?.length || !data[3]?.length) return null;

  const match = await findBestWikipediaMatch(entity, data[1], data[3]);
  return match && match.confidence >= 65 ? match.url : null;
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Find the best Wikipedia URL for an entity name, with context-aware search.
 * Returns the URL or null.
 */
export async function findWikipediaUrl(
  entity: string,
  mainTopic?: string,
): Promise<string | null> {
  const entityLower = entity.toLowerCase();
  const contextLower = (mainTopic ?? '').toLowerCase();

  // Special handling for common abbreviations
  if (entityLower === 'seo') {
    const searchTerms = [
      'Search Engine Optimization',
      'SEO Search Engine Optimization',
      'Search engine optimization',
    ];
    for (const term of searchTerms) {
      const result = await tryWikipediaSearch(term, entity);
      if (result) return result;
    }
  }

  // Determine search term
  let searchTerm = entity;
  if (
    entityLower === 'academic programs' &&
    contextLower.includes('education')
  ) {
    searchTerm = 'Academic program education';
  } else if (
    entityLower === "o'hare airport" ||
    entityLower === 'ohare airport' ||
    entityLower === "o'hare" ||
    entityLower === 'ohare'
  ) {
    searchTerm = "O'Hare International Airport";
  } else if (/(.+)\s+airport$/i.test(entity)) {
    const airportName = entity.replace(/\s+airport$/i, '').trim();
    searchTerm = `${airportName} International Airport`;
  }

  const data = await searchWikipedia(searchTerm);
  if (!data || !data[1]?.length || !data[3]?.length) return null;

  const match = await findBestWikipediaMatch(entity, data[1], data[3]);
  return match?.url ?? null;
}
