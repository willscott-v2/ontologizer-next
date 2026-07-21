import 'server-only';

import { createClient } from '@supabase/supabase-js';

export const RUN_LOG_COOKIE = 'ontologizer_run_log_key';

/** Label used to group paste-mode runs, which have no URL. */
export const PASTE_LABEL = '(pasted content)';

export const CLARITY_KEYS = ['topicFocus', 'entityClarity', 'semanticCoherence', 'answerStructure'] as const;
export type ClarityKey = (typeof CLARITY_KEYS)[number];

export type AnalysisRun = {
  url: string | null;
  analysis_type: string;
  key_source: string;
  status: string;
  entities_found: number;
  total_cost_usd: number;
  created_at: string;
  /** Flattened from clarity_status jsonb; '' when the run predates capture. */
  topicFocus: string;
  entityClarity: string;
  semanticCoherence: string;
  answerStructure: string;
};

export type UrlSummary = {
  url: string;
  runs: number;
  latestEntities: number;
  minEntities: number;
  maxEntities: number;
  totalCost: number;
  lastRun: string;
  /** Clarity statuses from the most recent run of this URL. */
  topicFocus: string;
  entityClarity: string;
  semanticCoherence: string;
  answerStructure: string;
};

export function normalizeRunUrl(raw: string | null): string {
  if (!raw) return PASTE_LABEL;
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('?')[0]
    .split('#')[0]
    .replace(/\/+$/, '');
}

export function aggregateRuns(rows: AnalysisRun[]): UrlSummary[] {
  // ISO timestamps from Supabase are all UTC, so string order is time order.
  const sorted = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const byUrl = new Map<string, UrlSummary>();
  for (const row of sorted) {
    const key = normalizeRunUrl(row.url);
    const existing = byUrl.get(key);
    if (!existing) {
      byUrl.set(key, {
        url: key,
        runs: 1,
        latestEntities: row.entities_found,
        minEntities: row.entities_found,
        maxEntities: row.entities_found,
        totalCost: row.total_cost_usd,
        lastRun: row.created_at.slice(0, 10),
        topicFocus: row.topicFocus,
        entityClarity: row.entityClarity,
        semanticCoherence: row.semanticCoherence,
        answerStructure: row.answerStructure,
      });
    } else {
      existing.runs += 1;
      existing.minEntities = Math.min(existing.minEntities, row.entities_found);
      existing.maxEntities = Math.max(existing.maxEntities, row.entities_found);
      existing.totalCost += row.total_cost_usd;
      // Backfill clarity from an older run if the newest one predates capture.
      for (const k of CLARITY_KEYS) {
        if (!existing[k] && row[k]) existing[k] = row[k];
      }
    }
  }
  return [...byUrl.values()];
}

export function isRunLogAuthorized(
  provided: { key?: string | null; cookieToken?: string | null },
  envToken: string | undefined
): boolean {
  if (!envToken) return false;
  return provided.key === envToken || provided.cookieToken === envToken;
}

const PAGE_SIZE = 1000;

export async function fetchAllRuns(): Promise<AnalysisRun[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase service client is not configured.');
  }
  const client = createClient(url, key);

  const rows: AnalysisRun[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('analysis_log')
      .select('url, analysis_type, key_source, status, entities_found, total_cost_usd, created_at, clarity_status')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message || 'Failed to fetch analysis log.');
    }

    type RawRow = Omit<AnalysisRun, 'total_cost_usd' | ClarityKey> & {
      total_cost_usd: number | string | null;
      clarity_status: Partial<Record<ClarityKey, string>> | null;
    };
    const page = (data ?? []) as RawRow[];
    for (const raw of page) {
      rows.push({
        url: raw.url,
        analysis_type: raw.analysis_type,
        key_source: raw.key_source,
        status: raw.status,
        entities_found: raw.entities_found,
        // numeric comes back as a string from PostgREST; coerce once here so
        // downstream math and column sorting are numeric.
        total_cost_usd: Number(raw.total_cost_usd) || 0,
        created_at: raw.created_at,
        topicFocus: raw.clarity_status?.topicFocus ?? '',
        entityClarity: raw.clarity_status?.entityClarity ?? '',
        semanticCoherence: raw.clarity_status?.semanticCoherence ?? '',
        answerStructure: raw.clarity_status?.answerStructure ?? '',
      });
    }
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}
