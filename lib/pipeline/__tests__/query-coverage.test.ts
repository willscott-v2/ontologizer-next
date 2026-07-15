import { describe, expect, it } from 'vitest';
import {
  buildQueryCoveragePrompt,
  extractSemanticChunks,
  normalizeQueryCoverageModelOutput,
  queryCoverageValidationIssue,
  validateQueryCoverageResponse,
} from '../fanout-analyzer';
import type { SemanticChunk } from '@/lib/types/analysis';

const chunks: SemanticChunk[] = [
  { id: 'chunk-1', type: 'primary_topic', content: 'Technical SEO audits identify crawl and indexing issues.' },
  { id: 'chunk-2', type: 'section', heading: 'Deliverables', content: 'The audit includes findings and priorities.' },
];

function response(count = 5) {
  return {
    primaryEntity: 'Technical SEO Audits',
    questions: Array.from({ length: count }, (_, index) => ({
      question: `What does the audit cover in scenario ${index + 1}?`,
      intent: 'definition',
      coverage: 'covered',
      evidenceChunkIds: ['chunk-1'],
      checkedScope: 'The primary topic chunk directly describes the audit scope.',
      gapAction: undefined as string | undefined,
    })),
  };
}

describe('AI Query Coverage contract', () => {
  it('accepts five through eight questions and computes a summary', () => {
    expect(validateQueryCoverageResponse(response(5), chunks)?.summary.covered).toBe(5);
    expect(validateQueryCoverageResponse(response(8), chunks)?.summary.covered).toBe(8);
    expect(validateQueryCoverageResponse(response(4), chunks)).toBeNull();
    expect(validateQueryCoverageResponse(response(9), chunks)).toBeNull();
  });

  it('rejects unsupported evidence IDs, duplicates, and unsupported partial claims', () => {
    const badEvidence = response();
    badEvidence.questions[0].evidenceChunkIds = ['chunk-99'];
    expect(validateQueryCoverageResponse(badEvidence, chunks)).toBeNull();
    expect(queryCoverageValidationIssue(badEvidence, chunks)).toBe('unsupported_evidence_id');

    const duplicate = response();
    duplicate.questions[1].question = duplicate.questions[0].question;
    expect(validateQueryCoverageResponse(duplicate, chunks)).toBeNull();
    expect(queryCoverageValidationIssue(duplicate, chunks)).toBe('duplicate_question');

    const partial = response();
    partial.questions[0] = {
      ...partial.questions[0],
      coverage: 'partial',
      evidenceChunkIds: [],
    };
    expect(validateQueryCoverageResponse(partial, chunks)).toBeNull();
  });

  it('allows missing questions only with checked scope and a gap action', () => {
    const missing = response();
    missing.questions[0] = {
      ...missing.questions[0],
      coverage: 'missing',
      evidenceChunkIds: [],
      checkedScope: 'Both supplied chunks were checked and neither addresses pricing.',
      gapAction: 'Add a concise pricing factors section with a clear qualification.',
    };
    expect(validateQueryCoverageResponse(missing, chunks)?.summary.missing).toBe(1);
  });

  it('normalizes safe provider shape variants before strict evidence validation', () => {
    const variant = response();
    variant.questions[0] = {
      ...variant.questions[0],
      coverage: 'not_covered' as 'covered',
      evidenceChunkIds: [],
      checkedScope: ['The title was checked.', 'Neither supplied chunk answers pricing.'] as unknown as string,
      gapAction: 'Add a concise pricing factors section.',
    };
    const raw = { ...variant, summary: { covered: 4 } };
    const normalized = normalizeQueryCoverageModelOutput(raw) as ReturnType<typeof response>;
    expect(normalized.questions[0].coverage).toBe('missing');
    expect(normalized.questions[0].checkedScope).toBe('The title was checked. Neither supplied chunk answers pricing.');
    expect(validateQueryCoverageResponse(raw, chunks)?.summary.missing).toBe(1);
  });

  it('assigns stable chunk IDs and discloses modeled-question limits in the prompt', () => {
    const extracted = extractSemanticChunks('<html><head><title>Audit</title></head><body><h1>Audit</h1><p>This paragraph contains enough detail to represent a meaningful content block for testing purposes.</p></body></html>');
    expect(extracted[0]?.id).toBe('chunk-1');
    expect(buildQueryCoveragePrompt(chunks)).toMatch(/modeled questions, not observed Google searches/i);
  });
});
