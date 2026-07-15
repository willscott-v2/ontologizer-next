import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractTextFromHtml } from '../parser';
import { generateJsonLd } from '../schema-generator';
import { analysisFixtures } from './fixtures/manifest';

const fixtureDir = path.join(process.cwd(), 'lib/pipeline/__tests__/fixtures');

function loadFixture(file: string): string {
  return readFileSync(path.join(fixtureDir, file), 'utf8');
}

describe('analysis regression fixtures', () => {
  it('has unique IDs and complete fixture metadata', () => {
    const ids = analysisFixtures.map((fixture) => fixture.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const fixture of analysisFixtures) {
      expect(fixture.expectedMainTopic.length).toBeGreaterThan(2);
      expect(fixture.protects.length).toBeGreaterThan(20);
      expect(['keep', 'change', 'unavailable']).toContain(fixture.baselineDecision);
      expect(loadFixture(fixture.file)).toContain('<html');
    }
  });

  it('contains no credentials, email addresses, or private URLs', () => {
    for (const fixture of analysisFixtures) {
      const html = loadFixture(fixture.file);
      expect(html).not.toMatch(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
      expect(html).not.toMatch(/(?:api[_-]?key|bearer|password|secret)\s*[:=]/i);
      expect(html).not.toMatch(/https?:\/\/(?:localhost|127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i);
    }
  });

  it('produces stable deterministic parser and schema output', () => {
    for (const fixture of analysisFixtures) {
      const html = loadFixture(fixture.file);
      const firstParts = extractTextFromHtml(html);
      const secondParts = extractTextFromHtml(html);
      expect(secondParts).toEqual(firstParts);

      const firstSchema = generateJsonLd([], firstParts, fixture.expectedMainTopic, `https://example.test/${fixture.id}`);
      const secondSchema = generateJsonLd([], secondParts, fixture.expectedMainTopic, `https://example.test/${fixture.id}`);
      expect(secondSchema).toEqual(firstSchema);
    }
  });
});
