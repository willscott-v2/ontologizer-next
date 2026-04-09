'use client'

import { Check, ChevronRight } from 'lucide-react'
import type { AnalysisStep } from '@/lib/types/analysis'

interface ProgressIndicatorProps {
  step: AnalysisStep
  enrichProgress: { current: number; total: number }
}

interface StepDef {
  key: AnalysisStep
  label: string
}

const STEPS: StepDef[] = [
  { key: 'extracting', label: 'Extract' },
  { key: 'enriching', label: 'Enrich' },
  { key: 'generating', label: 'Generate' },
  { key: 'fanout', label: 'Fan-out' },
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
}: ProgressIndicatorProps) {
  const currentIndex = getStepIndex(step)

  return (
    <div className="flex items-center gap-1 py-4">
      {STEPS.map((s, i) => {
        const stepIndex = getStepIndex(s.key)
        const isActive = step === s.key
        const isComplete = currentIndex > stepIndex
        const isFuture = currentIndex < stepIndex

        let label = s.label
        if (s.key === 'enriching' && isActive && enrichProgress.total > 0) {
          label = `Enrich (${enrichProgress.current}/${enrichProgress.total})`
        }

        return (
          <div key={s.key} className="flex items-center gap-1">
            {i > 0 && (
              <ChevronRight
                className={`size-4 shrink-0 ${
                  isComplete ? 'text-green-500' : 'text-muted-foreground/40'
                }`}
              />
            )}
            <div
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                  : isComplete
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                    : isFuture
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-muted text-muted-foreground'
              }`}
            >
              {isComplete && <Check className="size-3.5" />}
              {isActive && (
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-blue-500" />
                </span>
              )}
              {label}
            </div>
          </div>
        )
      })}
    </div>
  )
}
