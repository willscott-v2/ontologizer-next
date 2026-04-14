'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { FanoutResult } from '@/lib/types/analysis'

interface FanoutTabProps {
  fanout: FanoutResult
}

interface ParsedQuery {
  query: string
  coverage: string
  rationale?: string
}

interface ParsedAnalysis {
  primaryEntity: string | null
  queries: ParsedQuery[]
  followUps: string[]
  coverageScore: string
  recommendations: string
  raw: string
}

function coverageBadgeClass(coverage: string): string {
  const c = coverage.toLowerCase()
  if (c === 'yes') return 'bg-green-100 text-green-800'
  if (c === 'partial') return 'bg-yellow-100 text-yellow-800'
  if (c === 'no') return 'bg-red-100 text-red-800'
  return 'bg-muted text-muted-foreground'
}

/**
 * State-machine parser — mirrors the original WordPress plugin's approach.
 * Walks section-by-section, treating `•`, `-`, `*`, `1.` etc. as bullets.
 */
function parseAnalysis(text: string): ParsedAnalysis {
  const result: ParsedAnalysis = {
    primaryEntity: null,
    queries: [],
    followUps: [],
    coverageScore: '',
    recommendations: '',
    raw: text,
  }

  let section: 'primary' | 'fanout' | 'followup' | 'coverage' | 'recommendations' | '' = ''

  const stripMarkdown = (s: string) =>
    s.replace(/^\*+|\*+$/g, '').replace(/^#+\s*/, '').trim()

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    // Section headers — tolerate markdown bold (**PRIMARY ENTITY:**), #, numbering
    const headerLine = stripMarkdown(line).replace(/^\d+\.\s*/, '')

    const primaryMatch = headerLine.match(/^PRIMARY\s+ENTITY:\s*(.*)$/i)
    if (primaryMatch) {
      section = 'primary'
      if (primaryMatch[1].trim()) result.primaryEntity = primaryMatch[1].trim()
      continue
    }
    if (/^FAN-?OUT\s+QUERIES:?/i.test(headerLine)) {
      section = 'fanout'
      continue
    }
    if (/^FOLLOW[-\s]?UP(\s+POTENTIAL|\s+QUESTIONS)?:?/i.test(headerLine)) {
      section = 'followup'
      continue
    }
    const covMatch = headerLine.match(/^COVERAGE\s+SCORE:\s*(.*)$/i)
    if (covMatch) {
      section = 'coverage'
      result.coverageScore = covMatch[1].trim()
      continue
    }
    const recMatch = headerLine.match(/^(?:RECOMMENDATIONS?|OPTIMIZATION[S]?):\s*(.*)$/i)
    if (recMatch) {
      section = 'recommendations'
      if (recMatch[1].trim()) result.recommendations = recMatch[1].trim()
      continue
    }

    // Bulleted list items: •, -, *, or numbered (1. …)
    const bulletMatch = line.match(/^\s*(?:[\u2022\u2023\u25E6•\-*]|\d+\.)\s+(.*)$/)
    if (bulletMatch) {
      const item = stripMarkdown(bulletMatch[1].trim())
      if (section === 'fanout') {
        // Try to extract "query - Coverage: value - Why: rationale" or variations
        let queryText = item
        let coverage = 'Unknown'
        let rationale: string | undefined

        // Full pattern with rationale
        const fullMatch = item.match(
          /^(.+?)\s*[-\u2013\u2014]\s*Coverage:\s*(Yes|Partial|No)\b\s*[-\u2013\u2014]\s*Why:\s*(.+)$/i,
        )
        if (fullMatch) {
          queryText = fullMatch[1].trim().replace(/[?:.]+$/, '?')
          coverage = fullMatch[2]
          rationale = fullMatch[3].trim()
        } else {
          // Pattern: "query - Coverage: value" (no rationale)
          const coverageMatch =
            item.match(/^(.+?)\s*[-\u2013\u2014]\s*Coverage:\s*(Yes|Partial|No)\b.*$/i) ||
            item.match(/^(.+?)\s*\[(Yes|Partial|No)\].*$/i) ||
            item.match(/^(.+?)\s*[-\u2013\u2014]\s*(Yes|Partial|No)\b.*$/i)

          if (coverageMatch) {
            queryText = coverageMatch[1].trim().replace(/[?:.]+$/, '?')
            coverage = coverageMatch[2]
            // Look for a trailing "Why: ..." even if Coverage match was simpler
            const whyMatch = item.match(/Why:\s*(.+)$/i)
            if (whyMatch) rationale = whyMatch[1].trim()
          }
        }
        result.queries.push({ query: queryText, coverage, rationale })
      } else if (section === 'followup') {
        result.followUps.push(item)
      } else if (section === 'recommendations') {
        result.recommendations += (result.recommendations ? ' ' : '') + item
      }
      continue
    }

    // Continuation lines inside primary or recommendations
    if (section === 'primary' && !result.primaryEntity) {
      result.primaryEntity = line
    } else if (section === 'recommendations') {
      result.recommendations += (result.recommendations ? ' ' : '') + line
    }
  }

  return result
}

export function FanoutTab({ fanout }: FanoutTabProps) {
  const parsed = parseAnalysis(fanout.analysis ?? '')
  const hasParsedContent =
    !!parsed.primaryEntity ||
    parsed.queries.length > 0 ||
    parsed.followUps.length > 0 ||
    parsed.recommendations.length > 0 ||
    !!parsed.coverageScore

  const coveragePct = (() => {
    const m = parsed.coverageScore.match(/(\d+)\s*\/\s*(\d+)/)
    if (!m) return null
    const covered = parseInt(m[1], 10)
    const total = parseInt(m[2], 10)
    if (!total) return null
    return Math.round((covered / total) * 100)
  })()

  if (fanout.error) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <div className="font-semibold">Fan-out unavailable</div>
          <div className="mt-1">{fanout.error}</div>
        </div>
        {fanout.chunksExtracted > 0 && (
          <p className="text-sm text-muted-foreground">
            Extracted {fanout.chunksExtracted} semantic chunk
            {fanout.chunksExtracted !== 1 ? 's' : ''} from the page — Gemini
            never returned an analysis.
          </p>
        )}
      </div>
    )
  }

  if (!fanout.analysis) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        No fan-out analysis was generated.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Extracted {fanout.chunksExtracted} semantic chunk
        {fanout.chunksExtracted !== 1 ? 's' : ''}
      </p>

      {!hasParsedContent ? (
        <pre className="overflow-auto rounded-lg bg-muted p-4 text-xs leading-relaxed font-mono whitespace-pre-wrap text-foreground">
          {fanout.analysis}
        </pre>
      ) : (
        <>
          {parsed.primaryEntity && (
            <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
              <CardHeader className="pb-0">
                <CardTitle className="text-sm text-blue-800 dark:text-blue-300">
                  Primary Entity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-lg font-semibold text-blue-900 dark:text-blue-200">
                  {parsed.primaryEntity}
                </span>
              </CardContent>
            </Card>
          )}

          {parsed.queries.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">
                Predicted Fan-out Queries
              </h3>
              <p className="text-xs text-muted-foreground">
                How Google&apos;s AI might decompose user queries about this
                content.
              </p>
              <div className="grid gap-2">
                {parsed.queries.map((q, i) => (
                  <div key={i} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2 text-sm min-w-0">
                        <span className="mt-0.5 shrink-0 flex size-5 items-center justify-center rounded-full bg-muted text-xs font-medium">
                          {i + 1}
                        </span>
                        <span className="font-medium">{q.query}</span>
                      </div>
                      <span
                        className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${coverageBadgeClass(q.coverage)}`}
                      >
                        {q.coverage}
                      </span>
                    </div>
                    {q.rationale && (
                      <p className="mt-1.5 ml-7 text-xs leading-relaxed text-muted-foreground">
                        {q.rationale}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {parsed.coverageScore && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Coverage Analysis</h3>
              <div className="rounded-lg border p-3 flex items-center gap-3 text-sm">
                {coveragePct !== null && (
                  <span
                    className="inline-flex size-12 items-center justify-center rounded-full border-2 font-bold tabular-nums shrink-0"
                    style={{
                      borderColor:
                        coveragePct >= 80
                          ? '#16a34a'
                          : coveragePct >= 60
                            ? '#ca8a04'
                            : coveragePct >= 40
                              ? '#ea580c'
                              : '#dc2626',
                      color:
                        coveragePct >= 80
                          ? '#16a34a'
                          : coveragePct >= 60
                            ? '#ca8a04'
                            : coveragePct >= 40
                              ? '#ea580c'
                              : '#dc2626',
                    }}
                  >
                    {coveragePct}%
                  </span>
                )}
                <span>{parsed.coverageScore}</span>
              </div>
            </div>
          )}

          {parsed.followUps.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Follow-up Potential</h3>
              <p className="text-xs text-muted-foreground">
                Questions users might ask after reading this content.
              </p>
              <ul className="space-y-1 text-sm">
                {parsed.followUps.map((item, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0 text-muted-foreground">
                      &#x2022;
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {parsed.recommendations && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Optimization Recommendations</h3>
              <p className="text-sm leading-relaxed text-foreground">
                {parsed.recommendations}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
