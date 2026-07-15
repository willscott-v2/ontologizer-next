import { createHash } from 'node:crypto'
import { isIP } from 'node:net'

export const DEFAULT_SEED = '2026-07-15-ontologizer-calibration-v1'

export function parseEnvFile(source) {
  const values = {}
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator < 1) continue
    const key = trimmed.slice(0, separator).trim()
    let value = trimmed.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }
  return values
}

export function shortHash(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

export function normalizeHistoricalUrl(raw) {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed || trimmed.toLowerCase() === 'manual-input') return null
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let parsed
  try {
    parsed = new URL(withProtocol)
  } catch {
    return null
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null
  parsed.hash = ''
  parsed.search = ''
  parsed.hostname = parsed.hostname.toLowerCase().replace(/\.$/, '')
  if ((parsed.protocol === 'https:' && parsed.port === '443') || (parsed.protocol === 'http:' && parsed.port === '80')) parsed.port = ''
  parsed.pathname = parsed.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/'
  const keyHost = parsed.hostname.replace(/^www\./, '')
  const keyPath = parsed.pathname === '/' ? '' : parsed.pathname.toLowerCase()
  return {
    url: parsed.toString(),
    key: `${keyHost}${parsed.port ? `:${parsed.port}` : ''}${keyPath}`,
  }
}

export function ineligibilityReason(candidate) {
  if (!candidate) return 'invalid_url'
  const parsed = new URL(candidate.url)
  const host = parsed.hostname.replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return 'private_host'
  if (isIP(host) && isPrivateOrReservedIp(host)) return 'private_host'
  if (/(^|\/)(admin|wp-admin|login|sign-in|signin|auth|account|cart|checkout)(\/|$)/i.test(parsed.pathname)) return 'excluded_path'
  return null
}

export function seededOrder(candidates, seed = DEFAULT_SEED) {
  return [...candidates].sort((left, right) => {
    const leftRank = createHash('sha256').update(`${seed}\0${left.key}`).digest('hex')
    const rightRank = createHash('sha256').update(`${seed}\0${right.key}`).digest('hex')
    return leftRank.localeCompare(rightRank) || left.key.localeCompare(right.key)
  })
}

export function splitSample(items, calibrationSize = 40) {
  return items.map((item, index) => ({
    ...item,
    split: index < calibrationSize ? 'calibration' : 'holdout',
    position: index + 1,
  }))
}

export function pendingSample(items, completedIds, split) {
  const completed = new Set(completedIds)
  return items.filter((item) => (!split || item.split === split) && !completed.has(item.id))
}

export function canStartProviderCall(spend, cap, reserve) {
  return Number.isFinite(spend) && Number.isFinite(cap) && Number.isFinite(reserve) && spend + reserve <= cap
}

export function isPrivateOrReservedIp(address) {
  const version = isIP(address)
  if (version === 4) {
    const octets = address.split('.').map(Number)
    if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value))) return true
    const [a, b, c] = octets
    return a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) || a >= 224
  }
  if (version !== 6) return true
  const normalized = address.toLowerCase()
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length)
    return mapped.includes('.') ? isPrivateOrReservedIp(mapped) : true
  }
  return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') ||
    normalized.startsWith('fd') || /^fe[89ab]/.test(normalized) ||
    normalized.startsWith('ff') || normalized.startsWith('2001:db8:')
}
