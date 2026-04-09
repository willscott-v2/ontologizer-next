/**
 * ProductOntology URL enricher.
 * Ported from PHP find_productontology_url() (lines 1478-1500).
 */

/**
 * Check if a URL responds with HTTP 200 via a HEAD request.
 */
async function urlExists(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generate slug variants from an entity name.
 */
function generateSlugs(entity: string): string[] {
  const lower = entity.toLowerCase();
  return [
    // Ucwords_With_Underscores
    lower
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('_'),
    // lowercase-with-hyphens
    lower.replace(/\s+/g, '-'),
    // lowercase_with_underscores
    lower.replace(/\s+/g, '_'),
    // Capitalized (first letter only)
    lower.charAt(0).toUpperCase() + lower.slice(1),
    // UPPERCASE
    entity.toUpperCase(),
  ];
}

/**
 * Find a ProductOntology URL for an entity.
 * Tries multiple URL patterns with HEAD requests.
 * Returns the first URL that responds with 200, or null.
 */
export async function findProductOntologyUrl(
  entity: string,
): Promise<string | null> {
  const slugs = [...new Set(generateSlugs(entity))]; // deduplicate
  const paths = ['/id/', '/doc/'];

  for (const path of paths) {
    for (const slug of slugs) {
      const url = `http://www.productontology.org${path}${slug}`;
      if (await urlExists(url)) {
        return url;
      }
    }
  }

  return null;
}
