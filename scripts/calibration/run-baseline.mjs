import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  canStartProviderCall,
  parseEnvFile,
  pendingSample,
} from './core.mjs'

const args = Object.fromEntries(process.argv.slice(2).map((value) => {
  const [key, ...parts] = value.replace(/^--/, '').split('=')
  return [key, parts.join('=') || true]
}))
const manifestPath = resolve(String(args.manifest || 'calibration/private/manifest.json'))
const statePath = resolve(String(args.output || 'calibration/private/baseline.json'))
const ledgerPath = resolve(String(args.ledger || 'calibration/private/budget-ledger.json'))
const envPath = resolve(String(args.env || '.env.local'))
const baseUrl = String(args.base || 'http://127.0.0.1:3000')
const split = String(args.split || 'calibration')
const cap = Number(args.cap || 1)
const reserve = Number(args.reserve || 0.03)
const fromPosition = Math.max(1, Number(args['from-position'] || 1))
const toPosition = Number(args['to-position'] || Number.POSITIVE_INFINITY)

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')) } catch { return fallback }
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, path)
}

const manifest = await readJson(manifestPath, null)
if (!manifest?.sample?.length) throw new Error('Build the private calibration manifest first.')
if (!['calibration', 'holdout', 'all'].includes(split)) throw new Error('Split must be calibration, holdout, or all.')
const env = parseEnvFile(await readFile(envPath, 'utf8'))
if (!env.OPENAI_API_KEY || !env.GEMINI_API_KEY) throw new Error('OPENAI_API_KEY and GEMINI_API_KEY are required for calibration.')
const apiHeaders = {
  'Content-Type': 'application/json',
  'X-OpenAI-Key': env.OPENAI_API_KEY,
  'X-Gemini-Key': env.GEMINI_API_KEY,
}
if (env.GOOGLE_KG_API_KEY) apiHeaders['X-Google-KG-Key'] = env.GOOGLE_KG_API_KEY

const state = await readJson(statePath, {
  version: 1,
  manifestHash: manifest.orderedHash,
  seed: manifest.seed,
  startedAt: new Date().toISOString(),
  records: [],
})
if (state.manifestHash !== manifest.orderedHash) throw new Error('The baseline state belongs to a different manifest.')
const ledger = await readJson(ledgerPath, { version: 1, capUsd: cap, totalCostUsd: 0, entries: [] })
if (ledger.capUsd !== cap) throw new Error(`The existing budget ledger cap is $${ledger.capUsd}; use the same cap or start a reviewed ledger.`)

async function persist() {
  state.updatedAt = new Date().toISOString()
  await atomicJson(statePath, state)
  await atomicJson(ledgerPath, ledger)
}

function addUsage(id, step, usage) {
  if (!usage || !Number.isFinite(usage.costUsd)) return
  ledger.totalCostUsd += usage.costUsd
  ledger.entries.push({ id, step, provider: usage.provider, model: usage.model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, costUsd: usage.costUsd, at: new Date().toISOString() })
}

async function post(path, body, timeoutMs = 180_000) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST', headers: apiHeaders, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await response.text()
  let data
  try { data = JSON.parse(text) } catch { data = { error: text || `HTTP ${response.status}` } }
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${data.error || data.message || 'unknown error'}`)
  return data
}

function requireBudget() {
  if (!canStartProviderCall(ledger.totalCostUsd, cap, reserve)) throw new Error('provider_cost_stop')
}

async function runOne(item) {
  const started = Date.now()
  let currentStep = 'extract'
  const record = {
    id: item.id,
    position: item.position,
    split: item.split,
    url: item.url,
    status: 'running',
    startedAt: new Date().toISOString(),
    steps: {},
  }
  let analysisRunId
  const previous = state.records.findIndex(({ id }) => id === item.id)
  if (previous >= 0) state.records[previous] = record
  else state.records.push(record)
  await persist()
  try {
    requireBudget()
    const extract = await post('/api/analyze/extract', { url: item.url, pasteFormat: 'text', clearCache: true, runQueryCoverage: true })
    analysisRunId = extract.analysisRunId
    addUsage(item.id, 'extract', extract.usage)
    record.steps.extract = {
      mainTopic: extract.mainTopic,
      mainTopicConfidence: extract.mainTopicConfidence,
      entities: extract.entities,
      cacheStatus: extract.cacheStatus,
      contentHash: extract.contentHash,
      analysisVersion: extract.analysisVersion,
      fetchMetadata: extract.fetchMetadata,
      title: extract.textParts.title,
      description: extract.textParts.description,
      headings: extract.textParts.headings,
      bodyLength: extract.textParts.body.length,
      bodyExcerpt: extract.textParts.body.slice(0, 4000),
      usage: extract.usage,
    }
    await persist()

    currentStep = 'enrich'
    const enrich = await post('/api/analyze/enrich', {
      entities: extract.entities,
      mainTopic: extract.mainTopic,
      htmlContent: extract.textParts.htmlContent,
      contentHash: extract.contentHash,
      analysisRunId,
    })
    record.steps.enrich = enrich
    await persist()

    currentStep = 'generate'
    requireBudget()
    const generate = await post('/api/analyze/generate', {
      enrichedEntities: enrich.enrichedEntities,
      textParts: extract.textParts,
      mainTopic: extract.mainTopic,
      topicConfidence: extract.mainTopicConfidence,
      url: item.url,
      contentHash: extract.contentHash,
      analysisRunId,
    })
    addUsage(item.id, 'generate', generate.usage)
    record.steps.generate = generate
    await persist()

    currentStep = 'fanout'
    if (canStartProviderCall(ledger.totalCostUsd, cap, reserve)) {
      const fanout = await post('/api/analyze/fanout', {
        htmlContent: extract.textParts.htmlContent,
        url: item.url,
        contentHash: extract.contentHash,
        clearCache: true,
        analysisRunId,
      })
      addUsage(item.id, 'fanout', fanout.usage)
      record.steps.fanout = fanout
    } else {
      record.steps.fanout = { analysis: null, error: 'provider_cost_stop', skipped: true }
    }
    record.status = 'complete'
    record.runtimeMs = Date.now() - started
    record.completedAt = new Date().toISOString()
    await post('/api/analyze/log', { analysisRunId, status: 'complete', entitiesFound: enrich.enrichedEntities.length, processingTimeMs: record.runtimeMs }, 30_000).catch(() => {})
  } catch (error) {
    record.status = error instanceof Error && error.message === 'provider_cost_stop' ? 'cost_stopped' : 'failed'
    record.error = error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, '[url]') : String(error)
    record.runtimeMs = Date.now() - started
    if (analysisRunId) await post('/api/analyze/log', { analysisRunId, status: 'failed', processingTimeMs: record.runtimeMs, errorStep: currentStep, errorMessage: record.error.slice(0, 500) }, 30_000).catch(() => {})
  }
  await persist()
  return record
}

const selectedSplit = split === 'all' ? undefined : split
const completedIds = state.records.filter(({ status }) => status === 'complete').map(({ id }) => id)
const pending = pendingSample(manifest.sample, completedIds, selectedSplit)
  .filter((item) => item.position >= fromPosition && item.position <= toPosition)
for (let index = 0; index < pending.length; index += 1) {
  const item = pending[index]
  const record = await runOne(item)
  console.log(`[${index + 1}/${pending.length}] ${item.id} ${record.status} cost=$${ledger.totalCostUsd.toFixed(4)}`)
  if (record.status === 'cost_stopped') break
}

const inScope = state.records.filter((record) => !selectedSplit || record.split === selectedSplit)
console.log(JSON.stringify({ split, complete: inScope.filter(({ status }) => status === 'complete').length, failed: inScope.filter(({ status }) => status === 'failed').length, costStopped: inScope.filter(({ status }) => status === 'cost_stopped').length, totalCostUsd: Number(ledger.totalCostUsd.toFixed(6)), capUsd: cap }, null, 2))
