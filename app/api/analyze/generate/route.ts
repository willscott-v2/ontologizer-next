/**
 * POST /api/analyze/generate
 *
 * Accepts enriched entities, text parts, main topic, and URL.
 * Returns generated JSON-LD schema, SEO recommendations, salience score,
 * improvement tips, and irrelevant entities.
 *
 * Headers:
 *   X-OpenAI-Key (optional) - BYOK OpenAI key for enhanced recommendations
 *
 * Body:
 *   { enrichedEntities, textParts, mainTopic, url }
 */

import { NextRequest, NextResponse } from 'next/server';
import type { EnrichedEntity } from '../../../../lib/types/entities';
import type { TextParts, GenerateResult } from '../../../../lib/types/analysis';
import { generateJsonLd } from '../../../../lib/pipeline/schema-generator';
import { analyzeContent } from '../../../../lib/pipeline/seo-analyzer';
import { calculateSalience } from '../../../../lib/pipeline/salience-scorer';

interface GenerateRequestBody {
  enrichedEntities: EnrichedEntity[];
  textParts: TextParts;
  mainTopic: string;
  url: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateRequestBody;
    const { enrichedEntities, textParts, mainTopic, url } = body;

    if (!enrichedEntities || !textParts || !mainTopic) {
      return NextResponse.json(
        { error: 'Missing required fields: enrichedEntities, textParts, mainTopic' },
        { status: 400 },
      );
    }

    const openaiKey = request.headers.get('X-OpenAI-Key') || undefined;

    // Generate JSON-LD schema
    const jsonLd = generateJsonLd(enrichedEntities, textParts, mainTopic, url || '');

    // Run SEO analysis and salience scoring in parallel
    const [recommendations, salience] = await Promise.all([
      analyzeContent(enrichedEntities, textParts, mainTopic, jsonLd, openaiKey),
      Promise.resolve(calculateSalience(enrichedEntities, textParts, mainTopic)),
    ]);

    const result: GenerateResult = {
      jsonLd,
      recommendations,
      topicalSalience: salience.score,
      salienceTips: salience.tips,
      irrelevantEntities: salience.irrelevantEntities,
    };

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
