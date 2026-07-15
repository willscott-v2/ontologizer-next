import { describe, expect, it } from 'vitest';
import { estimateTopicConfidence, extractEntitiesBasic, normalizeExtractedEntities } from '../entity-extractor';
import { extractTextFromHtml } from '../parser';

describe('entity extraction contract', () => {
  it('deduplicates and caps model entities at the downstream route limit', () => {
    const values = Array.from({ length: 25 }, (_, index) => `Entity ${index + 1}`);
    values.splice(4, 0, ' entity 1 ');
    const entities = normalizeExtractedEntities(values);
    expect(entities).toHaveLength(20);
    expect(entities[0]).toEqual({ name: 'Entity 1' });
    expect(new Set(entities.map(({ name }) => name.toLowerCase())).size).toBe(20);
  });

  it('keeps regex fallback output inside the same limit', () => {
    const text = Array.from({ length: 30 }, (_, index) => `Named Concept${String.fromCharCode(65 + (index % 26))}`).join('. ');
    expect(extractEntitiesBasic(text).length).toBeLessThanOrEqual(20);
  });

  it('bases topic confidence on visible prominence instead of a fixed value', () => {
    const strong = extractTextFromHtml('<html><head><title>Technical SEO Audits</title><meta name="description" content="Technical SEO audit services."></head><body><main><h1>Technical SEO Audits</h1><p>Technical SEO audits identify crawl and indexing issues.</p></main></body></html>');
    const weak = extractTextFromHtml('<html><head><title>Example Agency</title></head><body><main><h1>Welcome</h1><p>Our team helps organizations. A technical audit is one available option.</p></main></body></html>');
    expect(estimateTopicConfidence('Technical SEO Audits', strong)).toBeGreaterThan(0.85);
    expect(estimateTopicConfidence('Technical SEO Audits', weak)).toBeLessThan(0.5);
  });
});
