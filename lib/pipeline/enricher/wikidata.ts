/**
 * Wikidata URL enricher.
 * Ported from PHP find_wikidata_url_from_wikipedia() (lines 1181-1220),
 * find_wikidata_url_direct() (lines 1222-1286), and supporting functions.
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

// ── From Wikipedia ─────────────────────────────────────────────────────

interface WikipediaPageProps {
  query?: {
    pages?: Record<
      string,
      { pageprops?: { wikibase_item?: string }; title?: string }
    >;
  };
}

interface WikidataEntity {
  entities?: Record<
    string,
    { labels?: { en?: { value?: string } } }
  >;
}

/**
 * Given a Wikipedia URL, query Wikipedia's pageprops to get the wikibase_item
 * and return the corresponding Wikidata URL.
 */
async function findWikidataFromWikipedia(
  wikipediaUrl: string,
): Promise<string | null> {
  // Extract page title from URL
  const pageTitle = decodeURIComponent(wikipediaUrl.split('/').pop() ?? '');
  if (!pageTitle) return null;

  const apiUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&titles=${encodeURIComponent(pageTitle)}&format=json`;
  const data = await fetchJson<WikipediaPageProps>(apiUrl, 6000);
  if (!data?.query?.pages) return null;

  for (const page of Object.values(data.query.pages)) {
    const wikidataId = page.pageprops?.wikibase_item;
    if (!wikidataId) continue;

    // For airport entities, be more lenient with verification
    if (pageTitle.toLowerCase().includes('airport')) {
      return `https://www.wikidata.org/wiki/${wikidataId}`;
    }

    // Verify the Wikidata entity matches
    const verified = await verifyWikidataEntity(wikidataId, pageTitle);
    if (verified) {
      return `https://www.wikidata.org/wiki/${wikidataId}`;
    }
  }

  return null;
}

async function verifyWikidataEntity(
  wikidataId: string,
  expectedTitle: string,
): Promise<boolean> {
  const apiUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${wikidataId}&languages=en&format=json`;
  const data = await fetchJson<WikidataEntity>(apiUrl, 6000);

  const label = data?.entities?.[wikidataId]?.labels?.en?.value;
  if (!label) return false;

  return (
    calculateWikidataMatchScore(
      expectedTitle.toLowerCase(),
      label.toLowerCase(),
      '',
    ) >= 50
  );
}

// ── Direct search ──────────────────────────────────────────────────────

interface WbSearchResult {
  search?: Array<{
    id: string;
    label?: string;
    description?: string;
  }>;
}

/** Detect research papers and overly specific academic content. */
function isWikidataSemanticMismatch(
  _entityLower: string,
  labelLower: string,
  description: string,
): boolean {
  const academicPatterns = [
    /\bin\s+(new\s+zealand|australia|canada|united\s+states|uk|scotland|wales)\b/i,
    /comparison\s+of\s+traditional\s+versus/i,
    /attitudes\s+towards\s+a\s+graduate-entry/i,
    /ranking\s+factors\s+involved\s+in\s+diabetes/i,
    /machine-learning\s+integrating\s+clinical/i,
    /demographics\s+and\s+outcomes\s+in\s+mechanical/i,
    /including\s+migration\s+between\s+the\s+disciplines/i,
    /performance\s+monitoring\s+(by\s+the\s+medial\s+frontal\s+cortex|for\s+action)/i,
    /traffic\s+control\s+collaborative/i,
  ];

  const fullText = `${labelLower} ${description.toLowerCase()}`;
  for (const pat of academicPatterns) {
    if (pat.test(fullText)) return true;
  }

  // Filter out overly long research paper titles
  if (labelLower.length > 100 && labelLower.split(/\s+/).length > 10) {
    return true;
  }

  return false;
}

function calculateWikidataMatchScore(
  entityLower: string,
  labelLower: string,
  description: string,
): number {
  let score = 0;

  if (entityLower === labelLower) {
    score = 100;
  } else if (labelLower.includes(entityLower)) {
    score = 80;
  } else if (entityLower.includes(labelLower)) {
    score = 70;
  } else {
    const entityWords = entityLower.split(/\s+/).filter(Boolean);
    const labelWords = labelLower.split(/\s+/).filter(Boolean);
    const common = entityWords.filter((w) => labelWords.includes(w));
    const ratio = common.length / Math.max(entityWords.length, labelWords.length);
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

/**
 * Search Wikidata directly for an entity.
 */
async function findWikidataDirect(
  entity: string,
  mainTopic?: string,
): Promise<string | null> {
  const entityLower = entity.toLowerCase();
  const contextLower = (mainTopic ?? '').toLowerCase();

  // Context-aware search terms
  let searchTerms = [entity];
  if (
    entityLower === 'academic programs' &&
    contextLower.includes('education')
  ) {
    searchTerms = [
      'academic program',
      'degree program',
      'academic programme',
      'university program',
      entity,
    ];
  }

  for (const term of searchTerms) {
    const apiUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(term)}&language=en&limit=5&format=json`;
    const data = await fetchJson<WbSearchResult>(apiUrl, 8000);

    if (!data?.search?.length) continue;

    let bestScore = 0;
    let bestMatch: (typeof data.search)[number] | null = null;

    for (const result of data.search) {
      const label = result.label ?? '';
      const desc = result.description ?? '';
      const labelLower = label.toLowerCase();

      if (isWikidataSemanticMismatch(entityLower, labelLower, desc)) continue;

      const score = calculateWikidataMatchScore(entityLower, labelLower, desc);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = result;
      }
    }

    if (bestScore >= 75 && bestMatch) {
      return `https://www.wikidata.org/wiki/${bestMatch.id}`;
    }
  }

  return null;
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Find the best Wikidata URL for an entity.
 * Tries to resolve via an existing Wikipedia URL first, then falls back to direct search.
 */
export async function findWikidataUrl(
  entity: string,
  wikipediaUrl: string | null,
  mainTopic?: string,
): Promise<string | null> {
  // Phase 1: from Wikipedia (if available)
  if (wikipediaUrl) {
    const result = await findWikidataFromWikipedia(wikipediaUrl);
    if (result) return result;
  }

  // Phase 2: direct search
  return findWikidataDirect(entity, mainTopic);
}
