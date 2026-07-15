import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { fetchWebpage, hashContent } from '@/lib/pipeline/fetcher';
import { extractTextFromHtml } from '@/lib/pipeline/parser';
import { estimateTopicConfidence, extractEntities } from '@/lib/pipeline/entity-extractor';
import { checkFreeUsage, incrementFreeUsage } from '@/lib/metering/usage-tracker';
import { getCachedExtraction, cacheExtraction } from '@/lib/cache/extraction-cache';
import { createClient } from '@/lib/supabase/server';
import { createAnalysisRun } from '@/lib/analysis/run-store';
import { ANALYSIS_VERSION } from '@/lib/analysis/version';
import { extractionCacheKey } from '@/lib/analysis/cache-keys';
import { extractRequestSchema, formatZodError } from '@/lib/analysis/request-schemas';
import type { ExtractResult } from '@/lib/types/analysis';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export async function POST(request: NextRequest) {
  try {
    const parsed = extractRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: formatZodError(parsed.error) },
        { status: 400 },
      );
    }
    const body = parsed.data;

    const byokOpenaiKey = request.headers.get('X-OpenAI-Key') || undefined;
    const isByok = Boolean(byokOpenaiKey);
    let user: User | null = null;
    let openaiKey = byokOpenaiKey;

    if (!isByok) {
      const supabase = await createClient();
      const auth = await supabase.auth.getUser();
      user = auth.data.user;
      if (!user) {
        return NextResponse.json(
          { error: 'Sign in for free analyses or add your OpenAI API key in Settings.' },
          { status: 401 },
        );
      }

      const usage = await checkFreeUsage(user.id);
      if (!usage.allowed) {
        return NextResponse.json({ error: usage.reason }, { status: 429 });
      }
      openaiKey = process.env.OPENAI_API_KEY || undefined;
    } else {
      try {
        const supabase = await createClient();
        user = (await supabase.auth.getUser()).data.user;
      } catch {
        user = null;
      }
    }

    if (!openaiKey) {
      return NextResponse.json(
        { error: 'OpenAI entity extraction is temporarily unavailable.' },
        { status: 503 },
      );
    }

    let html: string;
    let contentHash: string;
    let fetchedFromCache = false;
    let finalUrl: string | undefined;
    let redirectCount = 0;
    let contentType: string | null = null;

    if (body.url) {
      const fetched = await fetchWebpage(body.url, { clearCache: body.clearCache });
      html = fetched.html;
      contentHash = fetched.contentHash;
      fetchedFromCache = fetched.cached;
      finalUrl = fetched.finalUrl;
      redirectCount = fetched.redirectCount;
      contentType = fetched.contentType;
    } else {
      const pasted = body.pasteContent!.trim();
      html = body.pasteFormat === 'html'
        ? pasted
        : `<html><body><pre>${escapeHtml(pasted)}</pre></body></html>`;
      contentHash = hashContent(pasted);
    }

    const textParts = extractTextFromHtml(html);
    const extractionHash = extractionCacheKey(contentHash, body.mainTopicOverride);

    const cachedExtraction = body.clearCache
      ? null
      : await getCachedExtraction(extractionHash);

    const headingTexts = textParts.headings.map((heading) => heading.text);
    const fullText = [
      textParts.title,
      textParts.description,
      ...headingTexts,
      textParts.body,
    ].filter(Boolean).join('. ');

    const liveExtraction = cachedExtraction
      ? null
      : await extractEntities(fullText, openaiKey);
    const extraction = cachedExtraction ?? liveExtraction!;
    const mainTopic = body.mainTopicOverride?.trim() || extraction.mainTopic.trim();
    if (!mainTopic || extraction.entities.length === 0) {
      return NextResponse.json(
        { error: 'The page did not contain enough clear content to identify a topic and entities.' },
        { status: 422 },
      );
    }
    const mainTopicConfidence = body.mainTopicOverride
      ? 1
      : estimateTopicConfidence(mainTopic, textParts);

    if (!cachedExtraction) {
      await cacheExtraction(extractionHash, {
        entities: extraction.entities,
        mainTopic,
        mainTopicConfidence,
        tokenUsage: extraction.tokenUsage,
        costUsd: extraction.costUsd,
      });
    }

    const analysisRunId = await createAnalysisRun({
      user,
      url: body.url,
      analysisType: body.url ? 'full' : 'paste',
      keySource: isByok ? 'byok' : 'free_tier',
      contentHash,
      entitiesFound: extraction.entities.length,
      openaiInputTokens: liveExtraction?.usage?.inputTokens,
      openaiOutputTokens: liveExtraction?.usage?.outputTokens,
      openaiCostUsd: liveExtraction?.usage?.costUsd,
    });

    if (!analysisRunId && !isByok) {
      return NextResponse.json(
        { error: 'The analysis run could not be started. Please try again.' },
        { status: 503 },
      );
    }
    if (!isByok && user) await incrementFreeUsage(user.id);

    const result: ExtractResult = {
      textParts,
      mainTopic,
      mainTopicConfidence,
      entities: extraction.entities,
      tokenUsage: cachedExtraction ? undefined : extraction.tokenUsage,
      costUsd: cachedExtraction ? undefined : extraction.costUsd,
      cacheStatus: {
        fetch: body.url ? (fetchedFromCache ? 'cached' : 'fresh') : 'pasted',
        extraction: cachedExtraction ? 'cached' : 'fresh',
      },
      contentHash,
      usage: liveExtraction?.usage,
      analysisRunId: analysisRunId ?? randomUUID(),
      analysisVersion: ANALYSIS_VERSION,
      fetchMetadata: {
        source: body.url ? 'url' : 'paste',
        finalUrl,
        redirectCount,
        contentType,
      },
    };

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = /URL|network|HTTP|content type|webpage|redirect/i.test(message) ? 502 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
