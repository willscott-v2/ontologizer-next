'use client'

import { useCallback, useState } from 'react'
import { Download, AlertCircle, RotateCcw, Check, FileJson2, ListChecks, ScanSearch } from 'lucide-react'
import { useAnalysis } from '@/hooks/useAnalysis'
import { useApiKeys } from '@/hooks/useApiKeys'
import { useAuth } from '@/hooks/useAuth'
import { AnalyzerForm } from '@/components/analyzer/AnalyzerForm'
import { ProgressIndicator } from '@/components/analyzer/ProgressIndicator'
import { ResultsTabs } from '@/components/analyzer/ResultsTabs'
import { Button } from '@/components/ui/button'
import type { AnalyzeParams, AnalysisResult } from '@/lib/types/analysis'
import { generateMarkdownReport } from '@/lib/artifacts/markdown-report'
import { trackEvent } from '@/lib/analytics/events'

function downloadMarkdown(result: AnalysisResult) {
  const md = generateMarkdownReport(result)
  const blob = new Blob([md], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ontologizer-report-${Date.now()}.md`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  trackEvent('markdown_exported', {
    clarity_status: result.clarity.overallStatus,
    schema_status: result.schemaArtifact.status,
    query_coverage_included: Boolean(result.fanoutAnalysis),
  })
}

export default function Home() {
  const { step, result, error, enrichProgress, analyze, reset } = useAnalysis()
  const { apiHeaders, hasAnyKey, loaded: keysLoaded } = useApiKeys()
  const { user, loading: authLoading } = useAuth()
  const [lastSubmission, setLastSubmission] = useState<AnalyzeParams | null>(null)

  const isAnalyzing =
    step === 'extracting' ||
    step === 'enriching' ||
    step === 'generating' ||
    step === 'fanout'

  const handleSubmit = useCallback(
    (params: AnalyzeParams) => {
      setLastSubmission(params)
      analyze(params, apiHeaders)
    },
    [analyze, apiHeaders]
  )

  const handleNewAnalysis = useCallback(() => {
    reset()
    setLastSubmission(null)
  }, [reset])

  const handleRetry = useCallback(() => {
    if (lastSubmission) analyze(lastSubmission, apiHeaders)
  }, [analyze, apiHeaders, lastSubmission])

  const sourceLabel = lastSubmission?.mode === 'url'
    ? lastSubmission.url
    : lastSubmission
      ? 'Pasted page content'
      : undefined

  return (
    <div className="home-page">
      {!result ? (
        <>
          <section className="home-hero" aria-labelledby="home-title">
            <div className="si-container hero-grid">
              <div className="hero-copy">
                <p className="hero-eyebrow">Free AI content clarity + schema analyzer</p>
                <h1 id="home-title">See what your page tells search and AI systems.</h1>
                <p className="hero-lede">
                  Review topic focus, entity clarity, semantic coherence, answer structure, and connected JSON-LD in one evidence-backed report.
                </p>
                <ul className="hero-proof-list">
                  <li><Check aria-hidden="true" /> Four clear findings, not an unexplained score</li>
                  <li><Check aria-hidden="true" /> Three prioritized actions tied to page evidence</li>
                  <li><Check aria-hidden="true" /> Reviewable schema and an ungated Markdown report</li>
                </ul>
              </div>

              <div className="analyzer-card" id="analyzer">
                <div className="analyzer-card-heading">
                  <div>
                    <p>One page at a time</p>
                    <h2>{isAnalyzing ? 'Analysis in progress' : 'Run your free analysis'}</h2>
                  </div>
                  {!isAnalyzing && <span>URL or pasted content</span>}
                </div>

                {isAnalyzing ? (
                  <ProgressIndicator
                    step={step}
                    enrichProgress={enrichProgress}
                    includeQueryCoverage={Boolean(lastSubmission?.runFanout)}
                    sourceLabel={sourceLabel}
                  />
                ) : (
                  <AnalyzerForm
                    onSubmit={handleSubmit}
                    isAnalyzing={isAnalyzing}
                    hasApiKeys={hasAnyKey}
                    isSignedIn={Boolean(user)}
                    isEligibilityLoading={!keysLoaded || authLoading}
                  />
                )}

                {step === 'error' && error && (
                  <QuotaOrErrorCard error={error} onRetry={handleRetry} />
                )}
              </div>
            </div>
          </section>

          <section className="how-it-works" id="how-it-works" aria-labelledby="how-it-works-title">
            <div className="si-container">
              <div className="how-it-works-heading">
                <p className="report-eyebrow">One page, one prioritized report</p>
                <h2 id="how-it-works-title">From page content to a reviewable action plan</h2>
              </div>
              <div className="how-it-works-grid">
                <article>
                  <ScanSearch aria-hidden="true" />
                  <span>1</span>
                  <h3>Read the page</h3>
                  <p>Identify the main topic, important entities, headings, and answer patterns.</p>
                </article>
                <article>
                  <ListChecks aria-hidden="true" />
                  <span>2</span>
                  <h3>Assess clarity</h3>
                  <p>Separate topic focus, entity identity, coherence, and answer structure.</p>
                </article>
                <article>
                  <FileJson2 aria-hidden="true" />
                  <span>3</span>
                  <h3>Review the artifact</h3>
                  <p>Work through three actions, then inspect the connected JSON-LD before use.</p>
                </article>
              </div>
              <FaqSection />
            </div>
          </section>
        </>
      ) : (
        <section className="results-section">
          <div className="si-container">
            <button type="button" onClick={handleNewAnalysis} className="back-btn">
              <RotateCcw className="size-4" /> Analyze another page
            </button>
            <div className="si-results">
              <div className="results-header">
                <div>
                  <p>Ontologizer report</p>
                  <h1>AI Content Clarity Report</h1>
                  <span>{result.source.url ?? 'Pasted page content'} · {new Date(result.analyzedAt).toLocaleDateString()}</span>
                </div>
                <div className="results-actions">
                  <Button variant="secondary" onClick={() => downloadMarkdown(result)}>
                    <Download className="size-4" /> Download Markdown
                  </Button>
                  <Button variant="outline" onClick={handleNewAnalysis}>
                    <RotateCcw className="size-4" /> New analysis
                  </Button>
                </div>
              </div>
              <div className="content-area">
                <ResultsTabs result={result} />
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

function QuotaOrErrorCard({ error, onRetry }: { error: string; onRetry?: () => void }) {
  const isQuota = /free tier limit|5\/month/i.test(error)
  if (!isQuota) {
    return (
      <div className="si-error analyzer-error">
        <AlertCircle className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="font-semibold">Analysis failed</p>
          <p className="mt-1 text-sm opacity-90">{error}</p>
          {onRetry && (
            <button type="button" onClick={onRetry} className="retry-btn">
              Try this analysis again
            </button>
          )}
        </div>
      </div>
    )
  }

  const nextReset = new Date()
  nextReset.setMonth(nextReset.getMonth() + 1, 1)
  nextReset.setHours(0, 0, 0, 0)
  const resetLabel = nextReset.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="rounded-xl border-2 border-[var(--orange-accent)] bg-[var(--si-slate)] p-6 text-white shadow-lg">
      <div className="flex items-start gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--orange-accent)] text-[var(--si-dark-navy)]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-6"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-extrabold leading-tight">
            Free tier limit reached
          </h3>
          <p className="mt-2 text-white/90">
            You&apos;ve used all 5 free analyses for this month. Your quota
            resets on <strong>{resetLabel}</strong>.
          </p>
          <p className="mt-3 text-sm text-white/75">
            Keep going by adding your own API keys. They are stored in your
            browser, forwarded for the requested provider calls, and not
            counted against the free tier.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href="/settings"
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--orange-accent)] px-5 py-2.5 text-sm font-extrabold uppercase tracking-wide text-[var(--si-dark-navy)] transition hover:bg-[var(--orange-light)]"
            >
              Add your API keys
            </a>
            <a
              href="https://github.com/willscott-v2/ontologizer-next"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-white/30 px-5 py-2.5 text-sm font-semibold text-white/90 transition hover:bg-white/10"
            >
              Self-host on GitHub
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

function FaqSection() {
  const faqs: { q: string; a: React.ReactNode }[] = [
    {
      q: 'Why is it called The Ontologizer?',
      a: (
        <>
          An <strong>ontology</strong> is a shared vocabulary for describing
          the things in a subject area and how they relate —{' '}
          <em>Person</em>, <em>Organization</em>, <em>Product</em>,{' '}
          <em>author</em>, <em>offers</em>, and so on.{' '}
          <a
            href="https://schema.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            Schema.org
          </a>{' '}
          is the biggest ontology on the web: a vocabulary Google, Microsoft,
          Yahoo, and Yandex agreed to so a machine reading your page can tell
          that &ldquo;Apple&rdquo; means the company and not the fruit, and
          that a review belongs to a specific product.
          <br />
          <br />
          Ontologizer turns your unstructured page content <em>into</em>{' '}
          ontology-friendly structured data. It finds entities, resolves
          them against Wikipedia, Wikidata, and Google&apos;s Knowledge Graph,
          and builds JSON-LD aligned with supported schema.org types. The report
          shows the facts it used, what it omitted, and what needs review.
        </>
      ),
    },
    {
      q: 'What is entity-based SEO and why does it matter?',
      a: (
        <>
          Search systems use more than keywords. They can also map
          content to <strong>entities</strong> (people, places, products,
          concepts) and their relationships. Ontologizer shows which entities
          it could support with page context and external identifiers, plus
          which matches need human review.
        </>
      ),
    },
    {
      q: 'How is this different from a regular schema generator?',
      a: (
        <>
          Most schema tools ask you to fill out a form and spit out JSON-LD
          from the fields you typed in. Ontologizer reads your actual page,
          resolves entities against Wikipedia, Wikidata, and Google&apos;s
          Knowledge Graph API, and uses those <em>sameAs</em> references to
          build schema that ties your content to external identifiers search
          engines already trust.
        </>
      ),
    },
    {
      q: 'What is AI Query Coverage and should I use it?',
      a: (
        <>
          AI Query Coverage models five to eight adjacent questions a person
          might ask about the page topic. It then checks those questions
          against supplied page chunks and cites the supporting chunk IDs.
          These are modeled questions, not actual Google searches or Search
          Console data.
        </>
      ),
    },
    {
      q: 'Does adding JSON-LD actually help with AI-powered search?',
      a: (
        <>
          Structured data can reduce ambiguity, but it is not a ranking
          guarantee. It works only when the markup matches visible page facts.
          Pair JSON-LD with clear on-page naming and supporting content, then
          review it in Schema.org Validator and Google Rich Results Test.
        </>
      ),
    },
    {
      q: 'What do you do with my data?',
      a: (
        <>
          We log analysis lifecycle data, including the URL, completion
          status, provider usage, and cost, to operate and improve the tool.
          If you&apos;re signed in, runs are logged against your account, and
          Search Influence may follow up with people who might want help
          shipping their findings. If you&apos;re using your own API keys
          without an account, runs are logged without an account identifier.
          <br />
          <br />
          Your API keys are stored in your browser, sent through the analysis
          routes for the requested provider call, and not persisted by the
          application. If you do not want a follow-up, use the Feedback button
          to tell us.
        </>
      ),
    },
    {
      q: 'What should I do with the recommendations?',
      a: (
        <>
          Start with the three actions in the Overview. Each action includes
          an observation, page evidence, effort, and confidence. Review the
          detailed checks before changing copy or publishing schema. If you
          want implementation help,{' '}
          <a
            href="https://www.searchinfluence.com/contact/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Search Influence can help you ship it
          </a>
          .
        </>
      ),
    },
  ]

  return (
    <section className="faq-section">
      <div className="faq-heading">
        <p className="report-eyebrow">Questions before you run a page</p>
        <h2>
        SEO &amp; AI-Search FAQ
        </h2>
      </div>
      <div className="faq-list">
        {faqs.map((faq, i) => (
          <details
            key={i}
            className="faq-item group"
          >
            <summary>
              <span>{faq.q}</span>
              <span className="faq-plus">
                +
              </span>
            </summary>
            <div className="faq-answer">
              {faq.a}
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}
