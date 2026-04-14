'use client'

interface SalienceScoreProps {
  score: number
  mainTopic: string
}

function getScoreStyles(score: number): { color: string; bg: string; label: string } {
  if (score >= 80) return { color: '#166534', bg: '#dcfce7', label: 'Excellent' }
  if (score >= 60) return { color: '#854d0e', bg: '#fef9c3', label: 'Good' }
  if (score >= 40) return { color: '#9a3412', bg: '#ffedd5', label: 'Moderate' }
  return { color: '#991b1b', bg: '#fee2e2', label: 'Limited' }
}

export function SalienceScore({ score, mainTopic }: SalienceScoreProps) {
  const { color, bg, label } = getScoreStyles(score)
  return (
    <div className="flex items-center gap-4">
      <div
        className="flex flex-col items-center justify-center rounded-xl px-4 py-2 tabular-nums shrink-0"
        style={{ background: bg, color, minWidth: 88 }}
      >
        <div className="text-3xl font-extrabold leading-none">{score}</div>
        <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider">
          {label}
        </div>
      </div>
      {mainTopic && (
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted-text)]">
            Main Topic
          </div>
          <div className="text-base font-semibold text-[var(--content-text)] truncate">
            {mainTopic}
          </div>
        </div>
      )}
    </div>
  )
}
