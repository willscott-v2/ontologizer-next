'use client'

import { useCallback } from 'react'
import { Download, AlertCircle, RotateCcw } from 'lucide-react'
import { Toaster } from 'sonner'
import { useAnalysis } from '@/hooks/useAnalysis'
import { useApiKeys } from '@/hooks/useApiKeys'
import { AnalyzerForm } from '@/components/analyzer/AnalyzerForm'
import { ProgressIndicator } from '@/components/analyzer/ProgressIndicator'
import { ResultsTabs } from '@/components/analyzer/ResultsTabs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AnalyzeParams, AnalysisResult } from '@/lib/types/analysis'

function generateMarkdown(result: AnalysisResult): string {
  const lines: string[] = []

  lines.push('# Ontologizer Analysis Report')
  lines.push('')
  lines.push(`**Processing Time:** ${result.processingTimeMs}ms`)
  lines.push(
    `**Main Topic:** ${result.topicalSalience.mainTopic || 'N/A'}`
  )
  lines.push(
    `**Salience Score:** ${result.topicalSalience.score}`
  )
  lines.push(`**Cached:** ${result.cached ? 'Yes' : 'No'}`)
  lines.push('')

  // Entities table
  if (result.entities.length > 0) {
    lines.push('## Entities')
    lines.push('')
    lines.push('| Name | Type | Confidence | Wikipedia | Wikidata |')
    lines.push('|------|------|-----------|-----------|----------|')
    for (const e of result.entities) {
      lines.push(
        `| ${e.name} | ${e.type} | ${e.confidenceScore}% | ${e.wikipediaUrl || '-'} | ${e.wikidataUrl || '-'} |`
      )
    }
    lines.push('')
  }

  // JSON-LD
  if (Object.keys(result.jsonLd).length > 0) {
    lines.push('## JSON-LD')
    lines.push('')
    lines.push('```json')
    lines.push(JSON.stringify(result.jsonLd, null, 2))
    lines.push('```')
    lines.push('')
  }

  // Recommendations
  if (result.recommendations.length > 0) {
    lines.push('## Recommendations')
    lines.push('')
    for (let i = 0; i < result.recommendations.length; i++) {
      const rec = result.recommendations[i]
      const prefix = rec.category ? `**[${rec.category}]** ` : ''
      lines.push(`${i + 1}. ${prefix}${rec.advice}`)
    }
    lines.push('')
  }

  // Salience tips
  if (result.salienceTips.length > 0) {
    lines.push('## Salience Tips')
    lines.push('')
    for (const tip of result.salienceTips) {
      lines.push(`- ${tip}`)
    }
    lines.push('')
  }

  // Fan-out
  if (result.fanoutAnalysis) {
    lines.push('## Fan-out Analysis')
    lines.push('')
    lines.push(result.fanoutAnalysis.analysis ?? '')
    lines.push('')
  }

  return lines.join('\n')
}

function downloadMarkdown(result: AnalysisResult) {
  const md = generateMarkdown(result)
  const blob = new Blob([md], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ontologizer-report-${Date.now()}.md`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function Home() {
  const { step, result, error, enrichProgress, analyze, reset } =
    useAnalysis()
  const { apiHeaders } = useApiKeys()

  const isAnalyzing =
    step === 'extracting' ||
    step === 'enriching' ||
    step === 'generating' ||
    step === 'fanout'

  const handleSubmit = useCallback(
    (params: AnalyzeParams) => {
      analyze(params, apiHeaders)
    },
    [analyze, apiHeaders]
  )

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <Toaster position="top-right" />

      <header>
        <h1 className="text-2xl font-bold tracking-tight">Ontologizer</h1>
        <p className="text-sm text-muted-foreground">
          Extract entities, generate JSON-LD schema, and get SEO recommendations
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Analyze a page</CardTitle>
        </CardHeader>
        <CardContent>
          <AnalyzerForm onSubmit={handleSubmit} isAnalyzing={isAnalyzing} />
        </CardContent>
      </Card>

      {/* Progress indicator */}
      {isAnalyzing && (
        <ProgressIndicator step={step} enrichProgress={enrichProgress} />
      )}

      {/* Error state */}
      {step === 'error' && error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400" />
          <div>
            <p className="font-medium text-red-800 dark:text-red-300">
              Analysis failed
            </p>
            <p className="mt-1 text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Results</h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadMarkdown(result)}
              >
                <Download className="size-3.5" />
                Download as Markdown
              </Button>
              <Button variant="outline" size="sm" onClick={reset}>
                <RotateCcw className="size-3.5" />
                New analysis
              </Button>
            </div>
          </div>
          <ResultsTabs result={result} />
        </div>
      )}
    </div>
  )
}
