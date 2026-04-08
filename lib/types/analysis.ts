import type { EnrichedEntity, RawEntity } from './entities';

// Step 1: Extract response
export interface ExtractResult {
  url: string;
  pageTitle: string;
  mainTopic: string;
  mainTopicConfidence: number;
  entities: RawEntity[];
  textParts: {
    title: string;
    description: string;
    headings: { level: number; text: string }[];
    bodyText: string;
    htmlContent: string;
  };
  cached?: boolean;
}

// Step 2: Enrich response (per batch)
export interface EnrichResult {
  enrichedEntities: EnrichedEntity[];
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
  analysis: string;
  chunksExtracted: number;
  chunks?: string[];
}

// Combined full analysis
export interface AnalysisResult {
  url: string;
  pageTitle: string;
  mainTopic: string;
  mainTopicConfidence: number;
  entities: EnrichedEntity[];
  jsonLd: Record<string, unknown>;
  recommendations: Recommendation[];
  topicalSalience: number;
  salienceTips: string[];
  irrelevantEntities: string[];
  fanoutAnalysis?: FanoutResult;
  processingTimeMs: number;
  cached: boolean;
}

export type MainTopicStrategy = 'strict' | 'title' | 'frequent' | 'pattern';

export type AnalysisStep = 'idle' | 'extracting' | 'enriching' | 'generating' | 'fanout' | 'complete' | 'error';
