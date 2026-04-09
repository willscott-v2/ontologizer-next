'use client'

import { Badge } from '@/components/ui/badge'
import type { Recommendation } from '@/lib/types/analysis'

interface RecommendationsTabProps {
  recommendations: Recommendation[]
  salienceTips: string[]
  irrelevantEntities: string[]
}

export function RecommendationsTab({
  recommendations,
  salienceTips,
  irrelevantEntities,
}: RecommendationsTabProps) {
  const hasContent =
    salienceTips.length > 0 ||
    irrelevantEntities.length > 0 ||
    recommendations.length > 0

  if (!hasContent) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        No recommendations generated.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {salienceTips.length > 0 && (
        <div className="rounded-lg bg-green-50 p-4 dark:bg-green-950/30">
          <h3 className="mb-2 text-sm font-semibold text-green-800 dark:text-green-300">
            Salience Tips
          </h3>
          <ul className="space-y-1 text-sm text-green-700 dark:text-green-400">
            {salienceTips.map((tip, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0">&#x2022;</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {irrelevantEntities.length > 0 && (
        <div className="rounded-lg bg-orange-50 p-4 dark:bg-orange-950/30">
          <h3 className="mb-2 text-sm font-semibold text-orange-800 dark:text-orange-300">
            Irrelevant Entities
          </h3>
          <p className="text-sm text-orange-700 dark:text-orange-400">
            {irrelevantEntities.join(', ')}
          </p>
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Recommendations</h3>
          <ol className="space-y-3">
            {recommendations.map((rec, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="shrink-0 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
                  {i + 1}
                </span>
                <div>
                  {rec.category && (
                    <Badge variant="secondary" className="mb-1 mr-1 text-xs">
                      {rec.category}
                    </Badge>
                  )}
                  <span>{rec.advice}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
