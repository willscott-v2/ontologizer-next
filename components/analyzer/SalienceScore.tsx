'use client'

interface SalienceScoreProps {
  score: number
  mainTopic: string
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600 dark:text-green-400'
  if (score >= 60) return 'text-yellow-600 dark:text-yellow-400'
  if (score >= 40) return 'text-orange-600 dark:text-orange-400'
  return 'text-red-600 dark:text-red-400'
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent'
  if (score >= 60) return 'Good'
  if (score >= 40) return 'Moderate'
  return 'Limited'
}

export function SalienceScore({ score, mainTopic }: SalienceScoreProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-center">
        <div className={`text-2xl font-bold tabular-nums ${getScoreColor(score)}`}>
          {score}
        </div>
        <div className="text-xs text-muted-foreground">{getScoreLabel(score)}</div>
      </div>
      <div className="text-sm text-muted-foreground">
        Topic: <span className="font-medium text-foreground">{mainTopic}</span>
      </div>
    </div>
  )
}
