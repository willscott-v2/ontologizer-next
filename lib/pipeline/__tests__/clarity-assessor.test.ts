import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractTextFromHtml } from '../parser';
import { assessClarity } from '../clarity-assessor';
import { analysisFixtures } from './fixtures/manifest';
import type { EnrichedEntity } from '@/lib/types/entities';

const fixtureDir = path.join(process.cwd(), 'lib/pipeline/__tests__/fixtures');

function fixtureParts(file: string) {
  return extractTextFromHtml(readFileSync(path.join(fixtureDir, file), 'utf8'));
}

describe('AI Content Clarity', () => {
  it('returns four evidence-backed dimensions for every regression fixture', () => {
    for (const fixture of analysisFixtures) {
      const assessment = assessClarity({
        entities: [],
        textParts: fixtureParts(fixture.file),
        mainTopic: fixture.expectedMainTopic,
        topicConfidence: 0.85,
      });
      expect(Object.keys(assessment.dimensions)).toEqual([
        'topicFocus',
        'entityClarity',
        'semanticCoherence',
        'answerStructure',
      ]);
      expect(['strong', 'mixed', 'weak', 'unavailable']).toContain(assessment.overallStatus);
      for (const dimension of Object.values(assessment.dimensions)) {
        expect(dimension.summary.length).toBeGreaterThan(10);
        expect(new Set(dimension.checks.map((check) => check.id)).size).toBe(dimension.checks.length);
      }
    }
  });

  it('does not treat missing external identifiers as weak entity clarity', () => {
    const entity: EnrichedEntity = {
      name: 'Jordan Consulting',
      type: 'Organization',
      confidenceScore: 90,
      wikipediaUrl: null,
      wikidataUrl: null,
      googleKgUrl: null,
      productOntologyUrl: null,
    };
    const assessment = assessClarity({
      entities: [entity],
      textParts: fixtureParts('ambiguous-entities.html'),
      mainTopic: 'Jordan Consulting',
      topicConfidence: 0.9,
    });
    expect(assessment.dimensions.entityClarity.status).not.toBe('weak');
    expect(assessment.dimensions.entityClarity.checks.find(
      (check) => check.id === 'verified-identifier',
    )?.status).toBe('unavailable');
  });

  it('distinguishes missing prominent placement from natural repetition', () => {
    const parts = extractTextFromHtml(`
      <html><head><title>Unrelated title</title></head><body>
      <h1>Another subject</h1><p>Technical SEO audits are described once here.</p>
      </body></html>
    `);
    const assessment = assessClarity({
      entities: [],
      textParts: parts,
      mainTopic: 'Technical SEO Audits',
      topicConfidence: 0.8,
    });
    expect(assessment.dimensions.topicFocus.checks.find((check) => check.id === 'topic-in-title')?.status).toBe('fail');
    expect(assessment.dimensions.topicFocus.checks.find((check) => check.id === 'topic-repetition')?.status).toBe('pass');
  });

  it('marks a thin JavaScript shell as a structural failure', () => {
    const parts = extractTextFromHtml('<html><body><div id="app"></div><script></script><script></script><script></script></body></html>');
    const assessment = assessClarity({
      entities: [],
      textParts: parts,
      mainTopic: 'Example Topic',
      topicConfidence: 0.3,
    });
    expect(assessment.dimensions.answerStructure.checks.find(
      (check) => check.id === 'readable-html',
    )?.status).toBe('fail');
  });
});
