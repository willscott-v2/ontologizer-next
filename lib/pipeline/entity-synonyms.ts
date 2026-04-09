/**
 * Static synonym/alias map for flexible entity matching.
 * Ported from PHP $entity_synonyms + normalize_entity() + get_entity_variants() (lines 13-48).
 */

const entitySynonyms: Record<string, string[]> = {
  seo: ['search engine optimization', 'seo'],
  'search engine optimization': ['seo', 'search engine optimization'],
  ppc: ['pay per click', 'ppc'],
  'pay per click': ['ppc', 'pay per click'],
  sem: ['search engine marketing', 'sem'],
  'search engine marketing': ['sem', 'search engine marketing'],
  'higher education': ['higher education', 'university', 'college'],
  'digital marketing': ['digital marketing', 'online marketing'],
  'content marketing': ['content marketing'],
  smm: ['social media marketing', 'smm'],
  'social media marketing': ['smm', 'social media marketing'],
};

/**
 * Normalize a string to its canonical synonym key (lowercase, trimmed).
 */
export function normalizeEntity(entity: string): string {
  const lc = entity.toLowerCase().trim();
  for (const [key, aliases] of Object.entries(entitySynonyms)) {
    if (aliases.includes(lc)) {
      return key;
    }
  }
  return lc;
}

/**
 * Get all synonym/alias variants for an entity.
 */
export function getEntityVariants(entity: string): string[] {
  const lc = entity.toLowerCase().trim();
  for (const aliases of Object.values(entitySynonyms)) {
    if (aliases.includes(lc)) {
      return aliases;
    }
  }
  return [lc];
}
