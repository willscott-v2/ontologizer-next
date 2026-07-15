import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockSupabase, type MockSupabase } from '@/lib/cache/__tests__/_mock-supabase';

let mockSb: MockSupabase;
vi.mock('server-only', () => ({}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => mockSb.client }));

const baseRun = {
  id: '5d8af73e-78b8-4a54-84b9-518ae466488a',
  user_id: 'user-1',
  content_hash: 'a'.repeat(32),
  analysis_version: '2026-07-15.1',
  completed_steps: [],
  expires_at: new Date(Date.now() + 60_000).toISOString(),
  key_source: 'free_tier',
};

describe('server-owned analysis runs', () => {
  beforeEach(() => {
    mockSb = createMockSupabase();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    vi.resetModules();
  });

  it('creates an in-progress lifecycle row after extraction', async () => {
    const { createAnalysisRun } = await import('../run-store');
    mockSb.queueResponse({ data: { id: baseRun.id }, error: null });
    await expect(createAnalysisRun({
      user: { id: 'user-1' } as never,
      analysisType: 'full',
      keySource: 'free_tier',
      contentHash: baseRun.content_hash,
      entitiesFound: 8,
    })).resolves.toBe(baseRun.id);
    expect(mockSb.queries.find((query) => query.op === 'insert')?.payload).toMatchObject({
      user_id: 'user-1',
      status: 'in_progress',
      content_hash: baseRun.content_hash,
    });
  });

  it('binds a downstream step to owner and content hash', async () => {
    const { authorizeAnalysisStep } = await import('../run-store');
    mockSb.queueResponse({ data: baseRun, error: null });
    await expect(authorizeAnalysisStep({
      analysisRunId: baseRun.id,
      contentHash: baseRun.content_hash,
      step: 'generate',
      user: { id: 'user-2' } as never,
      hasByokKey: false,
    })).resolves.toMatchObject({ allowed: false, reason: expect.stringMatching(/another user/) });

    mockSb.queueResponse({ data: baseRun, error: null });
    await expect(authorizeAnalysisStep({
      analysisRunId: baseRun.id,
      contentHash: 'b'.repeat(32),
      step: 'generate',
      user: { id: 'user-1' } as never,
      hasByokKey: false,
    })).resolves.toMatchObject({ allowed: false, reason: expect.stringMatching(/does not match/) });
  });

  it('rejects expired and completed free-tier steps', async () => {
    const { authorizeAnalysisStep } = await import('../run-store');
    mockSb.queueResponse({ data: { ...baseRun, expires_at: new Date(Date.now() - 1).toISOString() }, error: null });
    await expect(authorizeAnalysisStep({
      analysisRunId: baseRun.id,
      contentHash: baseRun.content_hash,
      step: 'fanout',
      user: { id: 'user-1' } as never,
      hasByokKey: false,
    })).resolves.toMatchObject({ allowed: false, reason: expect.stringMatching(/expired/) });

    mockSb.queueResponse({ data: { ...baseRun, completed_steps: ['fanout'] }, error: null });
    await expect(authorizeAnalysisStep({
      analysisRunId: baseRun.id,
      contentHash: baseRun.content_hash,
      step: 'fanout',
      user: { id: 'user-1' } as never,
      hasByokKey: false,
    })).resolves.toMatchObject({ allowed: false, reason: expect.stringMatching(/already completed/) });
  });
});
