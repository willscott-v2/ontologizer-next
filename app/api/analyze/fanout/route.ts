import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Step 4: Run Gemini fan-out query analysis (optional)
// Expected request body: { htmlContent: string, url?: string }
// BYOK keys in headers: X-Gemini-Key
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { htmlContent, url } = body;

    // TODO: Extract semantic chunks from HTML
    // TODO: Build fan-out prompt
    // TODO: Call Gemini API (gemini-2.0-flash-exp with fallback)
    // TODO: Return FanoutResult

    return NextResponse.json(
      { error: 'Not implemented yet. Port fan-out analyzer in Phase 3.' },
      { status: 501 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
