'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { FanoutResult } from '@/lib/types/analysis'

interface FanoutTabProps {
  fanout: FanoutResult
}

interface ParsedQuery {
  number: number
  query: string
  coverage: 'Yes' | 'Partial' | 'No' | string
}

interface ParsedAnalysis {
  primaryEntity: string | null
  queries: ParsedQuery[]
  followUps: string[]
  recommendations: string[]
  raw: string
}

function coverageBadgeClass(coverage: string): string {
  const c = coverage.toLowerCase()
  if (c === 'yes') return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
  if (c === 'partial') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300'
  if (c === 'no') return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
  return 'bg-muted text-muted-foreground'
}

function parseAnalysis(text: string): ParsedAnalysis {
  const result: ParsedAnalysis = {
    primaryEntity: null,
    queries: [],
    followUps: [],
    recommendations: [],
    raw: text,
  }

  const lines = text.split('\n')

  for (const line of lines) {
    // Primary entity
    const primaryMatch = line.match(/PRIMARY\s+ENTITY:\s*(.+)/i)
    if (primaryMatch) {
      result.primaryEntity = primaryMatch[1].trim()
      continue
    }

    // Numbered queries with coverage indicators
    const queryMatch = line.match(
      /^\s*(\d+)\.\s+(.+?)\s*[-\u2013\u2014]\s*(?:Coverage:\s*)?(Yes|Partial|No)\b/i
    )
    if (queryMatch) {
      result.queries.push({
        number: parseInt(queryMatch[1]),
        query: queryMatch[2].trim(),
        coverage: queryMatch[3],
      })
      continue
    }

    // Alternative format: numbered queries with [Yes/Partial/No] bracket notation
    const bracketMatch = line.match(
      /^\s*(\d+)\.\s+(.+?)\s*\[(Yes|Partial|No)\]/i
    )
    if (bracketMatch) {
      result.queries.push({
        number: parseInt(bracketMatch[1]),
        query: bracketMatch[2].trim(),
        coverage: bracketMatch[3],
      })
      continue
    }
  }

  // Extract follow-up section
  const followUpMatch = text.match(
    /FOLLOW[- ]?UP[S]?[:\s]*\n([\s\S]*?)(?=\n(?:RECOMMEND|OPTIM|$))/i
  )
  if (followUpMatch) {
    const items = followUpMatch[1]
      .split('\n')
      .map((l) => l.replace(/^\s*[-\u2022*]\s*/, '').trim())
      .filter((l) => l.length > 0)
    result.followUps = items
  }

  // Extract recommendations section
  const recsMatch = text.match(
    /(?:RECOMMEND|OPTIM)[A-Z]*[:\s]*\n([\s\S]*?)$/i
  )
  if (recsMatch) {
    const items = recsMatch[1]
      .split('\n')
      .map((l) => l.replace(/^\s*[-\u2022*\d.]+\s*/, '').trim())
      .filter((l) => l.length > 0)
    result.recommendations = items
  }

  return result
}

export function FanoutTab({ fanout }: FanoutTabProps) {
  const parsed = parseAnalysis(fanout.analysis ?? '')
  const hasParsedContent =
    parsed.primaryEntity ||
    parsed.queries.length > 0 ||
    parsed.followUps.length > 0 ||
    parsed.recommendations.length > 0

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Extracted {fanout.chunksExtracted} semantic chunk
        {fanout.chunksExtracted !== 1 ? 's' : ''}
      </p>

      {!hasParsedContent ? (
        <pre className="overflow-auto rounded-lg bg-muted p-4 text-xs leading-relaxed font-mono whitespace-pre-wrap">
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
              <h3 className="text-sm font-semibold">Query Decomposition</h3>
              <div className="grid gap-2">
                {parsed.queries.map((q) => (
                  <div
                    key={q.number}
                    className="flex items-center justify-between gap-2 rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <span className="shrink-0 flex size-5 items-center justify-center rounded-full bg-muted text-xs font-medium">
                        {q.number}
                      </span>
                      <span>{q.query}</span>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${coverageBadgeClass(q.coverage)}`}
                    >
                      {q.coverage}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {parsed.followUps.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Follow-up Queries</h3>
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

          {parsed.recommendations.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Recommendations</h3>
              <ul className="space-y-1 text-sm">
                {parsed.recommendations.map((item, i) => (
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
        </>
      )}
    </div>
  )
}
