import { describe, expect, it } from 'vitest';
import {
  enrichRequestSchema,
  extractRequestSchema,
  fanoutRequestSchema,
} from '../request-schemas';

const hash = 'a'.repeat(32);
const runId = '5d8af73e-78b8-4a54-84b9-518ae466488a';

describe('analysis request schemas', () => {
  it('requires exactly one extraction source', () => {
    expect(extractRequestSchema.safeParse({}).success).toBe(false);
    expect(extractRequestSchema.safeParse({ url: 'https://example.com', pasteContent: 'x' }).success).toBe(false);
    expect(extractRequestSchema.safeParse({ url: 'https://example.com' }).success).toBe(true);
  });

  it('enforces pasted-content and HTML size limits', () => {
    expect(extractRequestSchema.safeParse({ pasteContent: 'x'.repeat(5_000_000) }).success).toBe(true);
    expect(extractRequestSchema.safeParse({ pasteContent: 'x'.repeat(5_000_001) }).success).toBe(false);
    expect(fanoutRequestSchema.safeParse({
      htmlContent: 'x'.repeat(5_000_001),
      contentHash: hash,
      analysisRunId: runId,
    }).success).toBe(false);
  });

  it('caps enrichment batches and entity-name length', () => {
    const entity = { name: 'Entity' };
    expect(enrichRequestSchema.safeParse({
      entities: Array.from({ length: 20 }, () => entity),
      mainTopic: 'Topic',
      contentHash: hash,
      analysisRunId: runId,
    }).success).toBe(true);
    expect(enrichRequestSchema.safeParse({
      entities: Array.from({ length: 21 }, () => entity),
      mainTopic: 'Topic',
      contentHash: hash,
      analysisRunId: runId,
    }).success).toBe(false);
    expect(enrichRequestSchema.safeParse({
      entities: [{ name: 'x'.repeat(121) }],
      mainTopic: 'Topic',
      contentHash: hash,
      analysisRunId: runId,
    }).success).toBe(false);
  });
});
