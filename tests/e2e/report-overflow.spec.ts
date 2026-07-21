// Guard: unbreakable tokens (long URLs, hashes) in report content must never
// widen the report past its container. Regression source: plain-CSS grid
// tracks (1fr / auto) propagate min-content width, and html{overflow-x:hidden}
// clips the result instead of scrolling, so cards silently run off the page.
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
  ],
})

async function mockAnalysis(page: Page) {
  await page.route('**/api/analyze/extract', (route) => route.fulfill({
    json: {
      textParts,
      mainTopic: 'Technical SEO Audits',
      mainTopicConfidence: 0.9,
      entities: [{ name: 'Technical SEO', type: 'Concept' }],
      cacheStatus: { fetch: 'fresh', extraction: 'fresh' },
      contentHash: 'a'.repeat(32),
      analysisRunId: '5d8af73e-78b8-4a54-84b9-518ae466488a',
      analysisVersion: '2026-07-15.1',
      fetchMetadata: { source: 'url', finalUrl: 'https://example.com/audit', redirectCount: 0, contentType: 'text/html' },
    },
  }))
  await page.route('**/api/analyze/enrich', (route) => route.fulfill({
    json: {
      enrichedEntities: [{
        name: 'Technical SEO', type: 'Concept', confidenceScore: 92,
        wikipediaUrl: 'https://en.wikipedia.org/wiki/Search_engine_optimization',
        wikidataUrl: LONG_URL, googleKgUrl: null, productOntologyUrl: null,
      }],
      cacheStatus: { hits: 0, misses: 1 },
      googleKnowledgeGraph: 'not_configured',
    },
  }))
  await page.route('**/api/analyze/generate', (route) => route.fulfill({
    json: {
      schemaArtifact: {
        jsonLd: { '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage', '@id': 'https://example.com/audit#webpage', name: textParts.title }] },
        pageType: { type: 'Service', confidence: 0.88, evidence: ['Named service language'] },
        status: 'ready', errors: [], warnings: [], factsUsed: ['Page title', 'Canonical URL ' + 'X'.repeat(280)], factsOmitted: [],
        schemaVersion: 'connected-schema-1', generatedAt: '2026-07-15T12:00:00.000Z',
      },
      recommendations: [{
        observation: 'The opening does not explain who the audit is for.', evidence: ['topic-opening'],
        action: 'Add one sentence naming the audience.',
        priority: 'high', effort: 'small', confidence: 'high', dimension: 'topicFocus',
      }],
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

test.use({ viewport: { width: 1326, height: 900 } })

test('diagnostics section does not overflow the page horizontally', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ontologizer-api-keys', JSON.stringify({ openaiKey: 'test-key', googleKgKey: '', geminiKey: 'test-key' }))
  })
  await mockAnalysis(page)
  await page.goto('/')
  await page.getByLabel('Page URL').fill('https://example.com/audit')
  await page.getByRole('button', { name: 'Analyze page', exact: true }).click()
  await expect(page.getByText('Evidence and diagnostics')).toBeVisible()
  await page.getByText('Clarity checks and page evidence').click()
  await expect(page.getByText('Why this status').first()).toBeVisible()
  await page.getByText('Why this status').first().click()

  const widths = await page.evaluate(() => {
    const w = (sel: string) => {
      const el = document.querySelector(sel)
      return el ? Math.round(el.getBoundingClientRect().width) : null
    }
    const li = [...document.querySelectorAll('.schema-facts-grid li')].find((n) => n.textContent?.includes('XXXX'))
    const liStyle = li ? getComputedStyle(li) : null
    return {
      liWrap: liStyle ? `${liStyle.overflowWrap}/${liStyle.wordBreak}/${liStyle.whiteSpace}` : null,
      liWidth: li ? Math.round(li.getBoundingClientRect().width) : null,
      liScrollWidth: li ? (li as HTMLElement).scrollWidth : null,
      bodyWrap: getComputedStyle(document.body).overflowWrap,
      flowCols: getComputedStyle(document.querySelector('.report-flow')!).gridTemplateColumns,
      innerWidth: window.innerWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      diagnostics: w('.report-diagnostics'),
      disclosureContent: w('.report-disclosure-content'),
      contentArea: w('.content-area'),
      reportFlow: w('.report-flow'),
    }
  })
  console.log('WIDTHS', JSON.stringify(widths))
  await page.screenshot({ path: 'test-results/report-overflow.png', fullPage: false })
  // html overflow-x:hidden masks docScrollWidth; measure the report itself.
  expect(widths.diagnostics).toBeLessThanOrEqual(widths.contentArea!)
  expect(widths.liScrollWidth).toBeLessThanOrEqual((widths.liWidth ?? 0) + 1)
})
