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

// Step 1: Extract response
export interface ExtractResult {
  textParts: TextParts;
  mainTopic: string;
  mainTopicConfidence: number;
  entities: RawEntity[];
  tokenUsage?: number;
  costUsd?: number;
  cached?: boolean;
}

// Step 2: Enrich response (per batch)
export interface EnrichResult {
  enrichedEntities: EnrichedEntity[];
  processingTimeMs?: number;
}

// Step 3: Generate response
export interface GenerateResult {
  jsonLd: Record<string, unknown>;
  recommendations: Recommendation[];
  topicalSalience: number;
  salienceTips: string[];
  irrelevantEntities: string[];
}

export interface Recommendation {
  category?: string;
  advice: string;
}

// Step 4: Fan-out response
export interface FanoutResult {
  analysis: string | null;
  chunksExtracted: number;
  chunks?: SemanticChunk[] | string[];
  error?: string;
}

// Combined full analysis
export interface SalienceInfo {
  score: number;
  mainTopic: string;
}

export interface AnalysisResult {
  entities: EnrichedEntity[];
  jsonLd: Record<string, unknown>;
  recommendations: Recommendation[];
  topicalSalience: SalienceInfo;
  salienceTips: string[];
  irrelevantEntities: string[];
  fanoutAnalysis?: FanoutResult;
  processingTimeMs: number;
  cached: boolean;
}

// Form params
export interface AnalyzeParams {
  mode: 'url' | 'paste';
  url: string;
  pasteContent: string;
  mainTopicStrategy: MainTopicStrategy;
  clearCache: boolean;
  runFanout: boolean;
  fanoutOnly: boolean;
}

export type MainTopicStrategy = 'strict' | 'title' | 'frequent' | 'pattern';

export type AnalysisStep = 'idle' | 'extracting' | 'enriching' | 'generating' | 'fanout' | 'complete' | 'error';
