'use client'

import { Clock, Database, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ClaritySummary } from './ClaritySummary'
import { EntitiesTab } from './EntitiesTab'
import { JsonLdTab } from './JsonLdTab'
import { RecommendationsTab } from './RecommendationsTab'
import { FanoutTab } from './FanoutTab'
import { OverviewTab } from './OverviewTab'
import type { AnalysisResult } from '@/lib/types/analysis'

interface ResultsTabsProps {
  result: AnalysisResult
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function ResultsTabs({ result }: ResultsTabsProps) {
  const issues = [...result.schemaArtifact.errors, ...result.schemaArtifact.warnings]
  const query = result.fanoutAnalysis?.analysis

  return (
    <div className="report-flow">
      <div className="report-meta-bar">
        <div>
          <span>AI Content Clarity: {result.clarity.overallStatus}</span>
          <strong>{result.clarity.mainTopic}</strong>
        </div>
        <div className="report-meta-items">
          <span><Clock className="size-4" /> {formatMs(result.processingTimeMs)}</span>
          <span>{result.entities.length} {result.entities.length === 1 ? 'entity' : 'entities'}</span>
          {typeof result.apiCostUsd === 'number' && (
            <span>${result.apiCostUsd.toFixed(4)} API cost</span>
          )}
          {(result.provenance.fetch === 'cached' || result.provenance.extraction === 'cached') && (
            <span><Database className="size-4" /> Cached source data</span>
          )}
        </div>
      </div>

      <OverviewTab result={result} />

      {result.fanoutAnalysis && (
        <section className="report-section-card" aria-labelledby="query-coverage-title">
          <div className="report-section-heading report-section-heading-left">
            <p className="report-eyebrow">Modeled questions, not observed search data</p>
            <h2 id="query-coverage-title">AI Query Coverage</h2>
            <p>
              {query
                ? `${query.summary.covered} covered, ${query.summary.partial} partial, and ${query.summary.missing} missing across ${query.questions.length} modeled questions.`
                : 'Query Coverage was requested but was unavailable for this run.'}
            </p>
          </div>
          <details className="report-disclosure">
            <summary>Review modeled questions and evidence</summary>
            <div className="report-disclosure-content">
              <FanoutTab fanout={result.fanoutAnalysis} />
            </div>
          </details>
        </section>
      )}

      <section className="report-section-card schema-review" aria-labelledby="schema-review-title">
        <div className="schema-review-heading">
          <div>
            <p className="report-eyebrow">
              {result.schemaArtifact.existingSchema?.found
                ? 'Recommended update to existing schema'
                : 'Implementation artifact'}
            </p>
            <h2 id="schema-review-title">Connected JSON-LD</h2>
            <p>
              {result.schemaArtifact.pageType.type} with {Math.round(result.schemaArtifact.pageType.confidence * 100)}% page-type confidence.
              {result.schemaArtifact.existingSchema?.found && (
                <>
                  {' '}This page already publishes JSON-LD
                  {result.schemaArtifact.existingSchema.types.length > 0 &&
                    ` (${result.schemaArtifact.existingSchema.types.join(', ')})`}
                  , so treat the artifact below as an update to that markup, not a second schema block.
                </>
              )}
            </p>
          </div>
          <Badge className={`schema-status schema-status-${result.schemaArtifact.status}`}>
            {result.schemaArtifact.existingSchema?.found
              ? 'Recommended update'
              : result.schemaArtifact.status === 'ready'
                ? 'Ready to review'
                : result.schemaArtifact.status}
          </Badge>
        </div>

        {issues.length > 0 && (
          <div className="schema-issues">
            <h3>Review before implementation</h3>
            <ul>
              {issues.map((issue) => (
                <li key={`${issue.code}-${issue.nodeId ?? ''}-${issue.property ?? ''}`}>
                  {issue.message} {issue.action}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="schema-facts-grid">
          <div>
            <h3>Facts used</h3>
            {result.schemaArtifact.factsUsed.length > 0 ? (
              <ul>{result.schemaArtifact.factsUsed.map((fact) => <li key={fact}>{fact}</li>)}</ul>
            ) : <p>No supported facts were available.</p>}
          </div>
          <div>
            <h3>Facts omitted</h3>
            {result.schemaArtifact.factsOmitted.length > 0 ? (
              <ul>{result.schemaArtifact.factsOmitted.map((fact) => <li key={fact}>{fact}</li>)}</ul>
            ) : <p>No material omissions were recorded.</p>}
          </div>
        </div>

        <JsonLdTab
          jsonLd={result.schemaArtifact.jsonLd}
          schemaStatus={result.schemaArtifact.status}
        />

        <p className="validator-note">
          Ontologizer runs internal checks only. After review, validate the artifact with{' '}
          <a href="https://validator.schema.org/" target="_blank" rel="noopener noreferrer">
            Schema.org Validator <ExternalLink className="size-3.5" />
          </a>{' '}
          and, for supported types, Google&apos;s{' '}
          <a href="https://search.google.com/test/rich-results" target="_blank" rel="noopener noreferrer">
            Rich Results Test <ExternalLink className="size-3.5" />
          </a>.
        </p>
      </section>

      <section className="report-diagnostics" aria-labelledby="report-diagnostics-title">
        <div className="report-section-heading report-section-heading-left">
          <p className="report-eyebrow">Supporting detail</p>
          <h2 id="report-diagnostics-title">Evidence and diagnostics</h2>
          <p>Open only the sections you need for review or implementation.</p>
        </div>

        <details className="report-disclosure">
          <summary>Clarity checks and page evidence</summary>
          <div className="report-disclosure-content"><ClaritySummary clarity={result.clarity} /></div>
        </details>
        <details className="report-disclosure">
          <summary>All recommendations ({result.recommendations.length})</summary>
          <div className="report-disclosure-content"><RecommendationsTab recommendations={result.recommendations} /></div>
        </details>
        <details className="report-disclosure">
          <summary>Resolved entities ({result.entities.length})</summary>
          <div className="report-disclosure-content"><EntitiesTab entities={result.entities} /></div>
        </details>
      </section>
    </div>
  )
}
