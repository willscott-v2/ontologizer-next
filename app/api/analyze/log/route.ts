/**
 * POST /api/analyze/log
 *
 * Fire-and-forget audit logging of completed analyses. Called by the
 * useAnalysis hook after a successful run (fresh or cache-hit).
 * Anonymous BYOK users are logged with user_id=null.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { logAnalysis } from '@/lib/metering/usage-tracker';
import { createClient } from '@/lib/supabase/server';

interface LogBody {
  url?: string;
  analysisType?: 'full' | 'fanout_only' | 'paste';
  keySource?: 'byok' | 'free_tier';
  entitiesFound?: number;
  processingTimeMs?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as LogBody;

    if (!body.analysisType || !body.keySource) return NextResponse.json({ ok: true });

    let userId: string | undefined;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) userId = user.id;
    } catch {
      // Supabase unavailable — log anonymously
    }

    await logAnalysis({
      userId,
      url: body.url,
      analysisType: body.analysisType,
      keySource: body.keySource,
      entitiesFound: body.entitiesFound,
      processingTimeMs: body.processingTimeMs,
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Never block the client on logging errors
    return NextResponse.json({ ok: true });
  }
}
