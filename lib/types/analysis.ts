import type { EnrichedEntity, RawEntity } from './entities';

// Shared text structure returned by parser
export interface Heading {
  level: number;
  text: string;
}

export interface TextParts {
  title: string;
  description: string;
  headings: Heading[];
  body: string;
  htmlContent: string;
}

// Semantic chunk for fan-out analysis
export interface SemanticChunk {
  id: string;
  type:
    | 'primary_topic'
    | 'section'
    | 'list'
    | 'structured_data'
    | 'paragraphs'
    | 'questions_on_page'
    | 'key_terms'
    | 'page_metadata';
  heading?: string;
  content: string;
}

export type QueryCoverageIntent =
  | 'definition'
  | 'comparison'
  | 'procedure'
  | 'evaluation'
  | 'audience'
  | 'trust'
  | 'local';

export interface QueryCoverageQuestion {
  question: string;
  intent: QueryCoverageIntent;
  coverage: 'covered' | 'partial' | 'missing';
  evidenceChunkIds: string[];
  checkedScope: string;
  gapAction?: string;
}

export interface QueryCoverageAnalysis {
  primaryEntity: string;
  questions: QueryCoverageQuestion[];
  summary: { covered: number; partial: number; missing: number };
  promptVersion: string;
  disclosure: string;
}

// Token usage + cost for a single AI call
export interface AiUsage {
  provider: 'openai' | 'gemini';
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** USD. 0 when the model is unknown to the pricing table. */
  costUsd: number;
}

// Step 1: Extract response
export interface ExtractResult {
  textParts: TextParts;
  mainTopic: string;
  mainTopicConfidence: number;
  entities: RawEntity[];
  tokenUsage?: number;
  costUsd?: number;
  cacheStatus: {
    fetch: 'fresh' | 'cached' | 'pasted';
    extraction: 'fresh' | 'cached';
  };
  /** md5 of cleaned page text. Used as key for extraction + fanout caches. */
  contentHash: string;
  /** Present only when a live OpenAI call happened (cache miss). */
  usage?: AiUsage;
  /** Server-owned lifecycle row for authorizing downstream analysis steps. */
  analysisRunId: string;
  analysisVersion: string;
  fetchMetadata: {
    source: 'url' | 'paste';
    finalUrl?: string;
    redirectCount: number;
    contentType: string | null;
  };
}

// Step 2: Enrich response (per batch)
export interface EnrichResult {
  enrichedEntities: EnrichedEntity[];
  processingTimeMs?: number;
  cacheStatus: { hits: number; misses: number };
  googleKnowledgeGraph: 'queried' | 'not_configured';
}

// Step 3: Generate response
export interface GenerateResult {
  schemaArtifact: SchemaArtifact;
  recommendations: Recommendation[];
  clarity: ClarityAssessment;
  recommendationMode: 'ai' | 'deterministic';
  fallbackReason?: 'empty_response' | 'truncated_response' | 'invalid_json' | 'invalid_contract' | 'invalid_evidence' | 'provider_error';
  /** Present only when OpenAI generated the recommendations. */
  usage?: AiUsage;
}

export interface SchemaArtifactIssue {
  code: string;
  nodeId?: string;
  property?: string;
  message: string;
  action: string;
}

export interface SchemaArtifact {
  jsonLd: Record<string, unknown>;
  /** JSON-LD already published on the analyzed page, when detected. */
  existingSchema?: { found: boolean; types: string[] };
  pageType: {
    type: 'Service' | 'LocalBusiness' | 'EducationalOccupationalProgram' | 'Article' | 'WebPage';
    confidence: number;
    evidence: string[];
  };
  status: 'ready' | 'review' | 'insufficient';
  errors: SchemaArtifactIssue[];
  warnings: SchemaArtifactIssue[];
  factsUsed: string[];
  factsOmitted: string[];
  schemaVersion: string;
  generatedAt: string;
}

export interface Recommendation {
  observation: string;
  evidence: string[];
  action: string;
  priority: 'high' | 'medium' | 'low';
  effort: 'small' | 'medium' | 'large';
  confidence: 'high' | 'medium' | 'low';
  dimension: ClarityDimensionName | 'schema' | 'queryCoverage';
}

// Step 4: Fan-out response
export interface FanoutResult {
  analysis: QueryCoverageAnalysis | null;
  chunksExtracted: number;
  chunks?: SemanticChunk[] | string[];
  error?: string;
  /** Present only when a live Gemini call happened (cache miss, no error). */
  usage?: AiUsage;
  cacheStatus?: 'fresh' | 'cached';
}

export type ClarityStatus = 'strong' | 'mixed' | 'weak' | 'unavailable';
export type ClarityDimensionName =
  | 'topicFocus'
  | 'entityClarity'
  | 'semanticCoherence'
  | 'answerStructure';

export interface ClarityEvidence {
  id: string;
  source: 'title' | 'description' | 'h1' | 'heading' | 'opening' | 'body' | 'entity' | 'html';
  text: string;
}

export interface ClarityCheck {
  id: string;
  label: string;
  status: 'pass' | 'review' | 'fail' | 'unavailable';
  detail: string;
  evidenceIds: string[];
}

export interface ClarityDimension {
  status: ClarityStatus;
  summary: string;
  evidence: ClarityEvidence[];
  checks: ClarityCheck[];
}

export interface ClarityAssessment {
  mainTopic: string;
  topicConfidence: number;
  overallStatus: ClarityStatus;
  dimensions: Record<ClarityDimensionName, ClarityDimension>;
  degradedSteps: string[];
  analysisVersion: string;
}

export interface AnalysisResult {
  entities: EnrichedEntity[];
  schemaArtifact: SchemaArtifact;
  recommendations: Recommendation[];
  clarity: ClarityAssessment;
  fanoutAnalysis?: FanoutResult;
  processingTimeMs: number;
  /** USD across extract + generate + fanout AI calls; 0 for fully cached runs. */
  apiCostUsd?: number;
  source: { mode: 'url' | 'paste'; url?: string };
  analyzedAt: string;
  provenance: {
    fetch: 'fresh' | 'cached' | 'pasted';
    extraction: 'fresh' | 'cached';
    enrichment: { hits: number; misses: number };
    recommendations: 'ai' | 'deterministic';
  };
}

// Form params
export interface AnalyzeParams {
  mode: 'url' | 'paste';
  url: string;
  pasteContent: string;
  pasteFormat: 'text' | 'html';
  mainTopicOverride: string;
  clearCache: boolean;
  runFanout: boolean;
}

export type AnalysisStep = 'idle' | 'extracting' | 'enriching' | 'generating' | 'fanout' | 'complete' | 'error';
