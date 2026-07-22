/**
 * Single source of truth for AI model pricing.
 * Prices are USD per 1M tokens, standard tier, verified 2026-07-15 against:
 *   https://developers.openai.com/api/docs/pricing
 *   https://ai.google.dev/gemini-api/docs/pricing
 *
 * Gemini "thinking" tokens bill at the output rate — callers must fold
 * thoughtsTokenCount into outputTokens before calling computeCost.
 * Gemini pro-tier models have higher pricing above 200K input tokens; our
 * calls are a few thousand tokens, so the ≤200K tier is used here.
 */

interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

const PRICING: Record<string, ModelPricing> = {
  // OpenAI — current
  'gpt-5.4-nano': { inputPer1M: 0.2, outputPer1M: 1.25 },
  'gpt-5.4-mini': { inputPer1M: 0.75, outputPer1M: 4.5 },
  // OpenAI — legacy (delisted; first snapshot shuts down 2026-10-23)
  'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10 },

  // Gemini — current
  'gemini-3.1-flash-lite': { inputPer1M: 0.25, outputPer1M: 1.5 },
  'gemini-3.6-flash': { inputPer1M: 1.5, outputPer1M: 7.5 },
  'gemini-3.5-flash': { inputPer1M: 1.5, outputPer1M: 9 },
  'gemini-3.1-pro-preview': { inputPer1M: 2, outputPer1M: 12 },
  // Gemini — legacy (all shut down 2026-10-16)
  'gemini-2.5-flash': { inputPer1M: 0.3, outputPer1M: 2.5 },
  'gemini-2.5-flash-lite': { inputPer1M: 0.1, outputPer1M: 0.4 },
  'gemini-2.5-pro': { inputPer1M: 1.25, outputPer1M: 10 },
};

/**
 * Compute the USD cost of a call. Returns null when the model isn't in the
 * pricing table — callers should treat null as "unknown", not free.
 */
export function computeCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const pricing = PRICING[model];
  if (!pricing) return null;
  return (
    (inputTokens * pricing.inputPer1M + outputTokens * pricing.outputPer1M) /
    1_000_000
  );
}
