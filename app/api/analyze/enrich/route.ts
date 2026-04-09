/**
 * POST /api/analyze/enrich
 *
 * Accepts a batch of raw entities + mainTopic, runs parallel enrichment
 * against Wikipedia, Wikidata, Google KG, and ProductOntology,
 * and returns an EnrichResult.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { enrichEntities } from '@/lib/pipeline/enricher';
import { getCachedEntities, cacheEntities } from '@/lib/cache/entity-cache';
import type { RawEntity, EnrichedEntity } from '@/lib/types/entities';
import type { EnrichResult } from '@/lib/types/analysis';

interface EnrichRequestBody {
  entities: RawEntity[];
  mainTopic: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as EnrichRequestBody;

    if (!Array.isArray(body.entities) || body.entities.length === 0) {
      return NextResponse.json(
        { error: 'Provide a non-empty "entities" array.' },
        { status: 400 },
      );
    }

    // BYOK: read Google KG key from header or fall back to env var
    const googleKgKey =
      request.headers.get('X-Google-KG-Key') ??
      process.env.GOOGLE_KG_API_KEY ??
      undefined;

    const startTime = Date.now();

    // Check entity cache for already-enriched entities
    const entityNames = body.entities.map((e) => e.name);
    const cached = await getCachedEntities(entityNames);

    const uncachedEntities = body.entities.filter(
      (e) => !cached.has(e.name.toLowerCase())
    );

    // Enrich only cache misses
    let freshlyEnriched: EnrichedEntity[] = [];
    if (uncachedEntities.length > 0) {
      freshlyEnriched = await enrichEntities(
        uncachedEntities,
        body.mainTopic ?? '',
        { googleKg: googleKgKey },
      );

      // Write new enrichments to cache (fire and forget)
      cacheEntities(freshlyEnriched).catch(() => {});
    }

    // Combine cached + fresh, preserving original order
    const enrichedEntities = body.entities.map((e) => {
      const fromCache = cached.get(e.name.toLowerCase());
      if (fromCache) return fromCache;
      return freshlyEnriched.find(
        (f) => f.name.toLowerCase() === e.name.toLowerCase()
      ) ?? { name: e.name, type: 'Thing' as const, confidenceScore: 0, wikipediaUrl: null, wikidataUrl: null, googleKgUrl: null, productOntologyUrl: null };
    });

    const result: EnrichResult = {
      enrichedEntities,
      processingTimeMs: Date.now() - startTime,
    };

    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
