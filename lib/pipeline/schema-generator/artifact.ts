import type { SchemaArtifact, SchemaArtifactIssue, TextParts } from '../../types/analysis';
import type { SchemaDetection, SchemaType } from './index';

const SCHEMA_VERSION = 'connected-schema-1';

function nodeTypes(node: Record<string, unknown>): string[] {
  const type = node['@type'];
  return Array.isArray(type) ? type.map(String) : type ? [String(type)] : [];
}

function fragmentForType(type: SchemaType): string {
  return type.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function allowedSameAs(value: string, pageUrl: string): boolean {
  try {
    const candidate = new URL(value);
    const page = pageUrl ? new URL(pageUrl) : null;
    if (page && candidate.hostname === page.hostname) return true;
    if (candidate.hostname.endsWith('wikipedia.org')) return true;
    if (candidate.hostname === 'www.wikidata.org') return /^\/wiki\/Q\d+$/.test(candidate.pathname);
    if (candidate.hostname === 'www.google.com') return candidate.pathname === '/search' && candidate.searchParams.has('kgmid');
    return [
      'linkedin.com', 'www.linkedin.com', 'facebook.com', 'www.facebook.com',
      'instagram.com', 'www.instagram.com', 'youtube.com', 'www.youtube.com',
      'x.com', 'www.x.com', 'twitter.com', 'www.twitter.com',
    ].includes(candidate.hostname);
  } catch {
    return false;
  }
}

function sanitizeSameAs(value: unknown, pageUrl: string): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeSameAs(item, pageUrl));
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(record)) {
    if (key === 'sameAs') {
      const values = Array.isArray(child) ? child : [child];
      const filtered = values.filter((item): item is string =>
        typeof item === 'string' && allowedSameAs(item, pageUrl));
      if (filtered.length) record[key] = [...new Set(filtered)];
      else delete record[key];
    } else {
      record[key] = sanitizeSameAs(child, pageUrl);
    }
  }
  return record;
}

function connectGraph(
  raw: Record<string, unknown>,
  pageType: SchemaType,
  url: string,
): Record<string, unknown> {
  const cloned = structuredClone(raw);
  const hasGraph = Array.isArray(cloned['@graph']);
  if (!hasGraph) delete cloned['@context'];
  const graph = hasGraph
    ? cloned['@graph'] as Array<Record<string, unknown>>
    : [cloned];
  let page = graph.find((node) => nodeTypes(node).includes('WebPage'));
  const pageId = url ? `${url.split('#')[0]}#webpage` : '';
  if (!page && pageType !== 'WebPage') {
    const primary = graph.find((node) => nodeTypes(node).includes(pageType));
    const primaryId = url ? `${url.split('#')[0]}#${fragmentForType(pageType)}` : '';
    if (primary && primaryId) {
      primary['@id'] = primaryId;
      primary.mainEntityOfPage = { '@id': pageId };
    }
    page = {
      '@type': 'WebPage',
      '@id': pageId,
      url,
      name: String(primary?.name ?? primary?.headline ?? ''),
      mainEntity: primaryId ? { '@id': primaryId } : undefined,
    };
    graph.push(page);
  }
  if (page && pageId) page['@id'] = pageId;

  if (page && pageType !== 'WebPage') {
    const embedded = page.mainEntity;
    if (embedded && typeof embedded === 'object' && !Array.isArray(embedded)) {
      const entity = embedded as Record<string, unknown>;
      if (Object.keys(entity).some((key) => key !== '@id')) {
        const entityId = url ? `${url.split('#')[0]}#${fragmentForType(pageType)}` : '';
        if (entityId) {
          entity['@id'] = entityId;
          entity.mainEntityOfPage = { '@id': pageId };
          page.mainEntity = { '@id': entityId };
          if (!graph.some((node) => node['@id'] === entityId)) graph.push(entity);
        }
      }
    }
  }

  const result = { '@context': 'https://schema.org', '@graph': graph };
  return sanitizeSameAs(result, url) as Record<string, unknown>;
}

function collectReferences(value: unknown, references: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectReferences(item, references);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(record)) {
    if (key !== '@id' && child && typeof child === 'object' && !Array.isArray(child)) {
      const childId = (child as Record<string, unknown>)['@id'];
      if (typeof childId === 'string') references.add(childId);
    }
    collectReferences(child, references);
  }
}

function validateArtifact(
  jsonLd: Record<string, unknown>,
  detection: SchemaDetection,
  url: string,
): { errors: SchemaArtifactIssue[]; warnings: SchemaArtifactIssue[] } {
  const errors: SchemaArtifactIssue[] = [];
  const warnings: SchemaArtifactIssue[] = [];
  const graph = jsonLd['@graph'] as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(graph) || graph.length === 0) {
    errors.push({ code: 'missing-graph', message: 'The JSON-LD graph is empty.', action: 'Generate at least one WebPage node.' });
    return { errors, warnings };
  }

  const references = new Set<string>();
  collectReferences(jsonLd, references);
  const idList = graph.map((node) => node['@id']).filter((id): id is string => typeof id === 'string');
  const ids = new Set(idList);
  let pageOrigin = '';
  try { pageOrigin = url ? new URL(url).origin : ''; } catch { pageOrigin = ''; }
  if (new Set(idList).size !== idList.length) {
    errors.push({ code: 'duplicate-id', message: 'Two graph nodes use the same @id.', action: 'Give every graph node one stable, unique URL-derived @id.' });
  }
  for (const reference of references) {
    const isInternal = pageOrigin && reference.startsWith(pageOrigin) && reference.includes('#');
    if (isInternal && !ids.has(reference)) {
      errors.push({ code: 'dangling-id', nodeId: reference, message: `The internal reference ${reference} does not resolve to a graph node.`, action: 'Add the referenced node or remove the unsupported relationship.' });
    }
  }

  const page = graph.find((node) => nodeTypes(node).includes('WebPage'));
  if (!page) {
    errors.push({ code: 'missing-webpage', message: 'No WebPage node was generated.', action: 'Add a WebPage node for the exact canonical URL.' });
  } else {
    if (!page['@id']) errors.push({ code: 'webpage-id', message: 'The WebPage node has no stable @id.', action: 'Supply the canonical page URL before publishing.' });
    if (!page.name) warnings.push({ code: 'webpage-name', property: 'name', message: 'The WebPage has no name.', action: 'Add a visible page title.' });
  }

  if (detection.type !== 'WebPage') {
    const specialized = graph.find((node) => nodeTypes(node).includes(detection.type));
    if (!specialized) {
      errors.push({ code: 'missing-primary-node', message: `The detected ${detection.type} node is missing.`, action: 'Regenerate or fall back to WebPage schema.' });
    } else {
      if (!specialized.name && !specialized.headline) {
        errors.push({ code: 'primary-name', nodeId: String(specialized['@id'] ?? ''), message: `The ${detection.type} node lacks a name or headline.`, action: 'Use a visible page fact for the primary node name.' });
      }
      if (!specialized.mainEntityOfPage) {
        warnings.push({ code: 'main-entity-link', nodeId: String(specialized['@id'] ?? ''), message: 'The primary node is not linked back to the WebPage.', action: 'Add mainEntityOfPage as an @id reference.' });
      }
    }
  }

  if (JSON.stringify(jsonLd).includes('</script')) {
    errors.push({ code: 'script-breakout', message: 'A schema value contains a closing script tag.', action: 'Escape or remove the unsafe value before embedding JSON-LD.' });
  }
  if (!url) {
    errors.push({ code: 'missing-canonical-url', message: 'A canonical page URL is required for stable graph IDs.', action: 'Analyze a URL or provide the canonical URL before publishing.' });
  }
  if (detection.confidence < 0.75) {
    warnings.push({ code: 'page-type-confidence', message: 'The specialized page type did not have enough supporting facts.', action: 'Review the detected type and add missing visible facts before publishing.' });
  }
  return { errors, warnings };
}

function collectJsonLdTypes(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    node.forEach((item) => collectJsonLdTypes(item, out));
    return;
  }
  if (!node || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  const type = record['@type'];
  if (typeof type === 'string') out.add(type);
  else if (Array.isArray(type)) type.forEach((value) => typeof value === 'string' && out.add(value));
  if (record['@graph']) collectJsonLdTypes(record['@graph'], out);
}

export function detectExistingJsonLd(html: string): { found: boolean; types: string[] } {
  const types = new Set<string>();
  let found = false;
  const scriptRe = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRe.exec(html))) {
    found = true;
    try {
      collectJsonLdTypes(JSON.parse(match[1].trim()), types);
    } catch {
      // An unparseable block still counts as existing schema.
    }
  }
  return { found, types: [...types].slice(0, 12) };
}

/** One readable facts-omitted line for entities excluded from the markup. */
function omittedEntitiesFact(names: string[]): string {
  const shown = names.slice(0, 5).join(', ');
  const more = names.length > 5 ? `, +${names.length - 5} more` : '';
  return `${names.length} extracted ${names.length === 1 ? 'entity' : 'entities'} omitted from markup — no external identifiers (${shown}${more})`;
}

export function buildSchemaArtifact(
  raw: Record<string, unknown>,
  detection: SchemaDetection,
  textParts: TextParts,
  url: string,
  omittedEntityNames: string[] = [],
): SchemaArtifact {
  const jsonLd = connectGraph(raw, detection.type, url);
  const { errors, warnings } = validateArtifact(jsonLd, detection, url);
  const existingSchema = detectExistingJsonLd(textParts.htmlContent ?? '');
  if (existingSchema.found) {
    warnings.push({
      code: 'existing-schema',
      message: `This page already publishes JSON-LD${existingSchema.types.length ? ` (${existingSchema.types.join(', ')})` : ''}.`,
      action: 'Merge the generated graph into the existing markup — update matching nodes instead of adding a second schema block.',
    });
  }
  const factsUsed = [
    textParts.title ? 'Page title' : null,
    textParts.description ? 'Meta description' : null,
    textParts.headings.some((heading) => heading.level === 1) ? 'Visible H1' : null,
    ...detection.evidence,
  ].filter((fact): fact is string => Boolean(fact));
  const factsOmitted = [
    !url ? 'Canonical URL' : null,
    !textParts.description ? 'Meta description' : null,
    !textParts.headings.some((heading) => heading.level === 1) ? 'Visible H1' : null,
    omittedEntityNames.length > 0 ? omittedEntitiesFact(omittedEntityNames) : null,
  ].filter((fact): fact is string => Boolean(fact));
  const status: SchemaArtifact['status'] = errors.length > 0
    ? 'insufficient'
    : warnings.length > 0
      ? 'review'
      : 'ready';
  return {
    jsonLd,
    existingSchema,
    pageType: detection,
    status,
    errors,
    warnings,
    factsUsed: [...new Set(factsUsed)],
    factsOmitted: [...new Set(factsOmitted)],
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
  };
}
