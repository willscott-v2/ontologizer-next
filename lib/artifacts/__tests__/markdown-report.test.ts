import { describe, expect, it } from 'vitest';
import { generateMarkdownReport } from '../markdown-report';
import type { AnalysisResult, ClarityDimension } from '@/lib/types/analysis';

const dimension: ClarityDimension = {
  status: 'mixed',
  summary: 'The page has useful evidence with one item to review.',
  evidence: [{ id: 'topic-title', source: 'title', text: 'Technical SEO Audits | Example' }],
  checks: [{ id: 'topic-in-title', label: 'Topic in title', status: 'pass', detail: 'The title names the topic.', evidenceIds: ['topic-title'] }],
};

function result(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    entities: [],
    schemaArtifact: {
      jsonLd: { '@context': 'https://schema.org', '@graph': [] },
      pageType: { type: 'Service', confidence: 0.88, evidence: ['Named service'] },
      status: 'review', errors: [],
      warnings: [{ code: 'provider-review', message: 'Confirm the visible provider.', action: 'Check the page copy.' }],
      factsUsed: ['Page title'], factsOmitted: [], schemaVersion: 'connected-schema-1', generatedAt: '2026-07-15T12:00:00.000Z',
    },
    recommendations: [{
      observation: 'The opening does not name the audience.', evidence: ['topic-opening'],
      action: 'Add one sentence naming the intended audience.', priority: 'high', effort: 'small', confidence: 'high', dimension: 'topicFocus',
    }],
    clarity: {
      mainTopic: 'Technical SEO Audits', topicConfidence: 0.9, overallStatus: 'mixed',
      dimensions: { topicFocus: dimension, entityClarity: dimension, semanticCoherence: dimension, answerStructure: dimension },
      degradedSteps: ['AI recommendations unavailable; deterministic checks used.'], analysisVersion: '2026-07-15.1',
    },
    processingTimeMs: 1200,
    source: { mode: 'url', url: 'https://example.com/audit' },
    analyzedAt: '2026-07-15T12:00:00.000Z',
    provenance: { fetch: 'fresh', extraction: 'fresh', enrichment: { hits: 0, misses: 2 }, recommendations: 'deterministic' },
    ...overrides,
  };
}

describe('branded Markdown report', () => {
  it('mirrors the overview and includes review, source, version, and brand context', () => {
    const markdown = generateMarkdownReport(result());
    expect(markdown).toContain('# Ontologizer AI Content Clarity Report');
    expect(markdown).toContain('**Source:** https://example.com/audit');
    expect(markdown).toContain('**Analysis version:** 2026-07-15.1');
    expect(markdown).toContain('## Priority actions');
    expect(markdown).toContain('Generated schema must match visible page content');
    expect(markdown).toContain('[Ontologizer](https://ontologizer.vercel.app/)');
    expect(markdown).toContain('Search Influence');
  });

  it('handles pasted content and an unavailable optional provider without leaking raw input or keys', () => {
    const markdown = generateMarkdownReport(result({
      source: { mode: 'paste' },
      fanoutAnalysis: { analysis: null, chunksExtracted: 0, chunks: [], error: 'Provider unavailable.' },
    }));
    expect(markdown).toContain('**Source:** Pasted content');
    expect(markdown).toContain('AI Query Coverage unavailable: Provider unavailable.');
    expect(markdown).not.toMatch(/api[_-]?key|<html|test-key/i);
  });
});
