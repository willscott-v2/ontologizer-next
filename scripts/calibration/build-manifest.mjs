import { createHash } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
  DEFAULT_SEED,
  ineligibilityReason,
  isPrivateOrReservedIp,
  normalizeHistoricalUrl,
  parseEnvFile,
  seededOrder,
  shortHash,
  splitSample,
} from './core.mjs'

const args = Object.fromEntries(process.argv.slice(2).map((value) => {
  const [key, ...parts] = value.replace(/^--/, '').split('=')
  return [key, parts.join('=') || true]
}))
const sourceEnvPath = resolve(String(args['source-env'] || '/Users/willscott/Development/Development Archive/ai-website-grader/.env.local'))
const outputPath = resolve(String(args.output || 'calibration/private/manifest.json'))
const seed = String(args.seed || DEFAULT_SEED)
const sampleSize = Number(args.limit || 50)
const calibrationSize = Math.max(0, Number(args['calibration-size'] ?? Math.min(40, sampleSize)))
const concurrency = Math.max(1, Number(args.concurrency || 8))
const excludePath = args.exclude ? resolve(String(args.exclude)) : null

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  await rename(temporary, path)
}

async function readHistoricalRows() {
  const env = parseEnvFile(await readFile(sourceEnvPath, 'utf8'))
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('The AI Website Grader Supabase environment is incomplete.')
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from('analyses').select('url, analyzed_at').order('analyzed_at', { ascending: false }).range(from, from + 999)
    if (error) throw new Error(`Historical corpus query failed: ${error.message}`)
    rows.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  return rows
}

async function validatePublicTarget(url) {
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const addresses = await lookup(host, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(({ address }) => isPrivateOrReservedIp(address))) throw new Error('private_or_reserved_dns')
}

async function preflight(rawUrl) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)
  try {
    let current = new URL(rawUrl)
    for (let redirects = 0; redirects <= 5; redirects += 1) {
      await validatePublicTarget(current)
      const response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        },
      })
      if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
        await response.body?.cancel()
        current = new URL(response.headers.get('location'), current)
        if (!['http:', 'https:'].includes(current.protocol)) throw new Error('unsupported_redirect')
        continue
      }
      const type = response.headers.get('content-type') || ''
      await response.body?.cancel()
      if (!response.ok) throw new Error(`http_${response.status}`)
      if (!/(text\/html|application\/xhtml\+xml)/i.test(type)) throw new Error('unsupported_content_type')
      return { ok: true, finalUrl: current.toString(), redirects }
    }
    throw new Error('too_many_redirects')
  } catch (error) {
    const reason = error instanceof Error && error.name === 'AbortError' ? 'timeout' : String(error instanceof Error ? error.message : error).replace(/https?:\/\/\S+/g, '[url]')
    return { ok: false, reason }
  } finally {
    clearTimeout(timeout)
  }
}

const rows = await readHistoricalRows()
const rejectionCounts = {}
const unique = new Map()
for (const row of rows) {
  const normalized = normalizeHistoricalUrl(row.url)
  const reason = ineligibilityReason(normalized)
  if (reason) {
    rejectionCounts[reason] = (rejectionCounts[reason] || 0) + 1
    continue
  }
  if (unique.has(normalized.key)) {
    rejectionCounts.duplicate = (rejectionCounts.duplicate || 0) + 1
    continue
  }
  unique.set(normalized.key, normalized)
}

const excludedKeys = new Set()
if (excludePath) {
  const excludedManifest = JSON.parse(await readFile(excludePath, 'utf8'))
  for (const item of excludedManifest.sample ?? []) excludedKeys.add(item.normalizedKey)
}
const ordered = seededOrder([...unique.values()].filter((candidate) => !excludedKeys.has(candidate.key)), seed)
if (excludedKeys.size) rejectionCounts.prior_sample = excludedKeys.size
const accepted = []
const rejected = []
for (let start = 0; start < ordered.length && accepted.length < sampleSize; start += concurrency) {
  const batch = ordered.slice(start, start + concurrency)
  const checks = await Promise.all(batch.map((candidate) => preflight(candidate.url)))
  for (let index = 0; index < batch.length && accepted.length < sampleSize; index += 1) {
    const candidate = batch[index]
    const check = checks[index]
    if (!check.ok) {
      rejectionCounts[check.reason] = (rejectionCounts[check.reason] || 0) + 1
      rejected.push({ id: shortHash(candidate.key), url: candidate.url, reason: check.reason })
      continue
    }
    accepted.push({ id: shortHash(candidate.key), url: candidate.url, finalPreflightUrl: check.finalUrl, normalizedKey: candidate.key })
  }
}

if (accepted.length !== sampleSize) throw new Error(`Only ${accepted.length} eligible URLs were found; ${sampleSize} are required.`)
const sample = splitSample(accepted, Math.min(calibrationSize, sampleSize))
const orderedHash = createHash('sha256').update(sample.map(({ normalizedKey }) => normalizedKey).join('\n')).digest('hex')
await atomicJson(outputPath, {
  version: 1,
  seed,
  createdAt: new Date().toISOString(),
  source: 'AI Website Grader normalized historical public URL corpus',
  sourceRows: rows.length,
  uniqueEligibleCandidatesBeforePreflight: unique.size,
  orderedHash,
  rejectionCounts,
  rejected,
  sample,
})
console.log(JSON.stringify({ sourceRows: rows.length, candidates: unique.size, accepted: sample.length, calibration: sample.filter(({ split }) => split === 'calibration').length, holdout: sample.filter(({ split }) => split === 'holdout').length, orderedHash }, null, 2))
