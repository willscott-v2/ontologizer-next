'use client'

import { Badge } from '@/components/ui/badge'
import type { ClarityAssessment, ClarityStatus } from '@/lib/types/analysis'

const labels = {
  topicFocus: 'Topic Focus',
  entityClarity: 'Entity Clarity',
  semanticCoherence: 'Semantic Coherence',
  answerStructure: 'Answer Structure',
} as const

function statusClass(status: ClarityStatus): string {
  if (status === 'strong') return 'bg-green-100 text-green-800'
  if (status === 'mixed') return 'bg-amber-100 text-amber-800'
  if (status === 'weak') return 'bg-red-100 text-red-800'
  return 'bg-slate-100 text-slate-700'
}

export function ClaritySummary({ clarity }: { clarity: ClarityAssessment }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        {Object.entries(clarity.dimensions).map(([key, dimension]) => (
          <div key={key} className="rounded-lg border border-[var(--border-gray)] p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold text-[var(--content-text)]">
                {labels[key as keyof typeof labels]}
              </h3>
              <Badge className={statusClass(dimension.status)}>{dimension.status}</Badge>
            </div>
            <p className="mt-2 text-sm text-[var(--muted-text)]">{dimension.summary}</p>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-medium">Why this status</summary>
              <ul className="mt-2 space-y-2">
                {dimension.checks.map((check) => (
                  <li key={check.id} className="rounded-md bg-[var(--background-gray)] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{check.label}</span>
                      <span className="text-xs uppercase text-[var(--muted-text)]">{check.status}</span>
                    </div>
                    <p className="mt-1 text-[var(--muted-text)]">{check.detail}</p>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        ))}
      </div>

      {clarity.degradedSteps.length > 0 && (
        <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Analysis notes</p>
          <ul className="mt-1 list-disc pl-5">
            {clarity.degradedSteps.map((step) => <li key={step}>{step}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
