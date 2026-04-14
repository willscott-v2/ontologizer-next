/**
 * WebPage schema generator (fallback default).
 * Emits a @graph with Organization + WebSite + WebPage so the site-level
 * Organization is discoverable from every page.
 */

import * as cheerio from 'cheerio';
import type { EnrichedEntity } from '../../types/entities';
import type { TextParts } from '../../types/analysis';
import {
  buildAboutEntities,
  buildOrganizationNode,
  buildWebSiteNode,
  organizationId,
  webPageId,
  websiteId,
} from './helpers';
import { extractAdditionalSchemas } from './additional';

export function generateWebPageSchema(
  entities: EnrichedEntity[],
  textParts: TextParts,
  url: string,
): Record<string, unknown> {
  const $ = cheerio.load(textParts.htmlContent || '');
  const orgNode = buildOrganizationNode(url, textParts.htmlContent);
  const websiteNode = buildWebSiteNode(url, $);

  const webPageNode: Record<string, unknown> = {
    '@type': 'WebPage',
    '@id': webPageId(url),
    url,
  };

  if (textParts.title) webPageNode.name = textParts.title;
  if (textParts.description) webPageNode.description = textParts.description;

  if (orgNode) {
    webPageNode.publisher = { '@id': organizationId(url) };
  }
  if (websiteNode) {
    webPageNode.isPartOf = { '@id': websiteId(url) };
  }

  const ogImage = $('meta[property="og:image"]').attr('content');
  if (ogImage) {
    try {
      webPageNode.primaryImageOfPage = new URL(ogImage, url).href;
    } catch {
      // ignore
    }
  }

  // Additional schemas
  const additional = extractAdditionalSchemas(textParts.htmlContent);
  if (additional.author) {
    webPageNode.author = additional.author;
  }
  if (additional.faq) {
    webPageNode.mainEntity = additional.faq;
  }
  if (additional.howto) {
    webPageNode.mainEntity = additional.howto;
  }

  // Entity references
  const aboutEntities = buildAboutEntities(entities);
  if (aboutEntities.length > 0) {
    webPageNode.about = aboutEntities.slice(0, 4);
    if (aboutEntities.length > 4) {
      webPageNode.mentions = aboutEntities.slice(4, 10);
    }
  }

  webPageNode.speakable = {
    '@type': 'SpeakableSpecification',
    xpath: [
      '/html/head/title',
      '/html/head/meta[@name="description"]',
      '/html/body//h1',
      '/html/body//h2',
    ],
  };

  const graph: Record<string, unknown>[] = [];
  if (orgNode) graph.push(orgNode);
  if (websiteNode) graph.push(websiteNode);
  graph.push(webPageNode);

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  };
}
