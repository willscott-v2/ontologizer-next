/**
 * Entity extraction via OpenAI (primary) with regex fallback.
 * Ported from PHP extract_entities_openai() (lines 469-585) and extract_entities_basic() (lines 587-623).
 */

import type { RawEntity } from '../types/entities';

interface ExtractionResult {
  mainTopic: string;
  mainTopicConfidence: number;
  entities: RawEntity[];
  tokenUsage?: number;
  costUsd?: number;
}

// ── OpenAI extraction ──────────────────────────────────────────────────

const OPENAI_PROMPT = `Analyze this web page content to extract entities and identify the main topic using Wikipedia-style semantic precision.

MAIN TOPIC RULES:
- Extract the PRIMARY business service, product, or subject (2-6 words max)
- For location-specific services: include the key location in the main topic (e.g., 'O\\'Hare Limo Service', 'Denver Airport Transportation')
- For general limo/transportation: use 'Limo Service' or 'Airport Transportation'
- For SEO articles: use 'SEO' or 'AI Search Optimization'
- For cybersecurity: use 'Cybersecurity' or specific service type
- If content is about a SPECIFIC location's service, include that location in the main topic
- Avoid generic marketing phrases like 'Greater Chicago' unless that's the actual business focus

WIKIPEDIA-STYLE ENTITY EXTRACTION:
- Extract 15-20 HIGH-QUALITY entities that would definitely have Wikipedia pages or be notable enough for Wikipedia
- Think: "Would this entity have its own Wikipedia article or be a redirect to a notable page?"
- PREFER entities that are:
  * Proper nouns (companies, places, people, brands, technologies)
  * Well-known concepts with clear definitions (Search Engine Optimization, not "optimization")
  * Specific institutions, products, or services (Palo Alto University, not "universities")
  * Industry-standard terms (Schema Markup, Technical SEO, Content Marketing)

SEMANTIC ACCURACY RULES:
- For "Student Recruitment" -> think "Student recruitment" (general concept), NOT academic papers about recruitment
- For "Higher Education" -> think "Higher education" (field of study), NOT "Higher education accreditation"
- For "AI SEO" -> think "Search engine optimization" or "Artificial intelligence", NOT "AI Seoul Summit"
- For "Analytics" -> think "Analytics" (general field), NOT "Google Analytics" (specific tool)
- AVOID overly specific research papers, academic studies, or location-specific variants
- AVOID adding extra qualifiers unless they're part of the actual entity name

FILTERING RULES:
- Include: companies, brands, people, specific locations, products, technologies, key concepts
- EXCLUDE abstract concepts like: wonder, invention, discernment, tenacity, enablement, galvanizing
- EXCLUDE generic business terms: pricing, location, reliability, efficiency, comfort
- EXCLUDE template elements: Semrush, social media widgets, cookie notices
- Each entity: 1-4 words maximum
- Focus on entities that support the main topic and would be recognized by Wikipedia

EXAMPLES:
- O'Hare limo page: Echo Limousine, O'Hare Airport, Airport Transportation, Chauffeur, Limousine
- SEO page: Search Engine Optimization, Google Search, Schema Markup, Technical SEO, Content Marketing
- Education page: Higher Education, Student Recruitment, Academic Programs, Distance Learning

Return JSON format:
{
  "main_topic": "(primary service/subject with location if relevant, 2-6 words)",
  "entities": ["Entity 1", "Entity 2", "Entity 3", ...]
}

Content:
`;

export async function extractEntitiesOpenAI(
  text: string,
  apiKey: string,
): Promise<ExtractionResult> {
  // Limit content to 8000 chars for reasonable token usage
  const contentForAnalysis = text.slice(0, 8000);

  const requestBody = {
    model: 'gpt-4o',
    messages: [{ role: 'user', content: OPENAI_PROMPT + contentForAnalysis }],
    max_tokens: 1000,
    temperature: 0.3,
    response_format: { type: 'json_object' },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No content in OpenAI response');
    }

    const parsed = JSON.parse(content);

    // Track token usage
    let tokenUsage: number | undefined;
    let costUsd: number | undefined;
    if (data.usage) {
      const promptTokens = data.usage.prompt_tokens ?? 0;
      const completionTokens = data.usage.completion_tokens ?? 0;
      tokenUsage = data.usage.total_tokens ?? promptTokens + completionTokens;
      // GPT-4o pricing: $0.000005/input, $0.000015/output
      costUsd = promptTokens * 0.000005 + completionTokens * 0.000015;
    }

    if (Array.isArray(parsed.entities)) {
      return {
        mainTopic: parsed.main_topic ?? '',
        mainTopicConfidence: 0.85, // OpenAI extraction is high-confidence
        entities: parsed.entities.map((name: string) => ({ name })),
        tokenUsage,
        costUsd,
      };
    }

    throw new Error('Invalid entity format in OpenAI response');
  } finally {
    clearTimeout(timeout);
  }
}

// ── Basic regex fallback ───────────────────────────────────────────────

const COMMON_WORDS = new Set([
  'The', 'And', 'Or', 'But', 'In', 'On', 'At', 'To', 'For', 'Of', 'With',
  'By', 'From', 'This', 'That', 'These', 'Those', 'All', 'Some', 'Any',
  'Each', 'Every', 'No', 'Not', 'Only', 'Just', 'Very', 'More', 'Most',
  'Less', 'Least', 'Much', 'Many', 'Few', 'Several', 'Various', 'Different',
  'Same', 'Similar', 'Other', 'Another', 'Next', 'Last', 'First', 'Second',
  'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth',
]);

export function extractEntitiesBasic(text: string): RawEntity[] {
  const entitySet = new Set<string>();

  // Extract capitalized multi-word phrases
  const capitalized = text.match(/\b[A-Z][a-zA-Z&]+(?:\s+[A-Z][a-zA-Z&]+)*\b/g);
  if (capitalized) {
    for (const match of capitalized) {
      const trimmed = match.trim();
      if (trimmed.length > 2 && trimmed.length < 50) {
        entitySet.add(trimmed);
      }
    }
  }

  // Extract potential product names with modifiers
  const products = text.match(
    /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Pro|Max|Plus|Ultra|Elite|Premium|Standard|Basic|Lite|Mini|Air|Studio|Enterprise|Professional)\b/gi,
  );
  if (products) {
    for (const match of products) {
      entitySet.add(match.trim());
    }
  }

  // Remove common words and generic patterns
  const filtered = [...entitySet].filter((entity) => {
    if (COMMON_WORDS.has(entity)) return false;
    if (/^\d+$/.test(entity)) return false;
    if (/^[A-Z]$/.test(entity)) return false;
    if (/^[A-Z]\s*[A-Z]$/.test(entity)) return false;
    return true;
  });

  return filtered.slice(0, 40).map((name) => ({ name }));
}

// ── Main entry point ───────────────────────────────────────────────────

export async function extractEntities(
  text: string,
  openaiApiKey?: string,
): Promise<ExtractionResult> {
  // Try OpenAI first if a key is available
  if (openaiApiKey) {
    try {
      return await extractEntitiesOpenAI(text, openaiApiKey);
    } catch {
      // Fall through to basic extraction
    }
  }

  // Fallback to regex-based extraction
  const entities = extractEntitiesBasic(text);
  return {
    mainTopic: '',
    mainTopicConfidence: 0,
    entities,
  };
}
