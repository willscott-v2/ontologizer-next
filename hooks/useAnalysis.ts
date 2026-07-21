'use client'

import { useState, useCallback } from 'react'
import type {
  AnalysisStep,
  AnalysisResult,
  AnalyzeParams,
  ExtractResult,
  EnrichResult,
  GenerateResult,
  FanoutResult,
} from '@/lib/types/analysis'
import { trackEvent } from '@/lib/analytics/events'

interface EnrichProgress {
  current: number
  total: number
}

async function postJson<T>(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string>
): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const text = await response.text()
    try {
      const parsed = JSON.parse(text) as { error?: string; message?: string }
      throw new Error(parsed.error || parsed.message || text)
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(text || `Request failed with status ${response.status}`)
      }
      throw error
    }
  }
  return response.json() as Promise<T>
}

export function useAnalysis() {
  const [step, setStep] = useState<AnalysisStep>('idle')
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enrichProgress, setEnrichProgress] = useState<EnrichProgress>({
    current: 0,
    total: 0,
  })

  const reset = useCallback(() => {
    setStep('idle')
    setResult(null)
    setError(null)
    setEnrichProgress({ current: 0, total: 0 })
  }, [])

  const finalizeRun = useCallback((payload: Record<string, unknown>) => {
    fetch('/api/analyze/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {})
  }, [])

  const analyze = useCallback(
    async (params: AnalyzeParams, apiHeaders: Record<string, string>) => {
      const startTime = Date.now()
      setStep('extracting')
      setError(null)
      setResult(null)
      trackEvent('analysis_started', {
        input_mode: params.mode,
        query_coverage_requested: params.runFanout,
        key_mode: Object.keys(apiHeaders).length > 0 ? 'byok' : 'free_tier',
      })

      let extractResult: ExtractResult
      try {
        extractResult = await postJson<ExtractResult>(
          '/api/analyze/extract',
          {
            url: params.mode === 'url' ? params.url : undefined,
            pasteContent: params.mode === 'paste' ? params.pasteContent : undefined,
            pasteFormat: params.pasteFormat,
            mainTopicOverride: params.mainTopicOverride || undefined,
            clearCache: params.clearCache,
            runQueryCoverage: params.runFanout,
          },
          apiHeaders
        )
      } catch (extractError) {
        const message = extractError instanceof Error
          ? extractError.message
          : 'Entity extraction failed'
        setStep('error')
        setError(message)
        trackEvent('analysis_failed', { failure_step: 'extract' })
        return
      }

      let enrichedEntities: EnrichResult['enrichedEntities'] = []
      let enrichmentStatus: EnrichResult['cacheStatus'] = { hits: 0, misses: 0 }
      try {
        setStep('enriching')
        setEnrichProgress({ current: 0, total: 1 })
        const enriched = await postJson<EnrichResult>(
          '/api/analyze/enrich',
          {
            entities: extractResult.entities,
            mainTopic: extractResult.mainTopic,
            htmlContent: extractResult.textParts.htmlContent,
            contentHash: extractResult.contentHash,
            analysisRunId: extractResult.analysisRunId,
          },
          apiHeaders
        )
        enrichedEntities = enriched.enrichedEntities
        enrichmentStatus = enriched.cacheStatus
        setEnrichProgress({ current: 1, total: 1 })
      } catch (enrichError) {
        const message = enrichError instanceof Error
          ? enrichError.message
          : 'Entity enrichment failed'
        setStep('error')
        setError(message)
        trackEvent('analysis_failed', { failure_step: 'enrich' })
        finalizeRun({
          analysisRunId: extractResult.analysisRunId,
          status: 'failed',
          entitiesFound: enrichedEntities.length,
          processingTimeMs: Date.now() - startTime,
          errorStep: 'enrich',
          errorMessage: message,
        })
        return
      }

      let generated: GenerateResult
      try {
        setStep('generating')
        generated = await postJson<GenerateResult>(
          '/api/analyze/generate',
          {
            enrichedEntities,
            textParts: extractResult.textParts,
            mainTopic: extractResult.mainTopic,
            topicConfidence: extractResult.mainTopicConfidence,
            url: params.mode === 'url' ? params.url : '',
            contentHash: extractResult.contentHash,
            analysisRunId: extractResult.analysisRunId,
          },
          apiHeaders
        )
      } catch (generateError) {
        const message = generateError instanceof Error
          ? generateError.message
          : 'Schema generation failed'
        setStep('error')
        setError(message)
        trackEvent('analysis_failed', { failure_step: 'generate' })
        finalizeRun({
          analysisRunId: extractResult.analysisRunId,
          status: 'failed',
          entitiesFound: enrichedEntities.length,
          processingTimeMs: Date.now() - startTime,
          errorStep: 'generate',
          errorMessage: message,
        })
        return
      }

      let fanoutResult: FanoutResult | undefined
      if (params.runFanout) {
        try {
          setStep('fanout')
          fanoutResult = await postJson<FanoutResult>(
            '/api/analyze/fanout',
            {
              htmlContent: extractResult.textParts.htmlContent,
              url: params.mode === 'url' ? params.url : undefined,
              contentHash: extractResult.contentHash,
              clearCache: params.clearCache,
              analysisRunId: extractResult.analysisRunId,
            },
            apiHeaders
          )
          if (fanoutResult.error) trackEvent('query_coverage_unavailable')
        } catch (fanoutError) {
          fanoutResult = {
            analysis: null,
            chunksExtracted: 0,
            chunks: [],
            error: fanoutError instanceof Error
              ? fanoutError.message
              : 'AI Query Coverage was unavailable.',
          }
          trackEvent('query_coverage_unavailable')
        }
      }

      const processingTimeMs = Date.now() - startTime
      const apiCostUsd =
        (extractResult.usage?.costUsd ?? extractResult.costUsd ?? 0) +
        (generated.usage?.costUsd ?? 0) +
        (fanoutResult?.usage?.costUsd ?? 0)
      const combined: AnalysisResult = {
        entities: enrichedEntities,
        schemaArtifact: generated.schemaArtifact,
        recommendations: generated.recommendations,
        clarity: generated.clarity,
        fanoutAnalysis: fanoutResult,
        processingTimeMs,
        apiCostUsd,
        source: {
          mode: params.mode,
          url: params.mode === 'url' ? params.url : undefined,
        },
        analyzedAt: new Date().toISOString(),
        provenance: {
          fetch: extractResult.cacheStatus.fetch,
          extraction: extractResult.cacheStatus.extraction,
          enrichment: enrichmentStatus,
          recommendations: generated.recommendationMode,
        },
      }

      setResult(combined)
      setStep('complete')
      trackEvent('analysis_completed', {
        clarity_status: generated.clarity.overallStatus,
        schema_status: generated.schemaArtifact.status,
        recommendation_mode: generated.recommendationMode,
        query_coverage_requested: params.runFanout,
      })
      if (params.runFanout && fanoutResult?.analysis) {
        trackEvent('query_coverage_completed', {
          covered: fanoutResult.analysis.summary.covered,
          partial: fanoutResult.analysis.summary.partial,
          missing: fanoutResult.analysis.summary.missing,
        })
      }
      finalizeRun({
        analysisRunId: extractResult.analysisRunId,
        status: 'complete',
        entitiesFound: enrichedEntities.length,
        processingTimeMs,
      })
    },
    [finalizeRun]
  )

  return { step, result, error, enrichProgress, analyze, reset }
}
