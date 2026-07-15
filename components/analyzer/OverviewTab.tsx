'use client'

import { AlertTriangle, CheckCircle2, CircleHelp, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { AnalysisResult, ClarityStatus } from '@/lib/types/analysis'

const dimensionLabels = {
  topicFocus: 'Topic Focus',
  entityClarity: 'Entity Clarity',
  semanticCoherence: 'Semantic Coherence',
  answerStructure: 'Answer Structure',
} as const

function StatusIcon({ status }: { status: ClarityStatus }) {
  if (status === 'strong') return <CheckCircle2 className="size-5 text-green-700" aria-hidden="true" />
  if (status === 'mixed') return <AlertTriangle className="size-5 text-amber-700" aria-hidden="true" />
  if (status === 'weak') return <XCircle className="size-5 text-red-700" aria-hidden="true" />
  return <CircleHelp className="size-5 text-slate-600" aria-hidden="true" />
}

export function OverviewTab({ result }: { result: AnalysisResult }) {
  const query = result.fanoutAnalysis?.analysis
  const queryGaps = query?.questions
    .filter((item) => item.coverage !== 'covered' && item.gapAction)
    .sort((a, b) => Number(b.coverage === 'missing') - Number(a.coverage === 'missing'))
    .slice(0, 2) ?? []
  const topActions = [
    ...result.recommendations.slice(0, 1).map((recommendation) => ({
      key: recommendation.action,
      title: recommendation.action,
      detail: recommendation.observation,
      source: 'Clarity',
    })),
    ...queryGaps.map((item) => ({
      key: item.question,
      title: item.gapAction!,
      detail: item.question,
      source: 'AI Query Coverage',
    })),
    ...result.recommendations.slice(1).map((recommendation) => ({
      key: recommendation.action,
      title: recommendation.action,
      detail: recommendation.observation,
      source: 'Clarity',
    })),
  ].slice(0, 3)

  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-text)]">Primary conclusion</p>
        <h3 className="mt-1 text-xl font-semibold">{result.clarity.mainTopic}</h3>
        <p className="mt-1 text-sm text-[var(--muted-text)]">
          Overall clarity is <strong>{result.clarity.overallStatus}</strong> with {Math.round(result.clarity.topicConfidence * 100)}% topic confidence.
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        {Object.entries(result.clarity.dimensions).map(([key, dimension]) => (
          <div key={key} className="rounded-lg border border-[var(--border-gray)] p-4">
            <div className="flex items-center gap-2">
              <StatusIcon status={dimension.status} />
              <h4 className="font-semibold">{dimensionLabels[key as keyof typeof dimensionLabels]}</h4>
              <Badge variant="outline" className="ml-auto">{dimension.status}</Badge>
            </div>
            <p className="mt-2 text-sm text-[var(--muted-text)]">{dimension.summary}</p>
          </div>
        ))}
      </section>

      <section>
        <h3 className="text-sm font-semibold">Top actions</h3>
        {topActions.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--muted-text)]">No evidence-backed priority action was generated.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {topActions.map((action, index) => (
              <li key={action.key} className="flex gap-3 rounded-lg bg-[var(--background-gray)] p-4 text-sm">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">{index + 1}</span>
                <div>
                  <p className="font-medium">{action.title}</p>
                  <p className="mt-1 text-[var(--muted-text)]">{action.detail}</p>
                  <p className="mt-1 text-xs font-medium text-[var(--secondary-content)]">{action.source}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-[var(--border-gray)] p-4 text-sm">
          <p className="font-semibold">Connected schema</p>
          <p className="mt-1 text-[var(--muted-text)]">
            {result.schemaArtifact.pageType.type} · {result.schemaArtifact.status === 'ready' ? 'Ready to review' : result.schemaArtifact.status}
          </p>
        </div>
        {result.fanoutAnalysis && (
          <div className="rounded-lg border border-[var(--border-gray)] p-4 text-sm">
            <p className="font-semibold">AI Query Coverage</p>
            {query ? (
              <p className="mt-1 text-[var(--muted-text)]">{query.summary.covered} covered, {query.summary.partial} partial, {query.summary.missing} missing</p>
            ) : (
              <p className="mt-1 text-[var(--muted-text)]">Unavailable: {result.fanoutAnalysis.error ?? 'No response'}</p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
