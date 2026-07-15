'use client'

import type { AnalysisResult } from '@/lib/types/analysis'

const dimensionLabels = {
  topicFocus: 'Topic Focus',
  entityClarity: 'Entity Clarity',
  semanticCoherence: 'Semantic Coherence',
  answerStructure: 'Answer Structure',
} as const

export function OverviewTab({ result }: { result: AnalysisResult }) {
  const query = result.fanoutAnalysis?.analysis
  const queryGaps = query?.questions
    .filter((item) => item.coverage !== 'covered' && item.gapAction)
    .sort((a, b) => Number(b.coverage === 'missing') - Number(a.coverage === 'missing'))
    .slice(0, 2) ?? []
  const topActions = [
    ...result.recommendations.slice(0, 1).map((recommendation) => ({
      key: recommendation.action,
      title: recommendation.action,
      detail: recommendation.observation,
      source: 'Clarity assessment',
    })),
    ...queryGaps.map((item) => ({
      key: item.question,
      title: item.gapAction!,
      detail: item.question,
      source: 'AI Query Coverage',
    })),
    ...result.recommendations.slice(1).map((recommendation) => ({
      key: recommendation.action,
      title: recommendation.action,
      detail: recommendation.observation,
      source: 'Clarity assessment',
    })),
  ].slice(0, 3)

  return (
    <div className="report-overview">
      <section className="report-topic-card" aria-labelledby="report-topic-title">
        <div>
          <p className="report-eyebrow">What this page is about</p>
          <h2 id="report-topic-title">{result.clarity.mainTopic}</h2>
          <p>
            Topic confidence: {Math.round(result.clarity.topicConfidence * 100)}%. Review the supporting evidence before changing the page.
          </p>
        </div>
        <div className={`overall-status status-${result.clarity.overallStatus}`}>
          <span>{result.clarity.overallStatus}</span>
          <small>Overall clarity</small>
        </div>
      </section>

      <section aria-labelledby="clarity-overview-title">
        <div className="report-section-heading">
          <p className="report-eyebrow">Four-part clarity review</p>
          <h2 id="clarity-overview-title">How clearly the page communicates</h2>
        </div>
        <div className="dimension-grid">
          {Object.entries(result.clarity.dimensions).map(([key, dimension]) => (
            <article key={key} className={`dimension-card status-${dimension.status}`}>
              <div className="dimension-card-heading">
                <h3>{dimensionLabels[key as keyof typeof dimensionLabels]}</h3>
                <span>{dimension.status}</span>
              </div>
              <p>{dimension.summary}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="priority-actions-title">
        <div className="report-section-heading report-section-heading-left">
          <p className="report-eyebrow">Start here</p>
          <h2 id="priority-actions-title">Priority actions</h2>
        </div>
        {topActions.length === 0 ? (
          <p className="report-empty">No evidence-backed priority action was generated.</p>
        ) : (
          <ol className="priority-action-list">
            {topActions.map((action, index) => (
              <li key={action.key}>
                <span className="priority-number">{index + 1}</span>
                <div>
                  <h3>{action.title}</h3>
                  <p>{action.detail}</p>
                  <small>{action.source}</small>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="artifact-summary-grid" aria-label="Report artifact summary">
        <div>
          <p className="report-eyebrow">Connected schema</p>
          <h3>{result.schemaArtifact.pageType.type}</h3>
          <p>{result.schemaArtifact.status === 'ready' ? 'Ready to review' : `Status: ${result.schemaArtifact.status}`}</p>
        </div>
        {result.fanoutAnalysis && (
          <div>
            <p className="report-eyebrow">AI Query Coverage</p>
            <h3>{query ? `${query.summary.covered} of ${query.questions.length} covered` : 'Unavailable'}</h3>
            <p>{query ? `${query.summary.partial} partial and ${query.summary.missing} missing` : result.fanoutAnalysis.error ?? 'No response'}</p>
          </div>
        )}
      </section>
    </div>
  )
}
