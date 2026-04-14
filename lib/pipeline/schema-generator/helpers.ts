/**
 * Shared helper functions for schema generators.
 * Ported from various PHP helper methods in class-ontologizer-processor.php.
 */

import * as cheerio from 'cheerio';
import type { EnrichedEntity } from '../../types/entities';
import { extractSocialLinks } from './additional';

/**
 * Extract the origin (scheme + host + trailing slash) from a page URL.
 * Returns empty string if the URL is invalid.
 */
export function getOriginFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '';
  }
}

/**
 * Canonical @id for the site-level Organization node, derived from page URL.
 */
export function organizationId(url: string): string {
  const origin = getOriginFromUrl(url);
  return origin ? `${origin}/#organization` : '';
}

export function webPageId(url: string): string {
  return url ? `${url}#webpage` : '';
}

export function websiteId(url: string): string {
  const origin = getOriginFromUrl(url);
  return origin ? `${origin}/#website` : '';
}

/**
 * Derive the organization name from the page.
 * Priority: og:site_name → application-name → Organization schema extractor
 * output → host (pretty-printed).
 */
function deriveOrgName($: cheerio.CheerioAPI, origin: string): string {
  const candidates = [
    $('meta[property="og:site_name"]').attr('content'),
    $('meta[name="application-name"]').attr('content'),
    $('meta[name="apple-mobile-web-app-title"]').attr('content'),
  ];
  for (const c of candidates) {
    if (c && c.trim().length > 1) return c.trim();
  }

  try {
    const host = new URL(origin).host.replace(/^www\./, '');
    const bare = host.split('.')[0];
    return bare
      .split(/[-_]/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  } catch {
    return '';
  }
}

/**
 * Build the site-level Organization node that other schemas reference by @id.
 * The node includes name, URL, sameAs (social links), and optional logo.
 */
export function buildOrganizationNode(
  url: string,
  htmlContent: string,
): Record<string, unknown> | null {
  const origin = getOriginFromUrl(url);
  if (!origin) return null;

  const $ = cheerio.load(htmlContent || '');
  const name = deriveOrgName($, origin);
  if (!name) return null;

  const node: Record<string, unknown> = {
    '@type': 'Organization',
    '@id': organizationId(url),
    name,
    url: `${origin}/`,
  };

  // Logo: og:image or apple-touch-icon
  const ogImage = $('meta[property="og:image"]').attr('content');
  const logo = $('meta[property="og:logo"]').attr('content') || ogImage;
  if (logo) {
    try {
      const absolute = new URL(logo, origin).href;
      node.logo = { '@type': 'ImageObject', url: absolute };
    } catch {
      // ignore invalid logo URL
    }
  }

  // sameAs from social links
  const socialLinks = extractSocialLinks(htmlContent);
  const ownSocials = socialLinks.filter((href) => {
    try {
      return new URL(href).host !== new URL(origin).host;
    } catch {
      return false;
    }
  });
  if (ownSocials.length > 0) {
    node.sameAs = [...new Set(ownSocials)];
  }

  return node;
}

/**
 * Build the site-level WebSite node (search action target for the homepage).
 */
export function buildWebSiteNode(
  url: string,
  $?: cheerio.CheerioAPI,
): Record<string, unknown> | null {
  const origin = getOriginFromUrl(url);
  if (!origin) return null;

  const node: Record<string, unknown> = {
    '@type': 'WebSite',
    '@id': websiteId(url),
    url: `${origin}/`,
    publisher: { '@id': organizationId(url) },
  };

  if ($) {
    const siteName =
      $('meta[property="og:site_name"]').attr('content')?.trim() ||
      deriveOrgName($, origin);
    if (siteName) node.name = siteName;
  }

  return node;
}


/**
 * Build an array of schema.org Thing objects from enriched entities.
 * Each Thing includes name, optional additionalType, and sameAs links.
 * Ported from PHP build_about_entities().
 */
export function buildAboutEntities(
  entities: EnrichedEntity[],
): Record<string, unknown>[] {
  return entities.map((entity) => {
    const sameAs: string[] = [];
    if (entity.wikipediaUrl) sameAs.push(entity.wikipediaUrl);
    if (entity.wikidataUrl) sameAs.push(entity.wikidataUrl);
    if (entity.googleKgUrl) sameAs.push(entity.googleKgUrl);
    if (entity.linkedinUrl) sameAs.push(entity.linkedinUrl);

    // Use the specific entity type (Person, Organization, etc.) so consumers
    // can tell "Will Scott the person" from "Wikipedia the thing".
    const thing: Record<string, unknown> = {
      '@type': entity.type || 'Thing',
      name: entity.name,
    };

    if (entity.productOntologyUrl) {
      thing.additionalType = entity.productOntologyUrl;
    }

    if (sameAs.length > 0) {
      thing.sameAs = sameAs;
    }

    return thing;
  });
}

/**
 * Build a knowsAbout array for high-confidence entities with KG presence.
 * Ported from PHP build_knows_about_array().
 */
export function buildKnowsAbout(
  entities: EnrichedEntity[],
  maxItems = 12,
): Record<string, unknown>[] {
  const relevant = entities.filter(
    (e) => e.confidenceScore > 60 && e.wikipediaUrl,
  );

  return relevant.slice(0, maxItems).map((entity) => {
    const sameAs: string[] = [];
    if (entity.wikipediaUrl) sameAs.push(entity.wikipediaUrl);
    if (entity.googleKgUrl) sameAs.push(entity.googleKgUrl);

    const thing: Record<string, unknown> = {
      '@type': 'Thing',
      name: entity.name.toLowerCase(),
    };

    if (sameAs.length > 0) {
      thing.sameAs = sameAs;
    }

    return thing;
  });
}

/**
 * Extract the primary name from a page title by stripping common separators.
 * "Service Name | Company" -> "Service Name"
 */
export function extractNameFromTitle(title: string): string {
  if (!title) return '';
  const cleaned = title.replace(/\s*[-|]\s*.+$/, '').trim();
  return cleaned || title;
}

/**
 * Add speakable specification for voice search optimization.
 */
export function addSpeakable(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...schema,
    speakable: {
      '@type': 'SpeakableSpecification',
      xpath: [
        '/html/head/title',
        '/html/head/meta[@name="description"]',
        '/html/body//h1',
        '/html/body//h2',
        '/html/body//h3',
        '/html/body//p',
      ],
    },
  };
}

/**
 * Validate and enhance a schema with required properties and speakable.
 * Ported from PHP validate_and_enhance_schema().
 */
export function validateAndEnhance(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  if (!schema['@context']) {
    schema['@context'] = 'https://schema.org';
  }
  if (!schema['@type']) {
    schema['@type'] = 'Thing';
  }

  const schemaType = schema['@type'] as string;
  if (['WebPage', 'Article'].includes(schemaType)) {
    return addSpeakable(schema);
  }

  return schema;
}
