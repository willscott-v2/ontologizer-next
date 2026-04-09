/**
 * SEO content analyzer with OpenAI-powered recommendations.
 * Ported from PHP analyze_content() + generate_seo_recommendations_openai()
 * (lines 2923-3100).
 */

import type { EnrichedEntity } from '../types/entities';
import type { TextParts, Recommendation } from '../types/analysis';

/**
 * Analyze content and generate SEO recommendations.
 * Uses OpenAI GPT-4o when a key is provided, otherwise falls back to
 * basic heuristic recommendations.
 */
export async function analyzeContent(
  entities: EnrichedEntity[],
  textParts: TextParts,
  mainTopic: string,
  jsonLd?: Record<string, unknown>,
  openaiKey?: string,
): Promise<Recommendation[]> {
  if (openaiKey) {
    try {
      return await generateOpenAiRecommendations(
        entities,
        textParts,
        jsonLd,
        openaiKey,
      );
    } catch {
      // Fall through to basic analysis on error
    }
  }

  return generateBasicRecommendations(entities, textParts);
}

// ─── OpenAI-powered recommendations ────────────────────────────────────────

async function generateOpenAiRecommendations(
  entities: EnrichedEntity[],
  textParts: TextParts,
  jsonLd: Record<string, unknown> | undefined,
  apiKey: string,
): Promise<Recommendation[]> {
  // Use dynamic import so the openai package is only loaded when needed
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey });

  const topEntities = entities
    .filter((e) => e.confidenceScore > 50)
    .slice(0, 5);
  const entityListStr = topEntities.map((e) => e.name).join(', ');

  // Build context about already-implemented schema
  const schemaContext = buildSchemaContext(jsonLd);

  const prompt = `You are a world-class Semantic SEO strategist, specializing in topical authority and schema optimization. Analyze the following webpage content and its most salient topical entities to provide expert, actionable recommendations for improving its semantic density and authority.

**Page Text Summary:**
${textParts.body.slice(0, 2500)}...

**Most Salient Topical Entities Identified:**
${entityListStr}${schemaContext}

**Your Task:**
Provide a structured set of recommendations in a JSON object format. The JSON object must contain a single key: \`recommendations\`. The value should be an array of objects, where each object has two keys: \`category\` (e.g., 'Semantic Gaps', 'Content Depth', 'Strategic Guidance') and \`advice\` (the specific recommendation string).

Focus on content improvements, missing entity coverage, and advanced SEO strategies. Avoid recommending already-implemented structured data.

Example:
{
  "recommendations": [
    { "category": "Semantic Gaps", "advice": "Cover the topic of 'Voice Search Optimization' as it's highly relevant." },
    { "category": "Content Depth", "advice": "Expand on 'Local SEO' by including case studies and FAQs." }
  ]
}

Return *only* the raw JSON object, without any surrounding text, formatting, or explanations.`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1000,
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return generateBasicRecommendations(entities, textParts);

  const parsed = JSON.parse(content);
  if (
    parsed.recommendations &&
    Array.isArray(parsed.recommendations)
  ) {
    return parsed.recommendations as Recommendation[];
  }

  return generateBasicRecommendations(entities, textParts);
}

function buildSchemaContext(
  jsonLd: Record<string, unknown> | undefined,
): string {
  if (!jsonLd) return '';

  const implementedSchemas: string[] = [];
  const implementedFeatures: string[] = [];

  if (jsonLd['@type']) {
    implementedSchemas.push(jsonLd['@type'] as string);
  }

  const mainEntity = jsonLd.mainEntity;
  if (mainEntity && typeof mainEntity === 'object') {
    if (Array.isArray(mainEntity)) {
      for (const entity of mainEntity) {
        if (entity['@type']) implementedSchemas.push(entity['@type'] as string);
      }
    } else if ((mainEntity as Record<string, unknown>)['@type']) {
      implementedSchemas.push(
        (mainEntity as Record<string, unknown>)['@type'] as string,
      );
    }
  }

  if (jsonLd.hasPart) implementedFeatures.push('FAQ structured data');
  if (jsonLd.speakable) implementedFeatures.push('Voice search optimization (speakable)');
  if (jsonLd.provider) implementedFeatures.push('Provider/organization information');
  if (jsonLd.knowsAbout) implementedFeatures.push('Knowledge domain specification');
  if (jsonLd.sameAs) implementedFeatures.push('Entity linking (sameAs)');

  if (implementedSchemas.length === 0 && implementedFeatures.length === 0) {
    return '';
  }

  const parts: string[] = [];
  if (implementedSchemas.length > 0) {
    parts.push('Schema types: ' + [...new Set(implementedSchemas)].join(', '));
  }
  if (implementedFeatures.length > 0) {
    parts.push('Features: ' + [...new Set(implementedFeatures)].join(', '));
  }

  return (
    '\n\n**Already Implemented Structured Data:**\n' +
    parts.join('\n') +
    '\n\n**IMPORTANT:** Do NOT recommend implementing any of the above schema types or features as they are already active on this page.'
  );
}

// ─── Basic heuristic recommendations (no API key) ──────────────────────────

function generateBasicRecommendations(
  entities: EnrichedEntity[],
  textParts: TextParts,
): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const bodyLower = textParts.body.toLowerCase();

  // Check entity coverage
  for (const entity of entities) {
    const count = countOccurrences(bodyLower, entity.name.toLowerCase());
    if (count <= 1) {
      recommendations.push({
        category: 'Entity Coverage',
        advice: `Consider expanding coverage of '${entity.name}' with additional context, examples, or data to build more topical authority.`,
      });
    }
  }

  // Check basic SEO elements
  if (!textParts.title) {
    recommendations.push({
      category: 'Technical SEO',
      advice: 'Add a descriptive page title that includes your primary topic.',
    });
  }

  if (!textParts.description) {
    recommendations.push({
      category: 'Technical SEO',
      advice: 'Add a meta description that summarizes the page content and includes key entities.',
    });
  }

  const hasH1 = textParts.headings.some((h) => h.level === 1);
  if (!hasH1) {
    recommendations.push({
      category: 'Content Structure',
      advice: 'Add an H1 heading that clearly states the main topic of the page.',
    });
  }

  if (entities.length < 3) {
    recommendations.push({
      category: 'Semantic Density',
      advice: 'The page has few recognized entities. Add more specific, named concepts related to your topic to increase semantic richness.',
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      category: 'General',
      advice: 'Content appears to have good entity coverage. Review the generated JSON-LD for inclusion in your page schema to improve SEO.',
    });
  }

  return recommendations.slice(0, 5);
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}
