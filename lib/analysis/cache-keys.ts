import { createHash } from 'node:crypto';
import { EXTRACTION_VERSION, QUERY_COVERAGE_VERSION } from './version';

function md5(value: string): string {
  return createHash('md5').update(value).digest('hex');
}

export function extractionCacheKey(
  contentHash: string,
  mainTopicOverride?: string,
): string {
  const normalizedOverride = mainTopicOverride
    ?.trim()
    .toLowerCase()
    .replace(/\s+/g, ' ') ?? '';
  return md5(`${contentHash}|${EXTRACTION_VERSION}|${normalizedOverride}`);
}

export function queryCoverageCacheKey(contentHash: string): string {
  return md5(`${contentHash}|${QUERY_COVERAGE_VERSION}`);
}
