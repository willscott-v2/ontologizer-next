import { NextResponse, type NextRequest } from 'next/server';
import { enrichEntities } from '@/lib/pipeline/enricher';
import { findLinkedInFromHtml } from '@/lib/pipeline/enricher/linkedin';
import { getCachedEntities, cacheEntities } from '@/lib/cache/entity-cache';
import { createClient } from '@/lib/supabase/server';
import { authorizeAnalysisStep, completeAnalysisStep } from '@/lib/analysis/run-store';
import { enrichRequestSchema, formatZodError } from '@/lib/analysis/request-schemas';
import type { EnrichedEntity } from '@/lib/types/entities';
import type { EnrichResult } from '@/lib/types/analysis';

export async function POST(request: NextRequest) {
  try {
    const parsed = enrichRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const body = parsed.data;
    const byokGoogleKey = request.headers.get('X-Google-KG-Key') || undefined;
    const supabase = await createClient();
    const user = (await supabase.auth.getUser()).data.user;
    const authorization = await authorizeAnalysisStep({
      analysisRunId: body.analysisRunId,
      contentHash: body.contentHash,
      step: 'enrich',
      user,
      hasByokKey: Boolean(byokGoogleKey),
    });
    if (!authorization.allowed) {
      return NextResponse.json({ error: authorization.reason }, { status: 403 });
    }

    const googleKgKey = byokGoogleKey || (user ? process.env.GOOGLE_KG_API_KEY : undefined);
    const startTime = Date.now();
    const entityNames = body.entities.map((entity) => entity.name);
    const cached = await getCachedEntities(entityNames, body.mainTopic);
    const uncachedEntities = body.entities.filter(
      (entity) => !cached.has(entity.name.toLowerCase()),
    );

    let freshlyEnriched: EnrichedEntity[] = [];
    if (uncachedEntities.length > 0) {
      freshlyEnriched = await enrichEntities(uncachedEntities, body.mainTopic, {
        googleKg: googleKgKey,
      });
      await cacheEntities(freshlyEnriched, body.mainTopic);
    }

    const enrichedEntities = body.entities.map((entity) => {
      const fromCache = cached.get(entity.name.toLowerCase());
      if (fromCache) return fromCache;
      return freshlyEnriched.find(
        (candidate) => candidate.name.toLowerCase() === entity.name.toLowerCase(),
      ) ?? {
        name: entity.name,
        type: 'Thing' as const,
        confidenceScore: 0,
        wikipediaUrl: null,
        wikidataUrl: null,
        googleKgUrl: null,
        productOntologyUrl: null,
      };
    });

    if (body.htmlContent) {
      for (const entity of enrichedEntities) {
        if (entity.type === 'Person') {
          entity.linkedinUrl = findLinkedInFromHtml(entity.name, body.htmlContent);
        }
      }
    }

    await completeAnalysisStep({ analysisRunId: body.analysisRunId, step: 'enrich' });
    const result: EnrichResult = {
      enrichedEntities,
      processingTimeMs: Date.now() - startTime,
      cacheStatus: {
        hits: cached.size,
        misses: uncachedEntities.length,
      },
      googleKnowledgeGraph: googleKgKey ? 'queried' : 'not_configured',
    };
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
