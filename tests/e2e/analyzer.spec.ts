import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const textParts = {
  title: 'Technical SEO Audits | Example Agency',
  description: 'Technical SEO audit services.',
  headings: [
    { level: 1, text: 'Technical SEO Audits' },
    { level: 2, text: 'What the audit covers' },
  ],
  body: 'Technical SEO audits identify crawl, indexing, and page structure issues. The audit includes findings and priorities.',
  htmlContent: '<html><head><title>Technical SEO Audits | Example Agency</title></head><body><h1>Technical SEO Audits</h1><h2>What the audit covers</h2><p>Technical SEO audits identify crawl, indexing, and page structure issues.</p></body></html>',
}

const dimension = (name: string) => ({
  status: 'strong',
  summary: `${name} is supported by visible page evidence.`,
  evidence: [{ id: `${name}-evidence`, source: 'title', text: textParts.title }],
  checks: [{ id: `${name}-check`, label: `${name} check`, status: 'pass', detail: `${name} passed.`, evidenceIds: [`${name}-evidence`] }],
})

async function mockSuccessfulAnalysis(page: Page, withCoverage = false) {
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
        wikidataUrl: 'https://www.wikidata.org/wiki/Q180711', googleKgUrl: null, productOntologyUrl: null,
      }],
      cacheStatus: { hits: 0, misses: 1 },
      googleKnowledgeGraph: 'not_configured',
    },
  }))
  await page.route('**/api/analyze/generate', (route) => route.fulfill({
    json: {
      schemaArtifact: {
        jsonLd: { '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage', '@id': 'https://example.com/audit#webpage', name: textParts.title }] },
        pageType: { type: 'Service', confidence: 0.88, evidence: ['Named service language', 'Provider context'] },
        status: 'ready', errors: [], warnings: [], factsUsed: ['Page title'], factsOmitted: [],
        schemaVersion: 'connected-schema-1', generatedAt: '2026-07-15T12:00:00.000Z',
      },
      recommendations: [{
        observation: 'The opening does not explain who the audit is for.', evidence: ['topic-opening'],
        action: 'Add one sentence naming the audience and the decision this audit supports.',
        priority: 'high', effort: 'small', confidence: 'high', dimension: 'topicFocus',
      }],
      clarity: {
        mainTopic: 'Technical SEO Audits', topicConfidence: 0.9, overallStatus: 'strong',
        dimensions: {
          topicFocus: dimension('Topic focus'), entityClarity: dimension('Entity clarity'),
          semanticCoherence: dimension('Semantic coherence'), answerStructure: dimension('Answer structure'),
        },
        degradedSteps: [], analysisVersion: '2026-07-15.1',
      },
      recommendationMode: 'deterministic',
    },
  }))
  if (withCoverage) {
    await page.route('**/api/analyze/fanout', (route) => route.fulfill({
      json: {
        analysis: {
          primaryEntity: 'Technical SEO Audits',
          questions: Array.from({ length: 5 }, (_, index) => index === 0 ? ({
            question: 'How long does a technical SEO audit take?', intent: 'procedure', coverage: 'missing',
            evidenceChunkIds: [], checkedScope: 'The supplied chunks explain scope but provide no timing information.',
            gapAction: 'Add a realistic audit timeline and the factors that can change it.',
          }) : ({
            question: `What does audit question ${index + 1} cover?`, intent: 'definition', coverage: 'covered',
            evidenceChunkIds: ['chunk-1'], checkedScope: 'The primary topic chunk directly answers this modeled question.',
          })),
          summary: { covered: 4, partial: 0, missing: 1 }, promptVersion: 'fanout-2',
          disclosure: 'Modeled questions based on this page, not observed Google searches.',
        },
        chunksExtracted: 2, chunks: [], cacheStatus: 'fresh',
      },
    }))
  }
  await page.route('**/api/analyze/log', (route) => route.fulfill({ json: { ok: true } }))
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('ontologizer-api-keys', JSON.stringify({ openaiKey: 'test-key', googleKgKey: '', geminiKey: 'test-key' }))
  })
})

test('landing form is focused, responsive, and accessible', async ({ page }, testInfo) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('See what your page tells search and AI systems')
  await expect(page.getByRole('button', { name: 'Analyze page', exact: true })).toBeDisabled()
  await expect(page.getByRole('link', { name: 'Try the AI Website Grader' })).toHaveAttribute(
    'href',
    'https://ai-grader.searchinfluence.com/'
  )
  if (testInfo.project.name === 'desktop') {
    const analyzeButton = page.getByRole('button', { name: 'Analyze page', exact: true })
    const analyzeBox = await analyzeButton.boundingBox()
    expect(analyzeBox).not.toBeNull()
    expect((analyzeBox?.y ?? Infinity) + (analyzeBox?.height ?? 0)).toBeLessThanOrEqual(900)
  }
  await page.getByText('Advanced options').click()
  await expect(page.getByLabel('Main topic override')).toBeVisible()
  const accessibility = await new AxeBuilder({ page }).analyze()
  expect(accessibility.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})

test('anonymous visitors without API keys get the sign-in path before submission', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('ontologizer-api-keys'))
  await page.goto('/')
  await page.getByLabel('Page URL').fill('https://example.com/audit')
  await expect(page.getByRole('button', { name: 'Analyze page', exact: true })).toBeDisabled()
  await expect(page.getByRole('link', { name: 'Sign in for 5 free' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Add API keys' })).toBeVisible()
})

test('URL analysis shows one overview and downloads the branded report', async ({ page }) => {
  await mockSuccessfulAnalysis(page)
  await page.goto('/')
  await page.getByLabel('Page URL').fill('https://example.com/audit')
  await page.getByRole('button', { name: 'Analyze page', exact: true }).click()
  await expect(page.getByText('What this page is about')).toBeVisible()
  await expect(page.getByText('Technical SEO Audits', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Ready to review', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Add one sentence naming the audience and the decision this audit supports.' })).toBeVisible()
  const contentOverflow = await page.locator('.content-area').evaluate((element) => getComputedStyle(element).overflowY)
  expect(contentOverflow).not.toBe('auto')
  expect(contentOverflow).not.toBe('scroll')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download Markdown' }).click()
  const download = await downloadPromise
  const stream = await download.createReadStream()
  let report = ''
  if (!stream) throw new Error('Downloaded report stream was unavailable.')
  for await (const chunk of stream) report += chunk.toString()
  expect(report).toContain('# Ontologizer AI Content Clarity Report')
  expect(report).toContain('https://example.com/audit')
  expect(report).toContain('Generated schema must match visible page content')
  expect(report).toContain('Search Influence')

  await page.getByRole('button', { name: 'Copy JSON-LD' }).click()
  await expect(page.getByRole('button', { name: 'Copied!' })).toBeVisible()

  const accessibility = await new AxeBuilder({ page }).analyze()
  expect(accessibility.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([])
})

test('plain-text paste mode reaches the same core report contract', async ({ page }) => {
  await mockSuccessfulAnalysis(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Paste Content' }).click()
  await expect(page.getByLabel('Format')).toHaveValue('text')
  await page.getByRole('textbox', { name: 'Page content', exact: true }).fill('# Technical SEO Audits\n\nAn audit identifies crawl and indexing issues.')
  const extractRequest = page.waitForRequest('**/api/analyze/extract')
  await page.getByRole('button', { name: 'Analyze content', exact: true }).click()
  const requestBody = (await extractRequest).postDataJSON()
  expect(requestBody).toMatchObject({
    pasteFormat: 'text',
    pasteContent: expect.stringContaining('Technical SEO Audits'),
  })
  expect(requestBody.url).toBeUndefined()
  await expect(page.getByText('What this page is about')).toBeVisible()
})

test('optional Query Coverage is labeled as modeled', async ({ page }) => {
  await mockSuccessfulAnalysis(page, true)
  await page.goto('/')
  await page.getByLabel('Page URL').fill('https://example.com/audit')
  await page.getByText('Advanced options').click()
  await page.getByLabel('AI Query Coverage').check()
  await page.getByRole('button', { name: 'Analyze page', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Add a realistic audit timeline and the factors that can change it.' })).toBeVisible()
  await page.getByText('Review modeled questions and evidence').click()
  await expect(page.getByText('Modeled questions based on this page, not observed Google searches.')).toBeVisible()
})

test('provider failure is visible and does not expose implementation details', async ({ page }) => {
  await page.route('**/api/analyze/extract', (route) => route.fulfill({ status: 503, json: { error: 'OpenAI entity extraction is temporarily unavailable.' } }))
  await page.goto('/')
  await page.getByLabel('Page URL').fill('https://example.com/audit')
  await page.getByRole('button', { name: 'Analyze page', exact: true }).click()
  await expect(page.getByText('Analysis failed')).toBeVisible()
  await expect(page.getByText('OpenAI entity extraction is temporarily unavailable.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try this analysis again' })).toBeVisible()
})
