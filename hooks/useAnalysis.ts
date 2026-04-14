'use client'

import { useState, useCallback, useRef } from 'react'
import type {
  AnalysisStep,
  AnalysisResult,
  AnalyzeParams,
  ExtractResult,
  EnrichResult,
  GenerateResult,
  FanoutResult,
} from '@/lib/types/analysis'
import type { EnrichedEntity, RawEntity } from '@/lib/types/entities'

const ENRICH_BATCH_SIZE = 5

interface EnrichProgress {
  current: number
  total: number
}

async function postJson<T>(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string>
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    let message: string
    try {
      const json = JSON.parse(text)
      message = json.error || json.message || text
    } catch {
      message = text
    }
    throw new Error(message || `Request failed with status ${res.status}`)
  }
  return res.json() as Promise<T>
}

function batchArray<T>(arr: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    batches.push(arr.slice(i, i + size))
  }
  return batches
}

export function useAnalysis() {
  const [step, setStep] = useState<AnalysisStep>('idle')
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enrichProgress, setEnrichProgress] = useState<EnrichProgress>({
    current: 0,
    total: 0,
  })

  // Track partial results so we can preserve them on error
  const partialRef = useRef<Partial<AnalysisResult>>({})

  const reset = useCallback(() => {
    setStep('idle')
    setResult(null)
    setError(null)
    setEnrichProgress({ current: 0, total: 0 })
    partialRef.current = {}
  }, [])

  const analyze = useCallback(
    async (params: AnalyzeParams, apiHeaders: Record<string, string>) => {
      const startTime = Date.now()
      setStep('extracting')
      setError(null)
      setResult(null)
      partialRef.current = {}

      let extractResult: ExtractResult
      let enrichedEntities: EnrichedEntity[] = []
      let generateResult: GenerateResult | null = null
      let fanoutResult: FanoutResult | undefined

      // Step 1: Extract
      try {
        extractResult = await postJson<ExtractResult>(
          '/api/analyze/extract',
          {
            url: params.url,
            pasteContent: params.pasteContent,
            mainTopicStrategy: params.mainTopicStrategy,
            clearCache: params.clearCache,
          },
          apiHeaders
        )
      } catch (err) {
        setStep('error')
        setError(
          err instanceof Error ? err.message : 'Entity extraction failed'
        )
        return
      }

      // Step 2: Enrich entities in batches
      try {
        const batches = batchArray<RawEntity>(
          extractResult.entities,
          ENRICH_BATCH_SIZE
        )
        setStep('enriching')
        setEnrichProgress({ current: 0, total: batches.length })

        for (let i = 0; i < batches.length; i++) {
          const batchResult = await postJson<EnrichResult>(
            '/api/analyze/enrich',
            {
              entities: batches[i],
              mainTopic: extractResult.mainTopic,
              htmlContent: extractResult.textParts.htmlContent,
            },
            apiHeaders
          )
          enrichedEntities = [
            ...enrichedEntities,
            ...batchResult.enrichedEntities,
          ]
          setEnrichProgress({ current: i + 1, total: batches.length })
        }

        partialRef.current.entities = enrichedEntities
      } catch (err) {
        setStep('error')
        setError(
          err instanceof Error ? err.message : 'Entity enrichment failed'
        )
        // Preserve partial entities
        if (enrichedEntities.length > 0) {
          setResult({
            entities: enrichedEntities,
            jsonLd: {},
            recommendations: [],
            topicalSalience: { score: 0, mainTopic: extractResult.mainTopic },
            salienceTips: [],
            irrelevantEntities: [],
            processingTimeMs: Date.now() - startTime,
            cached: extractResult.cached ?? false,
          })
        }
        return
      }

      // Step 3: Generate JSON-LD + recommendations (skip if fanoutOnly)
      if (!params.fanoutOnly) {
        try {
          setStep('generating')
          generateResult = await postJson<GenerateResult>(
            '/api/analyze/generate',
            {
              enrichedEntities,
              textParts: extractResult.textParts,
              mainTopic: extractResult.mainTopic,
              url: params.url,
            },
            apiHeaders
          )
          partialRef.current = {
            ...partialRef.current,
            jsonLd: generateResult.jsonLd,
            recommendations: generateResult.recommendations,
            topicalSalience: { score: generateResult.topicalSalience, mainTopic: extractResult.mainTopic },
            salienceTips: generateResult.salienceTips,
            irrelevantEntities: generateResult.irrelevantEntities,
          }
        } catch (err) {
          setStep('error')
          setError(
            err instanceof Error
              ? err.message
              : 'Schema generation failed'
          )
          // Preserve partial results
          setResult({
            entities: enrichedEntities,
            jsonLd: {},
            recommendations: [],
            topicalSalience: { score: 0, mainTopic: extractResult.mainTopic },
            salienceTips: [],
            irrelevantEntities: [],
            processingTimeMs: Date.now() - startTime,
            cached: extractResult.cached ?? false,
          })
          return
        }
      }

      // Step 4: Fan-out analysis (optional)
      if (params.runFanout) {
        try {
          setStep('fanout')
          fanoutResult = await postJson<FanoutResult>(
            '/api/analyze/fanout',
            {
              htmlContent: extractResult.textParts.htmlContent,
              url: params.url,
            },
            apiHeaders
          )
        } catch (err) {
          // Fan-out is optional - don't fail the whole analysis
          console.warn('Fan-out analysis failed:', err)
        }
      }

      // Combine results
      const processingTimeMs = Date.now() - startTime
      const combined: AnalysisResult = {
        entities: enrichedEntities,
        jsonLd: generateResult?.jsonLd ?? {},
        recommendations: generateResult?.recommendations ?? [],
        topicalSalience: {
          score: generateResult?.topicalSalience ?? 0,
          mainTopic: extractResult.mainTopic,
        },
        salienceTips: generateResult?.salienceTips ?? [],
        irrelevantEntities: generateResult?.irrelevantEntities ?? [],
        fanoutAnalysis: fanoutResult,
        processingTimeMs,
        cached: extractResult.cached ?? false,
      }

      setResult(combined)
      setStep('complete')
    },
    []
  )

  return { step, result, error, enrichProgress, analyze, reset }
}
