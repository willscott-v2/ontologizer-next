import { z } from 'zod';
import type { EnrichedEntity } from '../types/entities';
import type {
  AiUsage,
  ClarityAssessment,
  ClarityDimensionName,
  Recommendation,
  TextParts,
} from '../types/analysis';
import { computeCost } from '../pricing';

const OPENAI_MODEL = 'gpt-5.4-mini';

const recommendationSchema = z.object({
  observation: z.string().min(10).max(240),
  evidence: z.array(z.string().min(1).max(80)).min(1).max(4),
  action: z.string().min(10).max(300),
  priority: z.enum(['high', 'medium', 'low']),
  effort: z.enum(['small', 'medium', 'large']),
  confidence: z.enum(['high', 'medium', 'low']),
  dimension: z.enum([
    'topicFocus',
    'entityClarity',
    'semanticCoherence',
    'answerStructure',
    'schema',
    'queryCoverage',
  ]),
}).strict();

export const recommendationResponseSchema = z.object({
  recommendations: z.array(recommendationSchema).min(1).max(8),
}).strict();

export interface ContentAnalysis {
  recommendations: Recommendation[];
  mode: 'ai' | 'deterministic';
  fallbackReason?: 'empty_response' | 'truncated_response' | 'invalid_json' | 'invalid_contract' | 'invalid_evidence' | 'provider_error';
  usage?: AiUsage;
}

const priorityRank = { high: 0, medium: 1, low: 2 } as const;
const confidenceRank = { high: 0, medium: 1, low: 2 } as const;
const effortRank = { small: 0, medium: 1, large: 2 } as const;

export function sortAndDeduplicateRecommendations(
  recommendations: Recommendation[],
): Recommendation[] {
  const seen = new Set<string>();
  return [...recommendations]
    .sort((a, b) =>
      priorityRank[a.priority] - priorityRank[b.priority]
      || confidenceRank[a.confidence] - confidenceRank[b.confidence]
      || effortRank[a.effort] - effortRank[b.effort])
    .filter((recommendation) => {
      const signature = recommendation.action.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
}

const actions: Record<string, string> = {
  'topic-in-title': 'Revise the page title so it clearly names the main topic while preserving the page’s specific value proposition.',
  'topic-in-h1': 'Use one H1 that clearly names the page’s main topic and matches the page’s actual purpose.',
  'topic-in-opening': 'Add a direct one- or two-sentence explanation of the main topic near the beginning of the page.',
  'topic-in-supporting-headings': 'Rename one or more section headings so the outline shows how the sections support the main topic.',
  'topic-repetition': 'Replace repeated exact-match phrasing with natural variants where the repetition does not add meaning.',
  'primary-entity': 'Confirm the primary entity and add enough nearby context to distinguish it from people, places, or brands with similar names.',
  'entity-type': 'Identify the primary entity with a more specific type such as Person, Organization, Service, Product, or Place.',
  'entity-name-consistency': 'Use a consistent primary name and make aliases explicit the first time they appear.',
  'entity-page-support': 'Review entities without visible page support and correct extraction errors or add missing context where the entity is genuinely relevant.',
  'unsupported-entity-review': 'Review the flagged entities as aliases, examples, comparisons, or extraction noise before changing the page copy.',
  'single-h1': 'Keep one page-level H1 and demote additional top-level headings to the appropriate section level.',
  'heading-order': 'Adjust heading levels so the outline does not skip from one level to a much deeper level.',
  'direct-introduction': 'Open with a concise explanation that answers what the page is about and who it is for.',
  'scannable-facts': 'Turn appropriate facts, steps, requirements, or options into a visible list or definition list.',
  'readable-html': 'Ensure the main content is present in the server-rendered HTML or provide an equivalent crawlable rendering.',
};

export function generateDeterministicRecommendations(
  clarity: ClarityAssessment,
): Recommendation[] {
  const recommendations: Recommendation[] = [];
  for (const [dimension, assessment] of Object.entries(clarity.dimensions) as Array<
    [ClarityDimensionName, ClarityAssessment['dimensions'][ClarityDimensionName]]
  >) {
    for (const check of assessment.checks) {
      if (!['fail', 'review'].includes(check.status)) continue;
      const action = actions[check.id];
      if (!action) continue;
      recommendations.push({
        observation: check.detail,
        evidence: check.evidenceIds,
        action,
        priority: check.status === 'fail' ? 'high' : 'medium',
        effort: ['readable-html', 'entity-page-support'].includes(check.id) ? 'large' : 'small',
        confidence: check.evidenceIds.length > 0 ? 'high' : 'medium',
        dimension,
      });
    }
  }
  return sortAndDeduplicateRecommendations(recommendations).slice(0, 8);
}

function representativeContent(textParts: TextParts): string {
  const body = textParts.body;
  const chunkSize = 1_500;
  const chunks = [
    body.slice(0, chunkSize),
    body.slice(Math.max(0, Math.floor(body.length / 2) - chunkSize / 2), Math.floor(body.length / 2) + chunkSize / 2),
    body.slice(Math.max(0, body.length - chunkSize)),
  ].map((chunk) => chunk.trim()).filter(Boolean);
  return [...new Set(chunks)].join('\n\n[CONTENT CHUNK]\n');
}

function allEvidenceIds(clarity: ClarityAssessment): Set<string> {
  return new Set(Object.values(clarity.dimensions)
    .flatMap((dimension) => dimension.evidence.map((evidence) => evidence.id)));
}

function validateEvidenceReferences(
  recommendations: Recommendation[],
  clarity: ClarityAssessment,
): Recommendation[] | null {
  const validIds = allEvidenceIds(clarity);
  if (recommendations.some((recommendation) =>
    recommendation.evidence.some((id) => !validIds.has(id)))) {
    return null;
  }
  return sortAndDeduplicateRecommendations(recommendations);
}

export async function analyzeContent(
  entities: EnrichedEntity[],
  textParts: TextParts,
  mainTopic: string,
  clarity: ClarityAssessment,
  jsonLd?: Record<string, unknown>,
  openaiKey?: string,
): Promise<ContentAnalysis> {
  const fallback = generateDeterministicRecommendations(clarity);
  if (!openaiKey) return { recommendations: fallback, mode: 'deterministic' };

  try {
    const { default: OpenAI } = await import('openai');
    const { zodResponseFormat } = await import('openai/helpers/zod');
    const client = new OpenAI({ apiKey: openaiKey });
    const outline = textParts.headings.map((heading) => `${'#'.repeat(heading.level)} ${heading.text}`).join('\n');
    const evidence = Object.entries(clarity.dimensions).flatMap(([dimension, assessment]) =>
      assessment.evidence.map((item) => ({ dimension, ...item })));
    const schemaTypes = Array.isArray(jsonLd?.['@graph'])
      ? (jsonLd['@graph'] as Array<Record<string, unknown>>).map((node) => node['@type']).filter(Boolean)
      : [jsonLd?.['@type']].filter(Boolean);
    const prompt = `Review this page and return evidence-backed improvement recommendations as JSON.

Main topic: ${mainTopic}
Entities: ${entities.map((entity) => `${entity.name} (${entity.type})`).join(', ')}
Existing schema types: ${schemaTypes.join(', ') || 'none detected'}

Page outline:
${outline || 'No headings found'}

Representative page content:
${representativeContent(textParts)}

Allowed evidence IDs:
${JSON.stringify(evidence.map((item) => item.id))}

Evidence catalog:
${JSON.stringify(evidence)}

Return 1-8 recommendations. Every evidence value must be an allowed evidence ID. Do not recommend keyword frequency, deleting content based only on lookup confidence, or schema already present. Use this exact contract:
{"recommendations":[{"observation":"...","evidence":["evidence-id"],"action":"...","priority":"high|medium|low","effort":"small|medium|large","confidence":"high|medium|low","dimension":"topicFocus|entityClarity|semanticCoherence|answerStructure|schema"}]}`;

    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_completion_tokens: 4_000,
      reasoning_effort: 'low',
      response_format: zodResponseFormat(recommendationResponseSchema, 'content_recommendations'),
    });
    let usage: AiUsage | undefined;
    if (response.usage) {
      const inputTokens = response.usage.prompt_tokens ?? 0;
      const outputTokens = response.usage.completion_tokens ?? 0;
      usage = {
        provider: 'openai',
        model: OPENAI_MODEL,
        inputTokens,
        outputTokens,
        costUsd: computeCost(OPENAI_MODEL, inputTokens, outputTokens) ?? 0,
      };
    }
    const content = response.choices[0]?.message?.content;
    if (!content) {
      return {
        recommendations: fallback,
        mode: 'deterministic',
        fallbackReason: response.choices[0]?.finish_reason === 'length' ? 'truncated_response' : 'empty_response',
        usage,
      };
    }
    let json: unknown;
    try {
      json = JSON.parse(content);
    } catch {
      return { recommendations: fallback, mode: 'deterministic', fallbackReason: 'invalid_json', usage };
    }
    const parsed = recommendationResponseSchema.safeParse(json);
    if (!parsed.success) return { recommendations: fallback, mode: 'deterministic', fallbackReason: 'invalid_contract', usage };
    const validated = validateEvidenceReferences(parsed.data.recommendations, clarity);
    if (!validated) return { recommendations: fallback, mode: 'deterministic', fallbackReason: 'invalid_evidence', usage };
    return { recommendations: validated.slice(0, 8), mode: 'ai', usage };
  } catch {
    return { recommendations: fallback, mode: 'deterministic', fallbackReason: 'provider_error' };
  }
}
