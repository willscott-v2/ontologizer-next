import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractTextFromHtml } from '../parser';
import {
  detectPrimarySchemaType,
  generateSchemaArtifact,
} from '../schema-generator';
import { generateEducationalSchema } from '../schema-generator/educational';
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

  it('does not mistake institutional homepages, profiles, or article cards for specialized pages', () => {
    const universityHome = extractTextFromHtml('<html><head><title>Example University</title><meta property="og:type" content="website"></head><body><main><h1>Example University</h1><p>Study, research, and campus life.</p><article><h2>Campus news</h2><time datetime="2026-01-01">January 1</time><span rel="author">News Team</span></article></main></body></html>');
    expect(detectPrimarySchemaType(universityHome).type).toBe('WebPage');

    const profile = extractTextFromHtml('<html><head><title>Jane Smith, Author</title><meta property="og:type" content="profile"></head><body><main><h1>Jane Smith</h1><p>Jane writes about search and analytics.</p></main></body></html>');
    expect(detectPrimarySchemaType(profile).type).toBe('WebPage');

    const developerPortal = extractTextFromHtml('<html><head><title>Developer Documentation</title><meta property="og:type" content="article"><meta property="article:published_time" content="2026-01-01"><meta name="author" content="Docs Team"></head><body><main><article><h1>Developer Documentation</h1><p>Build and integrate with the platform APIs.</p></article></main></body></html>');
    expect(detectPrimarySchemaType(developerPortal, 'https://example.test/').type).toBe('WebPage');
    expect(detectPrimarySchemaType(developerPortal, 'https://example.test/guides/integration').type).toBe('Article');
  });

  it('requires visible support for optional Service fields', () => {
    const genericService = extractTextFromHtml('<html><head><title>Home Alarm Installation</title><meta name="description" content="Alarm installation for homeowners."></head><body><main><h1>Home Alarm Installation</h1><p>We provide alarm installation services. Request a quote.</p></main></body></html>');
    const artifact = generateSchemaArtifact([], genericService, 'Home Alarm Installation', 'https://example.test/alarm');
    const serialized = JSON.stringify(artifact.jsonLd);
    expect(artifact.pageType.type).toBe('Service');
    expect(serialized).not.toContain('Professional Service');
    expect(serialized).not.toContain('areaServed');
    expect(serialized).not.toContain('category');
  });

  it('omits weak author and educational-provider guesses', () => {
    const article = extractTextFromHtml('<html><head><title>Testing Guide</title><meta property="og:type" content="article"><meta name="author" content="PANDA1001"></head><body><main><h1>Testing Guide</h1><p>A detailed guide to testing.</p></main></body></html>');
    const articleArtifact = generateSchemaArtifact([], article, 'Testing Guide', 'https://example.test/guide');
    expect(JSON.stringify(articleArtifact.jsonLd)).not.toContain('PANDA1001');

    const program = extractTextFromHtml('<html><head><title>Best Choice: Affordable Online Degrees</title></head><body><main><h1>Affordable Online Degree</h1><p>This 30-credit degree includes curriculum and admissions requirements.</p></main></body></html>');
    expect(JSON.stringify(generateEducationalSchema([], program, 'https://example.test/program'))).not.toContain('"provider"');
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
