import { afterEach, describe, expect, it, vi } from 'vitest';
import { findGoogleKgUrl } from '../enricher/google-kg';
import { buildAboutEntities } from '../schema-generator/helpers';

afterEach(() => vi.unstubAllGlobals());

describe('verified Google Knowledge Graph links', () => {
  it('retains a real KGMID result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        itemListElement: [{ result: { '@id': 'kg:/m/045c7b', name: 'OpenAI', description: 'AI research company' } }],
      }),
    })));
    await expect(findGoogleKgUrl('OpenAI', 'key', 'AI platforms')).resolves.toBe(
      'https://www.google.com/search?kgmid=/m/045c7b',
    );
  });

  it('returns null when no verified result exists', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ itemListElement: [] }) })));
    await expect(findGoogleKgUrl('Unknown Entity', 'key', 'Topic')).resolves.toBeNull();
    await expect(findGoogleKgUrl('Unknown Entity')).resolves.toBeNull();
  });

  it('never adds a generic Google search URL to sameAs', () => {
    const [entity] = buildAboutEntities([{
      name: 'OpenAI',
      type: 'Organization',
      confidenceScore: 90,
      wikipediaUrl: 'https://en.wikipedia.org/wiki/OpenAI',
      wikidataUrl: null,
      googleKgUrl: 'https://www.google.com/search?q=OpenAI',
      productOntologyUrl: null,
    }]);
    expect(entity.sameAs).toEqual(['https://en.wikipedia.org/wiki/OpenAI']);
  });

  it('excludes an entity whose only source is a generic Google search URL', () => {
    expect(buildAboutEntities([{
      name: 'OpenAI',
      type: 'Organization',
      confidenceScore: 90,
      wikipediaUrl: null,
      wikidataUrl: null,
      googleKgUrl: 'https://www.google.com/search?q=OpenAI',
      productOntologyUrl: null,
    }])).toEqual([]);
  });
});
