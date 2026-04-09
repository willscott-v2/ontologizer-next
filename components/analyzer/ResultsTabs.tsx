'use client'

import { Clock, Database } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { SalienceScore } from './SalienceScore'
import { EntitiesTab } from './EntitiesTab'
import { JsonLdTab } from './JsonLdTab'
import { RecommendationsTab } from './RecommendationsTab'
import { FanoutTab } from './FanoutTab'
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
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg bg-muted/50 p-3 text-sm">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="size-3.5" />
          <span>{formatMs(result.processingTimeMs)}</span>
        </div>

        <div className="text-muted-foreground">
          {result.entities.length} entit{result.entities.length === 1 ? 'y' : 'ies'}
        </div>

        {result.topicalSalience.score > 0 && (
          <SalienceScore
            score={result.topicalSalience.score}
            mainTopic={result.topicalSalience.mainTopic}
          />
        )}

        {result.cached && (
          <div className="flex items-center gap-1.5">
            <Database className="size-3.5 text-muted-foreground" />
            <Badge variant="secondary" className="text-xs">
              Cached
            </Badge>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="entities">
        <TabsList>
          <TabsTrigger value="entities">
            Entities ({result.entities.length})
          </TabsTrigger>
          <TabsTrigger value="jsonld">JSON-LD</TabsTrigger>
          <TabsTrigger value="recommendations">
            Recommendations
          </TabsTrigger>
          {hasFanout && (
            <TabsTrigger value="fanout">Fan-out</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="entities" className="mt-4">
          <EntitiesTab entities={result.entities} />
        </TabsContent>

        <TabsContent value="jsonld" className="mt-4">
          <JsonLdTab jsonLd={result.jsonLd} />
        </TabsContent>

        <TabsContent value="recommendations" className="mt-4">
          <RecommendationsTab
            recommendations={result.recommendations}
            salienceTips={result.salienceTips}
            irrelevantEntities={result.irrelevantEntities}
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
