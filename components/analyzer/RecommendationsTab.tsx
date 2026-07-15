'use client'

import { Badge } from '@/components/ui/badge'
import type { Recommendation } from '@/lib/types/analysis'

export function RecommendationsTab({ recommendations }: { recommendations: Recommendation[] }) {
  if (recommendations.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">No supported recommendations were generated.</p>
  }

  return (
    <ol className="space-y-4">
      {recommendations.map((recommendation, index) => (
        <li key={`${recommendation.dimension}-${recommendation.action}`} className="rounded-lg border border-[var(--border-gray)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
              {index + 1}
            </span>
            <Badge variant="secondary">{recommendation.dimension}</Badge>
            <Badge variant="outline">{recommendation.priority} priority</Badge>
            <Badge variant="outline">{recommendation.effort} effort</Badge>
          </div>
          <p className="mt-3 text-sm font-medium">{recommendation.observation}</p>
          <p className="mt-2 text-sm text-[var(--muted-text)]">{recommendation.action}</p>
          <p className="mt-2 text-xs text-[var(--muted-text)]">
            Evidence: {recommendation.evidence.join(', ')} · {recommendation.confidence} confidence
          </p>
        </li>
      ))}
    </ol>
  )
}
