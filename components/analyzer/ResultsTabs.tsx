'use client'

import { Clock, Database } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { ClaritySummary } from './ClaritySummary'
import { EntitiesTab } from './EntitiesTab'
import { JsonLdTab } from './JsonLdTab'
import { RecommendationsTab } from './RecommendationsTab'
import { FanoutTab } from './FanoutTab'
import { OverviewTab } from './OverviewTab'
import type { AnalysisResult } from '@/lib/types/analysis'

interface ResultsTabsProps {
  result: AnalysisResult
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function ResultsTabs({ result }: ResultsTabsProps) {
  const hasFanout = !!result.fanoutAnalysis

  return (
    <div className="space-y-5">
      {/* Stats + salience bar */}
      <div className="rounded-xl border border-[var(--border-gray)] bg-[var(--background-gray)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-text)]">
              AI Content Clarity: {result.clarity.overallStatus}
            </div>
            <div className="text-base font-semibold text-[var(--content-text)]">
              {result.clarity.mainTopic}
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm text-[var(--muted-text)]">
            <div className="flex items-center gap-1.5">
              <Clock className="size-3.5" />
              <span>{formatMs(result.processingTimeMs)}</span>
            </div>
            <div>
              {result.entities.length} entit
              {result.entities.length === 1 ? 'y' : 'ies'}
            </div>
            {(result.provenance.fetch === 'cached' || result.provenance.extraction === 'cached') && (
              <div className="flex items-center gap-1.5">
                <Database className="size-3.5" />
                <Badge variant="secondary" className="text-xs">
                  Cached
                </Badge>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="clarity">Clarity details</TabsTrigger>
          <TabsTrigger value="entities">
            Entities ({result.entities.length})
          </TabsTrigger>
          <TabsTrigger value="jsonld">Schema ({result.schemaArtifact.status})</TabsTrigger>
          <TabsTrigger value="recommendations">
            Recommendations
          </TabsTrigger>
          {hasFanout && (
            <TabsTrigger value="fanout">AI Query Coverage</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab result={result} />
        </TabsContent>

        <TabsContent value="clarity" className="mt-4">
          <ClaritySummary clarity={result.clarity} />
        </TabsContent>

        <TabsContent value="entities" className="mt-4">
          <EntitiesTab entities={result.entities} />
        </TabsContent>

        <TabsContent value="jsonld" className="mt-4">
          <div className="mb-3 rounded-lg bg-[var(--background-gray)] p-3 text-sm">
            <span className="font-medium">{result.schemaArtifact.pageType.type}</span>
            {' '}· {Math.round(result.schemaArtifact.pageType.confidence * 100)}% type confidence
            {' '}· {result.schemaArtifact.status === 'ready' ? 'Ready to review' : result.schemaArtifact.status}
          </div>
          {[...result.schemaArtifact.errors, ...result.schemaArtifact.warnings].length > 0 && (
            <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="font-semibold">Review before implementation</p>
              <ul className="mt-2 list-disc space-y-2 pl-5">
                {[...result.schemaArtifact.errors, ...result.schemaArtifact.warnings].map((issue) => (
                  <li key={`${issue.code}-${issue.nodeId ?? ''}-${issue.property ?? ''}`}>
                    {issue.message} {issue.action}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <JsonLdTab
            jsonLd={result.schemaArtifact.jsonLd}
            schemaStatus={result.schemaArtifact.status}
          />
          <p className="mt-3 text-xs text-[var(--muted-text)]">
            This artifact has passed Ontologizer&apos;s internal checks only. After review, paste it into the{' '}
            <a className="font-medium text-[var(--si-navy)] underline" href="https://validator.schema.org/" target="_blank" rel="noopener noreferrer">Schema.org Validator</a>
            {' '}and, for supported rich-result types, Google&apos;s{' '}
            <a className="font-medium text-[var(--si-navy)] underline" href="https://search.google.com/test/rich-results" target="_blank" rel="noopener noreferrer">Rich Results Test</a>.
          </p>
        </TabsContent>

        <TabsContent value="recommendations" className="mt-4">
          <RecommendationsTab
            recommendations={result.recommendations}
          />
        </TabsContent>

        {hasFanout && result.fanoutAnalysis && (
          <TabsContent value="fanout" className="mt-4">
            <FanoutTab fanout={result.fanoutAnalysis} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
