/**
 * /admin/runs — operator run log, every analysis ever recorded.
 *
 * Gated by ADMIN_RUNS_TOKEN: pass ?key=<token> once and a cookie keeps you
 * signed in (same pattern as the AI Website Grader's run log). Anyone
 * without the token gets a 404.
 */

import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import RunLog from '@/components/admin/RunLog';
import { RUN_LOG_COOKIE, aggregateRuns, fetchAllRuns, isRunLogAuthorized } from '@/lib/analysis/run-log';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Ontologizer — Run Log',
  robots: { index: false, follow: false },
};

export default async function AdminRunsPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(RUN_LOG_COOKIE)?.value;
  const envToken = process.env.ADMIN_RUNS_TOKEN;

  if (!isRunLogAuthorized({ key, cookieToken }, envToken)) {
    notFound();
  }

  const allRuns = await fetchAllRuns();
  const byUrl = aggregateRuns(allRuns);

  // The key already traveled in the URL; echoing it back only lets the client persist it as a cookie.
  const cookieTokenToSet = key && key === envToken ? key : undefined;

  return (
    <section className="main-section">
      <div className="si-container">
        <RunLog allRuns={allRuns} byUrl={byUrl} cookieTokenToSet={cookieTokenToSet} />
      </div>
    </section>
  );
}
