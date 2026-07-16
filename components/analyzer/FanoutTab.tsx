'use client'

import { Badge } from '@/components/ui/badge'
import type { FanoutResult, QueryCoverageQuestion } from '@/lib/types/analysis'

function coverageClass(coverage: QueryCoverageQuestion['coverage']): string {
  if (coverage === 'covered') return 'bg-green-100 text-green-800'
  if (coverage === 'partial') return 'bg-amber-100 text-amber-800'
  return 'bg-red-100 text-red-800'
}

export function FanoutTab({ fanout }: { fanout: FanoutResult }) {
  if (fanout.error) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
        <p className="font-semibold">AI Query Coverage unavailable</p>
        <p className="mt-1">{fanout.error}</p>
      </div>
    )
  }
  if (!fanout.analysis) {
    return <p className="py-8 text-center text-muted-foreground">No AI Query Coverage analysis was generated.</p>
  }

  const { analysis } = fanout
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <p className="font-semibold">Modeled coverage for {analysis.primaryEntity}</p>
        <p className="mt-1">{analysis.disclosure}</p>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Badge className="bg-green-100 text-green-800">{analysis.summary.covered} covered</Badge>
        <Badge className="bg-amber-100 text-amber-800">{analysis.summary.partial} partial</Badge>
        <Badge className="bg-red-100 text-red-800">{analysis.summary.missing} missing</Badge>
        {fanout.cacheStatus && <Badge variant="outline">{fanout.cacheStatus}</Badge>}
      </div>

      <div className="grid gap-3">
        {analysis.questions.map((item, index) => (
          <div key={item.question} className="rounded-lg border border-[var(--border-gray)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs">{index + 1}</span>
                <div>
                  <p className="text-sm font-medium">{item.question}</p>
                  <p className="mt-1 text-xs text-[var(--muted-text)]">Intent: {item.intent}</p>
                </div>
              </div>
              <Badge className={coverageClass(item.coverage)}>{item.coverage}</Badge>
            </div>
            <p className="mt-3 text-sm text-[var(--muted-text)]">{item.checkedScope}</p>
            {item.evidenceChunkIds.length > 0 && (
              <p className="mt-2 text-xs text-[var(--muted-text)]">Evidence: {item.evidenceChunkIds.join(', ')}</p>
            )}
            {item.gapAction && (
              <p className="mt-2 text-sm"><span className="font-medium">Gap action:</span> {item.gapAction}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
