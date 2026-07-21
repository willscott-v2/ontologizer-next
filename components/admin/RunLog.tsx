'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AnalysisRun, UrlSummary } from '@/lib/analysis/run-log';

type View = 'url' | 'all';
type SortState = { key: string; dir: 1 | -1 };

const RENDER_CAP = 2000;
const RUN_LOG_COOKIE = 'ontologizer_run_log_key';

const STATUS_STYLES: Record<string, string> = {
  complete: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
  in_progress: 'bg-orange-100 text-orange-800',
};

const CLARITY_STYLES: Record<string, string> = {
  strong: 'bg-emerald-100 text-emerald-800',
  mixed: 'bg-amber-100 text-amber-800',
  weak: 'bg-red-100 text-red-800',
  unavailable: 'bg-gray-100 text-gray-600',
};

// Order clarity columns by quality when sorted, not alphabetically.
const CLARITY_RANK: Record<string, number> = { strong: 3, mixed: 2, weak: 1, unavailable: 0 };
const CLARITY_COLUMNS = [
  { key: 'topicFocus', label: 'Topic' },
  { key: 'entityClarity', label: 'Entity' },
  { key: 'semanticCoherence', label: 'Semantic' },
  { key: 'answerStructure', label: 'Answer' },
] as const;

function usd(n: number): string {
  return `$${n.toFixed(4)}`;
}

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-center text-xs font-semibold ${
        STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700'
      }`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

function ClarityChip({ status }: { status: string }) {
  if (!status) return <span className="text-xs text-[var(--muted-text)]">—</span>;
  return (
    <span
      className={`inline-block rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold ${
        CLARITY_STYLES[status] ?? 'bg-gray-100 text-gray-700'
      }`}
      title={status}
    >
      {status === 'unavailable' ? 'n/a' : status}
    </span>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-[var(--border-gray)] bg-white px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-text)]">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums text-[var(--content-text)]">{value}</div>
    </div>
  );
}

function Histogram({ byUrl }: { byUrl: UrlSummary[] }) {
  const bins = useMemo(() => {
    const counts = byUrl.map((r) => r.latestEntities);
    const hi = Math.max(20, ...counts);
    const result: { lo: number; hi: number; n: number }[] = [];
    for (let b = 0; b <= hi; b += 5) {
      result.push({ lo: b, hi: b + 4, n: 0 });
    }
    for (const c of counts) {
      const bin = result.find((b) => c >= b.lo && c <= b.hi);
      if (bin) bin.n += 1;
    }
    return result;
  }, [byUrl]);

  const max = Math.max(1, ...bins.map((b) => b.n));

  return (
    <div className="rounded-md border border-[var(--border-gray)] bg-white">
      <h2 className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-text)]">
        Entities found per site (latest run)
      </h2>
      <div className="px-4 pb-4 pt-2">
        <div className="flex h-28 items-end gap-[3px]">
          {bins.map((b) => (
            <div key={b.lo} className="group relative flex h-full flex-1 flex-col justify-end">
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded bg-[var(--content-text)] px-2 py-1 text-xs text-white group-hover:block">
                {b.lo}–{b.hi} entities: {b.n} site{b.n === 1 ? '' : 's'}
              </span>
              <div
                className="w-full rounded-t-[3px] bg-[var(--si-medium-blue)] transition-[filter] group-hover:brightness-110"
                style={{ height: `${Math.round((b.n / max) * 100)}%`, minHeight: 2 }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex gap-[3px]">
          {bins.map((b) => (
            <span key={b.lo} className="flex-1 text-center text-[10px] text-[var(--muted-text)]">
              {b.lo}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function GrantRunsForm() {
  const [email, setEmail] = useState('');
  const [runs, setRuns] = useState('5');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/grant-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), runs: Number(runs) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Grant failed.');
      setMessage(data.message);
      setEmail('');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Grant failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2.5 rounded-md border border-[var(--border-gray)] bg-white px-4 py-3">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-text)]">
        Grant promo runs
      </span>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="user@example.com"
        aria-label="User email"
        className="min-w-[220px] flex-1 rounded-md border border-[var(--border-gray)] bg-white px-3 py-1.5 text-sm text-[var(--content-text)] focus:outline-none focus:ring-2 focus:ring-[var(--si-orange)]"
      />
      <input
        type="number"
        required
        min={-100}
        max={1000}
        value={runs}
        onChange={(e) => setRuns(e.target.value)}
        aria-label="Runs to add"
        className="w-20 rounded-md border border-[var(--border-gray)] bg-white px-3 py-1.5 text-sm text-[var(--content-text)] focus:outline-none focus:ring-2 focus:ring-[var(--si-orange)]"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-[var(--si-dark-navy)] px-3.5 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Granting…' : 'Add runs'}
      </button>
      {message && <span className="text-sm text-[var(--secondary-content)]">{message}</span>}
    </form>
  );
}

export default function RunLog({
  allRuns,
  byUrl,
  cookieTokenToSet,
}: {
  allRuns: AnalysisRun[];
  byUrl: UrlSummary[];
  cookieTokenToSet?: string;
}) {
  const [view, setView] = useState<View>('url');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Record<View, SortState>>({
    url: { key: 'lastRun', dir: -1 },
    all: { key: 'created_at', dir: -1 },
  });

  useEffect(() => {
    if (cookieTokenToSet) {
      document.cookie = `${RUN_LOG_COOKIE}=${encodeURIComponent(cookieTokenToSet)}; path=/admin; max-age=31536000; SameSite=Lax; Secure`;
    }
  }, [cookieTokenToSet]);

  const meta = useMemo(() => {
    const dates = allRuns.map((r) => r.created_at).sort();
    const completed = allRuns.filter((r) => r.status === 'complete');
    const failed = allRuns.filter((r) => r.status === 'failed');
    const entitySum = completed.reduce((acc, r) => acc + (r.entities_found || 0), 0);
    const appCost = allRuns
      .filter((r) => r.key_source !== 'byok')
      .reduce((acc, r) => acc + r.total_cost_usd, 0);
    const byokCost = allRuns
      .filter((r) => r.key_source === 'byok')
      .reduce((acc, r) => acc + r.total_cost_usd, 0);
    return {
      total: allRuns.length,
      unique: byUrl.length,
      avgEntities: completed.length ? (entitySum / completed.length).toFixed(1) : '--',
      failed: failed.length,
      appCost: usd(appCost),
      byokCost: usd(byokCost),
      from: dates.length ? dates[0].slice(0, 10) : '--',
      to: dates.length ? dates[dates.length - 1].slice(0, 10) : '--',
    };
  }, [allRuns, byUrl]);

  const columns =
    view === 'url'
      ? [
          { key: 'url', label: 'URL', numeric: false },
          { key: 'latestEntities', label: 'Entities', numeric: true },
          ...CLARITY_COLUMNS.map((c) => ({ key: c.key, label: c.label, numeric: false })),
          { key: 'runs', label: 'Runs', numeric: true },
          { key: 'totalCost', label: 'Cost', numeric: true },
          { key: 'lastRun', label: 'Last run', numeric: false },
        ]
      : [
          { key: 'created_at', label: 'Analyzed at (UTC)', numeric: false },
          { key: 'url', label: 'URL', numeric: false },
          { key: 'key_source', label: 'Source', numeric: false },
          { key: 'status', label: 'Status', numeric: false },
          { key: 'entities_found', label: 'Entities', numeric: true },
          ...CLARITY_COLUMNS.map((c) => ({ key: c.key, label: c.label, numeric: false })),
          { key: 'total_cost_usd', label: 'Cost', numeric: true },
        ];

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const source: Array<Record<string, string | number | null>> =
      view === 'url'
        ? (byUrl as unknown as Array<Record<string, string | number | null>>)
        : (allRuns as unknown as Array<Record<string, string | number | null>>);
    const filtered = q ? source.filter((r) => String(r.url ?? '').toLowerCase().includes(q)) : [...source];
    const { key, dir } = sort[view];
    const isClarity = key in CLARITY_RANK || CLARITY_COLUMNS.some((c) => c.key === key);
    filtered.sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (isClarity) {
        return ((CLARITY_RANK[String(av)] ?? -1) - (CLARITY_RANK[String(bv)] ?? -1)) * dir;
      }
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
    });
    return filtered;
  }, [view, query, sort, byUrl, allRuns]);

  const shown = rows.slice(0, RENDER_CAP);

  const onSort = (key: string) => {
    setSort((prev) => {
      const current = prev[view];
      const next: SortState =
        current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: key === 'url' ? 1 : -1 };
      return { ...prev, [view]: next };
    });
  };

  return (
    <div className="mx-auto max-w-6xl rounded-xl bg-[var(--background-gray)] p-6 text-[var(--content-text)]">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-xl font-bold">Ontologizer — Run Log</h1>
        <span className="text-sm text-[var(--secondary-content)]">
          {meta.total} runs · {meta.unique} unique URLs · {meta.from} to {meta.to}
        </span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Kpi label="Total runs" value={meta.total} />
        <Kpi label="Unique URLs" value={meta.unique} />
        <Kpi label="Avg entities/run" value={meta.avgEntities} />
        <Kpi label="Failed runs" value={meta.failed} />
        <Kpi label="App-paid cost" value={meta.appCost} />
        <Kpi label="BYOK cost" value={meta.byokCost} />
      </div>

      <div className="mb-4">
        <Histogram byUrl={byUrl} />
      </div>

      <div className="mb-4">
        <GrantRunsForm />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by URL…"
          aria-label="Filter by URL"
          className="min-w-[220px] flex-1 rounded-md border border-[var(--border-gray)] bg-white px-3 py-2 text-sm text-[var(--content-text)] focus:outline-none focus:ring-2 focus:ring-[var(--si-orange)]"
        />
        <div className="flex overflow-hidden rounded-md border border-[var(--border-gray)]" role="group" aria-label="View">
          {(
            [
              ['url', 'By URL'],
              ['all', 'All runs'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3.5 py-2 text-sm font-medium ${
                view === v ? 'bg-[var(--si-dark-navy)] text-white' : 'bg-white text-[var(--secondary-content)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-sm text-[var(--muted-text)]">
          {shown.length === rows.length ? rows.length : `${shown.length} of ${rows.length}`}{' '}
          {view === 'url' ? 'URLs' : 'runs'}
        </span>
      </div>

      <div className="overflow-x-auto rounded-md border border-[var(--border-gray)] bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  onClick={() => onSort(c.key)}
                  className={`cursor-pointer select-none whitespace-nowrap border-b border-[var(--border-gray)] px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-text)] hover:text-[var(--content-text)] ${
                    c.numeric ? 'text-right' : 'text-left'
                  }`}
                >
                  {c.label}
                  {sort[view].key === c.key && (
                    <span className="ml-1 text-[9px]">{sort[view].dir === 1 ? '▲' : '▼'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-7 text-center text-[var(--muted-text)]">
                  No URLs match that filter.
                </td>
              </tr>
            )}
            {view === 'url'
              ? (shown as unknown as UrlSummary[]).map((r) => (
                  <tr key={r.url} className="border-b border-[var(--light-gray)] last:border-b-0 hover:bg-[var(--light-gray)]">
                    <td className="max-w-[380px] break-all px-3 py-1.5 font-mono text-xs">{r.url}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                      {r.minEntities === r.maxEntities ? r.latestEntities : `${r.latestEntities} (${r.minEntities}–${r.maxEntities})`}
                    </td>
                    {CLARITY_COLUMNS.map((c) => (
                      <td key={c.key} className="px-3 py-1.5"><ClarityChip status={r[c.key]} /></td>
                    ))}
                    <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.runs}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{usd(r.totalCost)}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs tabular-nums text-[var(--secondary-content)]">
                      {r.lastRun}
                    </td>
                  </tr>
                ))
              : (shown as unknown as AnalysisRun[]).map((r, i) => (
                  <tr
                    key={`${r.created_at}-${i}`}
                    className="border-b border-[var(--light-gray)] last:border-b-0 hover:bg-[var(--light-gray)]"
                  >
                    <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs tabular-nums text-[var(--secondary-content)]">
                      {r.created_at.slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="max-w-[340px] break-all px-3 py-1.5 font-mono text-xs">
                      {r.url ?? '(pasted content)'}
                    </td>
                    <td className="px-3 py-1.5 text-xs">{r.key_source === 'byok' ? 'BYOK' : 'app'}</td>
                    <td className="px-3 py-1.5"><StatusChip status={r.status} /></td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.entities_found}</td>
                    {CLARITY_COLUMNS.map((c) => (
                      <td key={c.key} className="px-3 py-1.5"><ClarityChip status={r[c.key]} /></td>
                    ))}
                    <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{usd(r.total_cost_usd)}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-[var(--muted-text)]">
        Clarity statuses are captured for runs after 2026-07-21; earlier runs show —.
      </p>
    </div>
  );
}
