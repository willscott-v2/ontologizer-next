import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractTextFromHtml } from '../parser';
import {
  detectPrimarySchemaType,
  generateSchemaArtifact,
} from '../schema-generator';
import { analysisFixtures } from './fixtures/manifest';

const fixtureDir = path.join(process.cwd(), 'lib/pipeline/__tests__/fixtures');

function parts(file: string) {
  return extractTextFromHtml(readFileSync(path.join(fixtureDir, file), 'utf8'));
}

describe('connected schema artifact', () => {
  it('classifies representative page types using required visible facts', () => {
    for (const fixture of analysisFixtures.filter((item) =>
      !['ambiguous-entities'].includes(item.id))) {
      const detection = detectPrimarySchemaType(parts(fixture.file));
      expect(detection.type, `${fixture.id}: ${JSON.stringify(detection)}`).toBe(fixture.declaredPageType);
    }
  });

  it('falls back when specialized facts are insufficient', () => {
    const educationMarketing = extractTextFromHtml('<html><head><title>Higher Education Marketing</title></head><body><h1>Marketing for colleges</h1><p>We help universities with student recruitment services.</p></body></html>');
    const marketingDetection = detectPrimarySchemaType(educationMarketing);
    expect(marketingDetection.type, JSON.stringify({ marketingDetection, body: educationMarketing.body })).toBe('Service');

    const contactMention = extractTextFromHtml('<html><head><title>Contact our team</title></head><body><h1>Contact</h1><p>Call our office to ask a question.</p></body></html>');
    expect(detectPrimarySchemaType(contactMention).type).toBe('WebPage');
  });

  it('creates stable graph IDs and resolves every internal relationship', () => {
    for (const fixture of analysisFixtures.slice(0, 5)) {
      const url = `https://example.test/${fixture.id}`;
      const artifact = generateSchemaArtifact([], parts(fixture.file), fixture.expectedMainTopic, url);
      const graph = artifact.jsonLd['@graph'] as Array<Record<string, unknown>>;
      const ids = graph.map((node) => node['@id']).filter(Boolean);
      expect(new Set(ids).size).toBe(ids.length);
      expect(graph.some((node) => node['@id'] === `${url}#webpage`), JSON.stringify(graph)).toBe(true);
      expect(artifact.errors.filter((issue) => issue.code === 'dangling-id')).toEqual([]);
      expect(JSON.stringify(artifact.jsonLd)).not.toContain('google.com/search?q=');
      expect(JSON.stringify(artifact.jsonLd)).not.toMatch(/"sameAs"[^\]]*productontology/i);
    }
  });

  it('cleans FAQ answers and keeps question/answer parity', () => {
    const artifact = generateSchemaArtifact(
      [],
      parts('faq-contamination.html'),
      'Home Energy Audits',
      'https://example.test/energy-audits',
    );
    const serialized = JSON.stringify(artifact.jsonLd);
    expect(serialized).toContain('What does a home energy audit include?');
    expect(serialized).toContain('How long does an audit take?');
    expect(serialized).not.toContain('Schedule now');
    expect(serialized).not.toContain('Related questions');
    expect(serialized).not.toContain('Follow us on social media');
  });

  it('marks artifacts without canonical URLs insufficient', () => {
    const artifact = generateSchemaArtifact([], parts('generic-webpage.html'), 'Coastal Gardening Guide', '');
    expect(artifact.status).toBe('insufficient');
    expect(artifact.errors.some((issue) => issue.code === 'missing-canonical-url')).toBe(true);
  });
});
