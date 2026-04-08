import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Step 1: Fetch URL, parse HTML, extract entities via OpenAI
// Expected request body: { url: string, pasteContent?: string, mainTopicStrategy: string, clearCache: boolean }
// BYOK keys in headers: X-OpenAI-Key, X-Google-KG-Key, X-Gemini-Key
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, pasteContent, mainTopicStrategy = 'strict', clearCache = false } = body;

    // TODO: Resolve API keys (BYOK headers > free tier env vars)
    // TODO: Check free tier metering if using app keys
    // TODO: Check analysis_cache if !clearCache
    // TODO: Fetch URL and parse HTML with cheerio
    // TODO: Extract entities via OpenAI (or basic fallback)
    // TODO: Return ExtractResult

    return NextResponse.json(
      { error: 'Not implemented yet. Port pipeline in Phase 2.' },
      { status: 501 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
