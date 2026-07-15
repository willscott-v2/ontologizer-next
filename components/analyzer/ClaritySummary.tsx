'use client'

import type { ClarityAssessment, ClarityStatus } from '@/lib/types/analysis'

const labels = {
  topicFocus: 'Topic Focus',
  entityClarity: 'Entity Clarity',
  semanticCoherence: 'Semantic Coherence',
  answerStructure: 'Answer Structure',
} as const

function statusClass(status: ClarityStatus): string {
  if (status === 'strong') return 'status-strong'
  if (status === 'mixed') return 'status-mixed'
  if (status === 'weak') return 'status-weak'
  return 'status-unavailable'
}

export function ClaritySummary({ clarity }: { clarity: ClarityAssessment }) {
  return (
    <div className="clarity-detail">
      <div className="clarity-detail-grid">
        {Object.entries(clarity.dimensions).map(([key, dimension]) => (
          <section key={key} className="clarity-detail-section">
            <div className="clarity-detail-heading">
              <h3>
                {labels[key as keyof typeof labels]}
              </h3>
              <span className={statusClass(dimension.status)}>{dimension.status}</span>
            </div>
            <p>{dimension.summary}</p>
            <details className="clarity-checks">
              <summary>Why this status</summary>
              <ul>
                {dimension.checks.map((check) => (
                  <li key={check.id}>
                    <div>
                      <strong>{check.label}</strong>
                      <span>{check.status}</span>
                    </div>
                    <p>{check.detail}</p>
                  </li>
                ))}
              </ul>
            </details>
          </section>
        ))}
      </div>

      {clarity.degradedSteps.length > 0 && (
        <div className="clarity-notes">
          <p>Analysis notes</p>
          <ul>
            {clarity.degradedSteps.map((step) => <li key={step}>{step}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
