import { readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import OpenAI from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import { canStartProviderCall, parseEnvFile } from './core.mjs'

const args = Object.fromEntries(process.argv.slice(2).map((value) => {
  const [key, ...parts] = value.replace(/^--/, '').split('=')
  return [key, parts.join('=') || true]
}))
const inputPath = resolve(String(args.input || 'calibration/private/baseline.json'))
const outputPath = resolve(String(args.output || 'calibration/private/baseline-review.json'))
const ledgerPath = resolve(String(args.ledger || 'calibration/private/budget-ledger.json'))
const envPath = resolve(String(args.env || '.env.local'))
const batchSize = Math.max(1, Math.min(10, Number(args.batch || 10)))
const reserve = Number(args.reserve || 0.03)
const model = 'gpt-5.4-mini'

const reviewSchema = z.object({
  reviews: z.array(z.object({
    id: z.string(),
    topicAgreement: z.boolean(),
    topicReason: z.string().min(10).max(300),
    pageTypeAgreement: z.boolean(),
    pageTypeReason: z.string().min(10).max(300),
    unsupportedSchemaFacts: z.array(z.string().min(3).max(200)).max(10),
    identifierConcerns: z.array(z.string().min(3).max(200)).max(10),
  }).strict()),
}).strict()

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch { return fallback }
}

async function atomicJson(path, value) {
  const temporary = `${path}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, path)
}

function scrubPageUrl(value, pageUrl) {
  if (Array.isArray(value)) return value.map((item) => scrubPageUrl(item, pageUrl))
  if (!value || typeof value !== 'object') return typeof value === 'string' && pageUrl ? value.replaceAll(pageUrl, '[page-url]') : value
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, scrubPageUrl(child, pageUrl)]))
}

const input = await readJson(inputPath, null)
if (!input?.records?.length) throw new Error('The private analysis result file is missing or empty.')
const env = parseEnvFile(await readFile(envPath, 'utf8'))
if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for independent evidence review.')
const ledger = await readJson(ledgerPath, null)
if (!ledger?.capUsd) throw new Error('The private calibration budget ledger is missing.')
const state = await readJson(outputPath, { version: 1, source: inputPath.split('/').pop(), model, reviews: [], startedAt: new Date().toISOString() })
const reviewed = new Set(state.reviews.map(({ id }) => id))
const records = input.records.filter(({ status, id }) => status === 'complete' && !reviewed.has(id))
const client = new OpenAI({ apiKey: env.OPENAI_API_KEY })

for (let start = 0; start < records.length; start += batchSize) {
  if (!canStartProviderCall(ledger.totalCostUsd, ledger.capUsd, reserve)) throw new Error('provider_cost_stop')
  const batch = records.slice(start, start + batchSize).map((record) => {
    const extract = record.steps.extract
    const generate = record.steps.generate
    return {
      id: record.id,
      visibleEvidence: {
        title: extract.title,
        description: extract.description,
        headings: extract.headings.slice(0, 30),
        bodyExcerpt: extract.bodyExcerpt,
      },
      proposedTopic: extract.mainTopic,
      proposedPageType: generate.schemaArtifact.pageType.type,
      schemaFactsUsed: generate.schemaArtifact.factsUsed,
      schema: scrubPageUrl(generate.schemaArtifact.jsonLd, record.url),
    }
  })
  const completion = await client.chat.completions.parse({
    model,
    reasoning_effort: 'low',
    max_completion_tokens: 6_000,
    messages: [{
      role: 'user',
      content: `Independently review each Ontologizer result against only the supplied visible page evidence. Do not use the tool's clarity status as an answer.

Topic agreement means the proposed topic accurately names the page's primary subject or task. Page-type agreement means the proposed Schema.org-oriented type is the best of Service, LocalBusiness, EducationalOccupationalProgram, Article, or WebPage. A broad WebPage fallback is acceptable when the evidence does not support a specialized type.

List a schema fact as unsupported only when the generated value conflicts with or has no basis in the supplied evidence. Do not flag URL-derived @id values, verified Wikipedia/Wikidata/Google KGMID identity links, or facts explicitly named in schemaFactsUsed. Put genuinely ambiguous cases in the reason instead of calling them unsupported. Flag an identifier concern only for an apparent entity mismatch or a generic search URL.

Return one review for every supplied ID.

${JSON.stringify(batch)}`,
    }],
    response_format: zodResponseFormat(reviewSchema, 'ontologizer_evidence_review'),
  })
  const parsed = completion.choices[0]?.message.parsed
  if (!parsed || parsed.reviews.length !== batch.length) throw new Error('Independent review returned an incomplete batch.')
  state.reviews.push(...parsed.reviews)
  if (completion.usage) {
    const inputTokens = completion.usage.prompt_tokens ?? 0
    const outputTokens = completion.usage.completion_tokens ?? 0
    const costUsd = (inputTokens * 0.75 + outputTokens * 4.5) / 1_000_000
    ledger.totalCostUsd += costUsd
    ledger.entries.push({ id: `review-${start / batchSize + 1}`, step: 'independent_evidence_review', provider: 'openai', model, inputTokens, outputTokens, costUsd, at: new Date().toISOString() })
  }
  state.updatedAt = new Date().toISOString()
  await atomicJson(outputPath, state)
  await atomicJson(ledgerPath, ledger)
}

const topicAgreement = state.reviews.filter(({ topicAgreement }) => topicAgreement).length
const pageTypeAgreement = state.reviews.filter(({ pageTypeAgreement }) => pageTypeAgreement).length
const unsupportedSchemaFacts = state.reviews.reduce((sum, review) => sum + review.unsupportedSchemaFacts.length, 0)
const identifierConcerns = state.reviews.reduce((sum, review) => sum + review.identifierConcerns.length, 0)
console.log(JSON.stringify({ reviewed: state.reviews.length, topicAgreement, pageTypeAgreement, unsupportedSchemaFacts, identifierConcerns, totalCostUsd: Number(ledger.totalCostUsd.toFixed(6)), capUsd: ledger.capUsd }, null, 2))
