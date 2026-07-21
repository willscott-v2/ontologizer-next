/**
 * POST /api/admin/grant-runs — add promotional bonus runs to a user by email.
 *
 * Gated by the same ADMIN_RUNS_TOKEN as /admin/runs: the request must carry
 * the run-log cookie (set by visiting /admin/runs?key=…). Bonus runs are
 * one-time credits consumed after the monthly free allowance; a negative
 * value revokes unspent credits (floored at zero).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { RUN_LOG_COOKIE, isRunLogAuthorized } from '@/lib/analysis/run-log';

export async function POST(request: NextRequest) {
  const envToken = process.env.ADMIN_RUNS_TOKEN;
  const cookieToken = request.cookies.get(RUN_LOG_COOKIE)?.value;
  if (!isRunLogAuthorized({ cookieToken }, envToken)) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 404 });
  }

  let body: { email?: unknown; runs?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const runs = typeof body.runs === 'number' ? Math.trunc(body.runs) : NaN;
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
  }
  if (!Number.isFinite(runs) || runs === 0 || Math.abs(runs) > 1000) {
    return NextResponse.json({ error: 'runs must be a non-zero integer between -1000 and 1000.' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: 'Database is not configured.' }, { status: 500 });
  }
  const supabase = createClient(url, key);

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, bonus_analyses')
    .ilike('email', email)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: `No profile found for ${email}. They need to sign up first.` }, { status: 404 });
  }

  const next = Math.max(0, (profile.bonus_analyses ?? 0) + runs);
  const { error } = await supabase
    .from('profiles')
    .update({ bonus_analyses: next })
    .eq('id', profile.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: `${profile.email} now has ${next} bonus run${next === 1 ? '' : 's'}.`,
  });
}
