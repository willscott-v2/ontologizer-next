import { describe, expect, it } from 'vitest';
import { buildAboutEntities, hasExternalIdentifier } from '../schema-generator/helpers';
import { generateWebPageSchema } from '../schema-generator/webpage';
import { generateSchemaArtifact } from '../schema-generator';
import type { EnrichedEntity } from '../../types/entities';
import type { TextParts } from '../../types/analysis';

const resolved = (name: string, overrides: Partial<EnrichedEntity> = {}): EnrichedEntity => ({
  name,
  type: 'Organization',
  confidenceScore: 90,
  wikipediaUrl: `https://en.wikipedia.org/wiki/${name.replace(/\s/g, '_')}`,
  wikidataUrl: 'https://www.wikidata.org/wiki/Q1',
  googleKgUrl: null,
  productOntologyUrl: null,
  ...overrides,
});

const unresolved = (name: string): EnrichedEntity => ({
  name,
  type: 'Thing',
  confidenceScore: 40,
  wikipediaUrl: null,
  wikidataUrl: null,
  googleKgUrl: null,
  productOntologyUrl: null,
});

const textParts: TextParts = {
  title: 'OpenAI Stock | Forge Global',
  description: 'How investors access OpenAI pre-IPO shares.',
  headings: [{ level: 1, text: 'OpenAI Stock' }],
  body: 'OpenAI is a private company.',
  htmlContent: '<html><head><title>OpenAI Stock</title></head><body><h1>OpenAI Stock</h1></body></html>',
};

describe('buildAboutEntities resolution filter', () => {
  it('keeps a resolved entity with its sameAs identifiers', () => {
    const [entity] = buildAboutEntities([resolved('OpenAI')]);
    expect(entity).toMatchObject({ '@type': 'Organization', name: 'OpenAI' });
    expect(entity.sameAs).toEqual([
      'https://en.wikipedia.org/wiki/OpenAI',
      'https://www.wikidata.org/wiki/Q1',
    ]);
  });

  it('excludes entities with no external identifiers', () => {
    const things = buildAboutEntities([
      resolved('OpenAI'),
      unresolved('OpenAI stock ticker'),
      unresolved('Upcoming IPO'),
    ]);
    expect(things).toHaveLength(1);
    expect(things[0].name).toBe('OpenAI');
  });

  it('keeps a ProductOntology-only entity', () => {
    const [entity] = buildAboutEntities([
      resolved('ChatGPT', {
        wikipediaUrl: null,
        wikidataUrl: null,
        productOntologyUrl: 'http://www.productontology.org/id/Chatgpt',
      }),
    ]);
    expect(entity).toMatchObject({
      name: 'ChatGPT',
      additionalType: 'http://www.productontology.org/id/Chatgpt',
    });
  });

  it('treats a verified KGMID as an identifier', () => {
    expect(hasExternalIdentifier(resolved('OpenAI', {
      wikipediaUrl: null,
      wikidataUrl: null,
      googleKgUrl: 'https://www.google.com/search?kgmid=/m/045c7b',
    }))).toBe(true);
  });
});

describe('generated schema with unresolved entities', () => {
  it('omits about/mentions entirely when no entity resolved', () => {
    const schema = generateWebPageSchema(
      [unresolved('OpenAI stock ticker'), unresolved('Upcoming IPO')],
      textParts,
      'https://forgeglobal.com/openai_stock/',
    );
    const graph = schema['@graph'] as Record<string, unknown>[];
    const webPage = graph.find((node) => node['@type'] === 'WebPage')!;
    expect(webPage.about).toBeUndefined();
    expect(webPage.mentions).toBeUndefined();
  });

  it('records omitted entities in factsOmitted', () => {
    const artifact = generateSchemaArtifact(
      [resolved('OpenAI'), unresolved('OpenAI stock ticker'), unresolved('Upcoming IPO')],
      textParts,
      'OpenAI Stock',
      'https://forgeglobal.com/openai_stock/',
    );
    const fact = artifact.factsOmitted.find((entry) => entry.includes('omitted from markup'));
    expect(fact).toContain('2 extracted entities');
    expect(fact).toContain('OpenAI stock ticker');
    expect(fact).toContain('Upcoming IPO');
  });

  it('adds no omission fact when every entity resolved', () => {
    const artifact = generateSchemaArtifact(
      [resolved('OpenAI')],
      textParts,
      'OpenAI Stock',
      'https://forgeglobal.com/openai_stock/',
    );
    expect(artifact.factsOmitted.some((entry) => entry.includes('omitted from markup'))).toBe(false);
  });
});
