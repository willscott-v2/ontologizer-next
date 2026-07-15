'use client'

import { Check, Loader2 } from 'lucide-react'
import type { AnalysisStep } from '@/lib/types/analysis'

interface ProgressIndicatorProps {
  step: AnalysisStep
  enrichProgress: { current: number; total: number }
  includeQueryCoverage?: boolean
  sourceLabel?: string
}

interface StepDef {
  key: AnalysisStep
  label: string
}

const STEPS: StepDef[] = [
  { key: 'extracting', label: 'Read the page and identify its main topic' },
  { key: 'enriching', label: 'Resolve important entities and references' },
  { key: 'generating', label: 'Assess clarity and build connected schema' },
  { key: 'fanout', label: 'Model adjacent questions and coverage' },
]

const STEP_ORDER: AnalysisStep[] = [
  'extracting',
  'enriching',
  'generating',
  'fanout',
  'complete',
]

function getStepIndex(step: AnalysisStep): number {
  return STEP_ORDER.indexOf(step)
}

export function ProgressIndicator({
  step,
  enrichProgress,
  includeQueryCoverage = false,
  sourceLabel,
}: ProgressIndicatorProps) {
  const currentIndex = getStepIndex(step)
  const visibleSteps = includeQueryCoverage
    ? STEPS
    : STEPS.filter((item) => item.key !== 'fanout')

  return (
    <div className="analysis-progress" role="status" aria-live="polite">
      <div className="analysis-progress-heading">
        <Loader2 className="size-6 animate-spin" aria-hidden="true" />
        <div>
          <h3>Building your clarity report</h3>
          {sourceLabel && <p>{sourceLabel}</p>}
        </div>
      </div>

      <ol className="analysis-progress-list">
        {visibleSteps.map((item) => {
          const stepIndex = getStepIndex(item.key)
          const isActive = step === item.key
          const isComplete = currentIndex > stepIndex
          const isFuture = currentIndex < stepIndex
          let label = item.label

          if (item.key === 'enriching' && isActive && enrichProgress.total > 0) {
            label = `${item.label} (${enrichProgress.current}/${enrichProgress.total})`
          }

          return (
            <li
              key={item.key}
              className={`analysis-progress-step ${isActive ? 'active' : ''} ${isComplete ? 'complete' : ''} ${isFuture ? 'future' : ''}`}
            >
              <span className="analysis-progress-marker">
                {isComplete ? (
                  <Check className="size-4" />
                ) : isActive ? (
                  <span className="progress-pulse" />
                ) : null}
              </span>
              <span>{label}</span>
            </li>
          )
        })}
      </ol>

      <p className="analysis-progress-note">
        Keep this tab open while the report is assembled.
      </p>
    </div>
  )
}
