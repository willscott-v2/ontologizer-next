'use client'

import type { Recommendation } from '@/lib/types/analysis'

export function RecommendationsTab({ recommendations }: { recommendations: Recommendation[] }) {
  if (recommendations.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">No supported recommendations were generated.</p>
  }

  return (
    <ol className="recommendation-list">
      {recommendations.map((recommendation, index) => (
        <li key={`${recommendation.dimension}-${recommendation.action}`}>
          <span className="recommendation-number">{String(index + 1).padStart(2, '0')}</span>
          <div>
            <p className="recommendation-meta">
              {recommendation.dimension} · {recommendation.priority} priority · {recommendation.effort} effort
            </p>
            <p className="recommendation-observation">{recommendation.observation}</p>
            <p className="recommendation-action">{recommendation.action}</p>
            <p className="recommendation-evidence">
              Evidence: {recommendation.evidence.join(', ')} · {recommendation.confidence} confidence
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
