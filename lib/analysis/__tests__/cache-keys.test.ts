import { describe, expect, it } from 'vitest';
import { extractionCacheKey, queryCoverageCacheKey } from '../cache-keys';

describe('versioned analysis cache keys', () => {
  it('normalizes a main-topic override without collapsing distinct overrides', () => {
    expect(extractionCacheKey('a'.repeat(32), '  Higher   Education ')).toBe(
      extractionCacheKey('a'.repeat(32), 'higher education'),
    );
    expect(extractionCacheKey('a'.repeat(32), 'Higher Education')).not.toBe(
      extractionCacheKey('a'.repeat(32), 'Student Recruitment'),
    );
  });

  it('keeps extraction and query-coverage cache namespaces distinct', () => {
    expect(extractionCacheKey('b'.repeat(32))).not.toBe(
      queryCoverageCacheKey('b'.repeat(32)),
    );
  });
});
