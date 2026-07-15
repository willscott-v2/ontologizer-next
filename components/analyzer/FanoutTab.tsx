'use client'

import type { FanoutResult, QueryCoverageQuestion } from '@/lib/types/analysis'

function coverageClass(coverage: QueryCoverageQuestion['coverage']): string {
  if (coverage === 'covered') return 'query-coverage-covered'
  if (coverage === 'partial') return 'query-coverage-partial'
  return 'query-coverage-missing'
}

export function FanoutTab({ fanout }: { fanout: FanoutResult }) {
  if (fanout.error) {
    return (
      <div className="query-error">
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
    <div className="query-detail">
      <div className="query-disclosure-note">
        <p className="font-semibold">Modeled coverage for {analysis.primaryEntity}</p>
        <p className="mt-1">{analysis.disclosure}</p>
      </div>

      <p className="query-summary-line">
        <span className="query-coverage-covered">{analysis.summary.covered} covered</span>
        <span className="query-coverage-partial">{analysis.summary.partial} partial</span>
        <span className="query-coverage-missing">{analysis.summary.missing} missing</span>
        {fanout.cacheStatus && <span>{fanout.cacheStatus}</span>}
      </p>

      <ol className="query-question-list">
        {analysis.questions.map((item, index) => (
          <li key={item.question}>
            <span className="query-number">{String(index + 1).padStart(2, '0')}</span>
            <div>
              <div className="query-question-heading">
                <p>{item.question}</p>
                <span className={coverageClass(item.coverage)}>{item.coverage}</span>
              </div>
              <p className="query-intent">Intent: {item.intent}</p>
              <p className="query-scope">{item.checkedScope}</p>
              {item.evidenceChunkIds.length > 0 && (
                <p className="query-evidence">Evidence: {item.evidenceChunkIds.join(', ')}</p>
              )}
              {item.gapAction && (
                <p className="query-gap"><strong>Gap action:</strong> {item.gapAction}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
