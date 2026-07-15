import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { finalizeAnalysisRun } from '@/lib/analysis/run-store';
import { finalizeRequestSchema, formatZodError } from '@/lib/analysis/request-schemas';

export async function POST(request: NextRequest) {
  try {
    const parsed = finalizeRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const supabase = await createClient();
    const user = (await supabase.auth.getUser()).data.user;
    const finalized = await finalizeAnalysisRun({
      ...parsed.data,
      user,
    });
    if (!finalized) {
      return NextResponse.json({ error: 'Analysis run could not be finalized.' }, { status: 403 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
