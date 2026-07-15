import { describe, expect, it } from 'vitest';
import { extractTextFromHtml } from '../parser';
import { assessClarity } from '../clarity-assessor';
import {
  generateDeterministicRecommendations,
  recommendationResponseSchema,
  sortAndDeduplicateRecommendations,
} from '../seo-analyzer';
import type { Recommendation } from '@/lib/types/analysis';

const validRecommendation: Recommendation = {
  observation: 'The H1 does not clearly name the topic.',
  evidence: ['topic-h1-1'],
  action: 'Revise the H1 so it clearly names the topic.',
  priority: 'high',
  effort: 'small',
  confidence: 'high',
  dimension: 'topicFocus',
};

describe('recommendation contract', () => {
  it('accepts strict well-formed recommendations and rejects extra or incomplete fields', () => {
    expect(recommendationResponseSchema.safeParse({ recommendations: [validRecommendation] }).success).toBe(true);
    expect(recommendationResponseSchema.safeParse({ recommendations: [{ ...validRecommendation, extra: true }] }).success).toBe(false);
    const incomplete = { ...validRecommendation } as Partial<Recommendation>;
    delete incomplete.action;
    expect(recommendationResponseSchema.safeParse({ recommendations: [incomplete] }).success).toBe(false);
  });

  it('orders by priority and removes duplicate actions', () => {
    const lower: Recommendation = { ...validRecommendation, priority: 'low', action: 'Add one clear H1.' };
    const duplicate: Recommendation = { ...validRecommendation, priority: 'medium' };
    const sorted = sortAndDeduplicateRecommendations([lower, duplicate, validRecommendation]);
    expect(sorted[0].priority).toBe('high');
    expect(sorted).toHaveLength(2);
  });

  it('uses only applicable checks and never recommends generic frequency increases', () => {
    const clarity = assessClarity({
      entities: [],
      textParts: extractTextFromHtml('<html><head><title>Other</title></head><body><h1>Other</h1><p>Short introduction.</p></body></html>'),
      mainTopic: 'Technical SEO Audits',
      topicConfidence: 0.8,
    });
    const recommendations = generateDeterministicRecommendations(clarity);
    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations.map((item) => item.action).join(' ')).not.toMatch(/increase.*frequency/i);
    expect(recommendations.every((item) => item.observation && item.action)).toBe(true);
  });
});
