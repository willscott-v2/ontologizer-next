/**
 * /admin/usage — operator view of AI spend and run outcomes.
 *
 * Server-rendered from analysis_log (last 30 days). Gated to signed-in
 * users on an unlimited-usage domain (Search Influence staff); everyone
 * else gets a 404.
 */

import { notFound } from 'next/navigation';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { isUnlimitedEmail } from '@/lib/metering/usage-tracker';

export const dynamic = 'force-dynamic';

interface LogRow {
  created_at: string;
  analysis_type: string;
  key_source: string;
  status: string;
  error_step: string | null;
  openai_input_tokens: number;
  openai_output_tokens: number;
  gemini_input_tokens: number;
  gemini_output_tokens: number;
  total_cost_usd: number;
}

function usd(n: number): string {
  return `$${n.toFixed(4)}`;
}

export default async function UsagePage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isUnlimitedEmail(user.email)) notFound();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) notFound();
  const service = createClient(url, key);

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { data } = await service
    .from('analysis_log')
    .select(
      'created_at, analysis_type, key_source, status, error_step, openai_input_tokens, openai_output_tokens, gemini_input_tokens, gemini_output_tokens, total_cost_usd',
    )
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false });

  const rows: LogRow[] = data ?? [];

  const completed = rows.filter((r) => r.status === 'complete');
  const failed = rows.filter((r) => r.status === 'failed');
  const appPaid = rows.filter((r) => r.key_source === 'free_tier');
  const byok = rows.filter((r) => r.key_source === 'byok');

  const sum = (list: LogRow[], f: (r: LogRow) => number) =>
    list.reduce((acc, r) => acc + (f(r) || 0), 0);

  const appSpend = sum(appPaid, (r) => Number(r.total_cost_usd));
  const byokSpend = sum(byok, (r) => Number(r.total_cost_usd));
  const openaiTokens = sum(rows, (r) => r.openai_input_tokens + r.openai_output_tokens);
  const geminiTokens = sum(rows, (r) => r.gemini_input_tokens + r.gemini_output_tokens);
  const liveRuns = rows.filter((r) => Number(r.total_cost_usd) > 0);
  const avgCost = liveRuns.length
    ? sum(liveRuns, (r) => Number(r.total_cost_usd)) / liveRuns.length
    : 0;

  // Per-day rollup, newest first
  const byDay = new Map<string, { runs: number; failed: number; cost: number }>();
  for (const r of rows) {
    const day = r.created_at.slice(0, 10);
    const entry = byDay.get(day) ?? { runs: 0, failed: 0, cost: 0 };
    entry.runs += 1;
    if (r.status === 'failed') entry.failed += 1;
    entry.cost += Number(r.total_cost_usd) || 0;
    byDay.set(day, entry);
  }

  const stats: Array<[string, string]> = [
    ['Runs (30d)', String(rows.length)],
    ['Completed / failed', `${completed.length} / ${failed.length}`],
    ['App-paid spend', usd(appSpend)],
    ['BYOK spend (users’ dollars)', usd(byokSpend)],
    ['OpenAI tokens', openaiTokens.toLocaleString()],
    ['Gemini tokens', geminiTokens.toLocaleString()],
    ['Avg cost per live run', usd(avgCost)],
  ];

  return (
    <section className="main-section">
      <div className="si-container">
        <div className="mx-auto max-w-3xl space-y-8 rounded-xl bg-white p-8 text-gray-900">
          <h1 className="text-2xl font-bold">AI usage — last 30 days</h1>

          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {stats.map(([label, value]) => (
              <div key={label} className="rounded-lg border border-gray-200 bg-white p-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {label}
                </dt>
                <dd className="mt-1 text-xl font-bold text-gray-900">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Day</th>
                  <th className="px-4 py-3 text-right">Runs</th>
                  <th className="px-4 py-3 text-right">Failed</th>
                  <th className="px-4 py-3 text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {[...byDay.entries()].map(([day, e]) => (
                  <tr key={day} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-2 font-mono">{day}</td>
                    <td className="px-4 py-2 text-right">{e.runs}</td>
                    <td className="px-4 py-2 text-right">{e.failed || ''}</td>
                    <td className="px-4 py-2 text-right font-mono">{usd(e.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-sm text-gray-400">
            Older rows (pre-migration-007) have zero cost columns — they predate
            token tracking. BYOK spend is paid by users, not Search Influence.
          </p>
        </div>
      </div>
    </section>
  );
}
