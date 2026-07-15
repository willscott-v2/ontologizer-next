import { NextRequest, NextResponse } from 'next/server';
import { generateSchemaArtifact } from '@/lib/pipeline/schema-generator';
import { analyzeContent } from '@/lib/pipeline/seo-analyzer';
import { assessClarity } from '@/lib/pipeline/clarity-assessor';
import { createClient } from '@/lib/supabase/server';
import { authorizeAnalysisStep, completeAnalysisStep } from '@/lib/analysis/run-store';
import { generateRequestSchema, formatZodError } from '@/lib/analysis/request-schemas';
import type { GenerateResult } from '@/lib/types/analysis';

export async function POST(request: NextRequest) {
  try {
    const parsed = generateRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const body = parsed.data;
    const byokOpenaiKey = request.headers.get('X-OpenAI-Key') || undefined;
    const supabase = await createClient();
    const user = (await supabase.auth.getUser()).data.user;
    const authorization = await authorizeAnalysisStep({
      analysisRunId: body.analysisRunId,
      contentHash: body.contentHash,
      step: 'generate',
      user,
      hasByokKey: Boolean(byokOpenaiKey),
    });
    if (!authorization.allowed) {
      return NextResponse.json({ error: authorization.reason }, { status: 403 });
    }

    const openaiKey = byokOpenaiKey || (user ? process.env.OPENAI_API_KEY : undefined);
    const schemaArtifact = generateSchemaArtifact(
      body.enrichedEntities,
      body.textParts,
      body.mainTopic,
      body.url,
    );
    const degradedSteps: string[] = [];
    const clarity = assessClarity({
      entities: body.enrichedEntities,
      textParts: body.textParts,
      mainTopic: body.mainTopic,
      topicConfidence: body.topicConfidence,
      degradedSteps,
    });
    const contentAnalysis = await analyzeContent(
      body.enrichedEntities,
      body.textParts,
      body.mainTopic,
      clarity,
      schemaArtifact.jsonLd,
      openaiKey,
    );
    if (contentAnalysis.mode === 'deterministic') {
      clarity.degradedSteps.push('AI recommendations unavailable; deterministic checks used.');
    }

    await completeAnalysisStep({
      analysisRunId: body.analysisRunId,
      step: 'generate',
      openaiInputTokens: contentAnalysis.usage?.inputTokens,
      openaiOutputTokens: contentAnalysis.usage?.outputTokens,
      openaiCostUsd: contentAnalysis.usage?.costUsd,
    });

    const result: GenerateResult = {
      schemaArtifact,
      recommendations: contentAnalysis.recommendations,
      clarity,
      recommendationMode: contentAnalysis.mode,
      fallbackReason: contentAnalysis.fallbackReason,
      usage: contentAnalysis.usage,
    };
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
