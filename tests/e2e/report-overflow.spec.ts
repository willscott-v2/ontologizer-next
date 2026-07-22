// Guard: unbreakable tokens (long URLs, hashes) in report content must never
// widen the report past its container. Regression source: plain-CSS grid
// tracks (1fr / auto) propagate min-content width, and html{overflow-x:hidden}
// plus .si-results{overflow:hidden} clip the result instead of scrolling, so
// cards silently run off the page. Details content only contributes width
// once expanded, so every disclosure is opened before measuring.
import { expect, test, type Page } from '@playwright/test'

const LONG_URL = 'X'.repeat(220)

const textParts = {
  title: 'Technical SEO Audits | Example Agency',
  description: 'Technical SEO audit services.',
  headings: [
    { level: 1, text: 'Technical SEO Audits' },
    { level: 2, text: 'What the audit covers' },
  ],
  body: 'Technical SEO audits identify crawl, indexing, and page structure issues.',
  htmlContent: '<html><head><title>Technical SEO Audits</title></head><body><h1>Technical SEO Audits</h1></body></html>',
}

const dimension = (name: string) => ({
  status: 'mixed',
  summary: `${name} is visible, but one or more prominent page locations need clearer alignment.`,
  evidence: [{ id: `${name}-evidence`, source: 'title', text: `${textParts.title} — evidence sourced from ${LONG_URL}` }],
  checks: [
    { id: `${name}-check-1`, label: `${name} in page title`, status: 'fail', detail: `The page title does not clearly name the main topic. See ${LONG_URL}`, evidenceIds: [`${name}-evidence`] },
    { id: `${name}-check-2`, label: `${name} in H1`, status: 'pass', detail: 'An H1 clearly names the topic.', evidenceIds: [] },
    { id: `${name}-check-3`, label: `${name} in opening content`, status: 'fail', detail: 'The opening does not establish the topic in the first readable section.', evidenceIds: [] },
    { id: `${name}-check-4`, label: `${name} supported by section headings`, status: 'pass', detail: 'A supporting heading reinforces the topic.', evidenceIds: [] },
    { id: `${name}-check-5`, label: `${name} natural repetition`, status: 'pass', detail: 'No excessive exact-phrase repetition was detected.', evidenceIds: [] },
  ],
})

const ENTITIES = Array.from({ length: 20 }, (_, i) => ({
  name: i === 0 ? 'Technical SEO' : `Supporting Entity ${i + 1}`,
  type: i % 3 === 0 ? 'Organization' : 'Concept',
  confidenceScore: 95 - i * 3,
  wikipediaUrl: i < 12 ? `https://en.wikipedia.org/wiki/Search_engine_optimization_entity_${i}` : null,
  wikidataUrl: i === 0 ? LONG_URL : i < 12 ? `https://www.wikidata.org/wiki/Q${180711 + i}` : null,
  googleKgUrl: i < 8 ? `https://www.google.com/search?kgmid=/g/11khcfz0y${i}` : null,
  productOntologyUrl: null,
}))

const RECOMMENDATIONS = [
  {
    observation: `The page title and H1 name the audit, but the opening copy starts with a generic paragraph instead of immediately establishing the topic for readers and AI systems. Reference: ${LONG_URL}`,
    action: 'Rewrite the introduction to state upfront what the page covers, who it is for, and what the reader can expect to learn on this page.',
    evidence: ['topic-title', 'topic-h1-1', 'topic-opening', 'structure-opening'],
    priority: 'high', effort: 'small', confidence: 'high', dimension: 'topicFocus',
  },
  ...Array.from({ length: 5 }, (_, i) => ({
    observation: `Additional observation ${i + 2} about entity coverage and how supporting sections could more clearly connect the named entities for both readers and machines.`,
    action: `Recommended action ${i + 2}: tighten the supporting section so each named entity is introduced in readable text before it appears in structured data.`,
    evidence: ['entity-coverage'],
    priority: 'medium', effort: 'medium', confidence: 'medium', dimension: 'entityClarity',
  })),
]

async function mockAnalysis(page: Page) {
  await page.route('**/api/analyze/extract', (route) => route.fulfill({
    json: {
      textParts,
      mainTopic: 'Technical SEO Audits',
      mainTopicConfidence: 0.9,
      entities: ENTITIES.map((e) => ({ name: e.name, type: e.type })),
      cacheStatus: { fetch: 'fresh', extraction: 'fresh' },
      contentHash: 'a'.repeat(32),
      analysisRunId: '5d8af73e-78b8-4a54-84b9-518ae466488a',
      analysisVersion: '2026-07-15.1',
      fetchMetadata: { source: 'url', finalUrl: 'https://example.com/audit', redirectCount: 0, contentType: 'text/html' },
    },
  }))
  await page.route('**/api/analyze/enrich', (route) => route.fulfill({
    json: {
      enrichedEntities: ENTITIES,
      cacheStatus: { hits: 0, misses: 20 },
      googleKnowledgeGraph: 'ok',
    },
  }))
  await page.route('**/api/analyze/generate', (route) => route.fulfill({
    json: {
      schemaArtifact: {
        jsonLd: {
          '@context': 'https://schema.org',
          '@graph': [{
            '@type': 'WebPage', '@id': 'https://example.com/audit#webpage', name: textParts.title,
            about: ENTITIES.slice(0, 4).map((e) => ({ '@type': e.type, name: e.name, sameAs: [e.wikipediaUrl, e.wikidataUrl, e.googleKgUrl].filter(Boolean) })),
          }],
        },
        pageType: { type: 'Service', confidence: 0.88, evidence: ['Named service language'] },
        status: 'review', errors: [],
        warnings: [{ code: 'existing-schema', message: 'This page already publishes JSON-LD (FAQPage, WebPage, Organization).', action: 'Merge rather than duplicate.' }],
        factsUsed: ['Page title', 'Canonical URL ' + 'X'.repeat(280)],
        factsOmitted: ['5 extracted entities omitted from markup — no external identifiers (Example Phrase One, Example Phrase Two)'],
        existingSchema: { found: true, types: ['FAQPage', 'WebPage', 'Organization'] },
        schemaVersion: 'connected-schema-1', generatedAt: '2026-07-15T12:00:00.000Z',
      },
      recommendations: RECOMMENDATIONS,
      clarity: {
        mainTopic: 'Technical SEO Audits', topicConfidence: 0.9, overallStatus: 'mixed',
        dimensions: {
          topicFocus: dimension('Topic focus'), entityClarity: dimension('Entity clarity'),
          semanticCoherence: dimension('Semantic coherence'), answerStructure: dimension('Answer structure'),
        },
        degradedSteps: [], analysisVersion: '2026-07-15.1',
      },
      recommendationMode: 'deterministic',
    },
  }))
  await page.route('**/api/analyze/log', (route) => route.fulfill({ json: { ok: true } }))
}

async function runAnalysisAndExpandAll(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ontologizer-api-keys', JSON.stringify({ openaiKey: 'test-key', googleKgKey: '', geminiKey: 'test-key' }))
  })
  await mockAnalysis(page)
  await page.goto('/')
  await page.getByLabel('Page URL').fill('https://example.com/audit')
  await page.getByRole('button', { name: 'Analyze page', exact: true }).click()
  await expect(page.getByText('Evidence and diagnostics')).toBeVisible()
  // Open every disclosure, including ones only rendered once a parent opens.
  for (let pass = 0; pass < 3; pass++) {
    await page.evaluate(() => {
      document.querySelectorAll('details:not([open])').forEach((d) => { (d as HTMLDetailsElement).open = true })
    })
  }
  await expect(page.getByText('Why this status').first()).toBeVisible()
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const w = (sel: string) => {
      const el = document.querySelector(sel)
      return el ? Math.round(el.getBoundingClientRect().width) : null
    }
    const results = document.querySelector('.si-results') as HTMLElement
    const resultsRight = results.getBoundingClientRect().right
    const offenders: string[] = []
    results.querySelectorAll<HTMLElement>('*').forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.right > resultsRight + 1 && r.width > 0) {
        offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} right=${Math.round(r.right)}`)
      }
    })
    const li = [...document.querySelectorAll('.schema-facts-grid li')].find((n) => n.textContent?.includes('XXXX'))
    return {
      innerWidth: window.innerWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      resultsClientWidth: results.clientWidth,
      resultsScrollWidth: results.scrollWidth,
      liWidth: li ? Math.round(li.getBoundingClientRect().width) : null,
      liScrollWidth: li ? (li as HTMLElement).scrollWidth : null,
      diagnostics: w('.report-diagnostics'),
      contentArea: w('.content-area'),
      offenders: offenders.slice(0, 8),
    }
  })
}

function assertNoClip(widths: Awaited<ReturnType<typeof measure>>) {
  const context = `offenders: ${widths.offenders.join(' | ') || 'none'}`
  // .si-results has overflow:hidden — any inner overflow is silent clipping.
  expect(widths.resultsScrollWidth, context).toBeLessThanOrEqual(widths.resultsClientWidth + 1)
  // html overflow-x:hidden masks page-level overflow the same way.
  expect(widths.docScrollWidth, context).toBeLessThanOrEqual(widths.innerWidth + 1)
  expect(widths.diagnostics).toBeLessThanOrEqual(widths.contentArea!)
  expect(widths.liScrollWidth).toBeLessThanOrEqual((widths.liWidth ?? 0) + 1)
}

test.use({ viewport: { width: 1326, height: 900 } })

test('expanded report does not clip horizontally at 1326px', async ({ page }) => {
  await runAnalysisAndExpandAll(page)
  assertNoClip(await measure(page))
})

test('expanded report does not clip horizontally at a wide viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 })
  await runAnalysisAndExpandAll(page)
  assertNoClip(await measure(page))
})
