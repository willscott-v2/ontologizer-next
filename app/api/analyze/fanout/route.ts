/**
 * POST /api/analyze/fanout
 *
 * Accepts HTML content and optional URL, runs Gemini-powered fan-out
 * analysis to predict how Google's AI Mode might decompose queries.
 *
 * Headers:
 *   X-Gemini-Key (optional) - BYOK Gemini API key
 *
 * Body:
 *   { htmlContent, url? }
 */

import { NextRequest, NextResponse } from 'next/server';
import type { FanoutResult } from '../../../../lib/types/analysis';
import { analyzeFanout } from '../../../../lib/pipeline/fanout-analyzer';
import { createClient } from '@/lib/supabase/server';

interface FanoutRequestBody {
  htmlContent: string;
  url?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as FanoutRequestBody;
    const { htmlContent, url } = body;

    if (!htmlContent) {
      return NextResponse.json(
        { error: 'Missing required field: htmlContent' },
        { status: 400 },
      );
    }

    let geminiKey = request.headers.get('X-Gemini-Key') || undefined;

    // Signed-in users fall back to the app's Gemini key
    if (!geminiKey) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        geminiKey = process.env.GEMINI_API_KEY || undefined;
      }
    }

    if (!geminiKey) {
      const result: FanoutResult = {
        analysis: null,
        chunksExtracted: 0,
        chunks: [],
        error:
          'Gemini API key required — add one in Settings, or sign in to use the free tier.',
      };
      return NextResponse.json(result, { status: 200 });
    }

    const result = await analyzeFanout(htmlContent, url, geminiKey);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
