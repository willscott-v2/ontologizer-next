/**
 * Shared supabase mock for cache-layer tests.
 *
 * Builds a chainable query-builder stub where every call returns the same
 * object. Each test can inspect the captured operations or stub specific
 * terminal-method responses.
 */

import { vi, type Mock } from 'vitest';

export interface QueryRecord {
  table: string;
  op: 'select' | 'upsert' | 'update' | 'insert';
  payload?: unknown;
  filters: Array<{ method: string; args: unknown[] }>;
  onConflict?: string;
}

export interface MockSupabase {
  client: {
    from: Mock;
  };
  queries: QueryRecord[];
  /** Queue a response for the next terminal call (`single`/`maybeSingle`). */
  queueResponse: (response: { data: unknown; error: unknown | null }) => void;
}

export function createMockSupabase(): MockSupabase {
  const queries: QueryRecord[] = [];
  const responseQueue: Array<{ data: unknown; error: unknown | null }> = [];

  function queueResponse(response: { data: unknown; error: unknown | null }) {
    responseQueue.push(response);
  }

  function makeChain(record: QueryRecord) {
    const chain: Record<string, unknown> = {};
    const filterMethods = [
      'eq',
      'gt',
      'lt',
      'gte',
      'lte',
      'in',
      'is',
      'neq',
      'match',
      'select',
    ];
    for (const m of filterMethods) {
      chain[m] = (...args: unknown[]) => {
        record.filters.push({ method: m, args });
        return chain;
      };
    }
    const terminal = async () => {
      const queued = responseQueue.shift();
      return queued ?? { data: null, error: null };
    };
    chain.single = terminal;
    chain.maybeSingle = terminal;
    chain.then = (fn: (v: unknown) => unknown) => terminal().then(fn);
    return chain;
  }

  const client = {
    from: vi.fn((table: string) => {
      return {
        select: (...args: unknown[]) => {
          const rec: QueryRecord = {
            table,
            op: 'select',
            filters: [{ method: 'select', args }],
          };
          queries.push(rec);
          return makeChain(rec);
        },
        upsert: (payload: unknown, opts?: { onConflict?: string }) => {
          const rec: QueryRecord = {
            table,
            op: 'upsert',
            payload,
            filters: [],
            onConflict: opts?.onConflict,
          };
          queries.push(rec);
          return makeChain(rec);
        },
        update: (payload: unknown) => {
          const rec: QueryRecord = {
            table,
            op: 'update',
            payload,
            filters: [],
          };
          queries.push(rec);
          return makeChain(rec);
        },
        insert: (payload: unknown) => {
          const rec: QueryRecord = {
            table,
            op: 'insert',
            payload,
            filters: [],
          };
          queries.push(rec);
          return makeChain(rec);
        },
      };
    }),
  };

  return { client, queries, queueResponse };
}
