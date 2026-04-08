import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Step 2: Enrich a batch of entities in parallel
// Expected request body: { entities: string[], mainTopic: string }
// BYOK keys in headers: X-Google-KG-Key
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { entities, mainTopic } = body;

    // TODO: For each entity in batch, check entity_cache first
    // TODO: Enrich cache misses in parallel (Wikipedia, Wikidata, Google KG, ProductOntology)
    // TODO: Write new enrichments to entity_cache
    // TODO: Return EnrichResult

    return NextResponse.json(
      { error: 'Not implemented yet. Port enricher in Phase 2.' },
      { status: 501 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
