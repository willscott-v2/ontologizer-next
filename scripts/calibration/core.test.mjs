import { describe, expect, it } from 'vitest'
import {
  canStartProviderCall,
  ineligibilityReason,
  normalizeHistoricalUrl,
  pendingSample,
  seededOrder,
  splitSample,
} from './core.mjs'

describe('calibration sampling', () => {
  it('normalizes historical URLs for deterministic deduplication', () => {
    expect(normalizeHistoricalUrl('HTTPS://WWW.Example.com/a/?utm_source=x#top')).toEqual({
      url: 'https://www.example.com/a',
      key: 'example.com/a',
    })
    expect(normalizeHistoricalUrl('manual-input')).toBeNull()
  })

  it('excludes sensitive paths and private hosts', () => {
    expect(ineligibilityReason(normalizeHistoricalUrl('https://example.com/checkout/'))).toBe('excluded_path')
    expect(ineligibilityReason(normalizeHistoricalUrl('http://127.0.0.1/page'))).toBe('private_host')
    expect(ineligibilityReason(normalizeHistoricalUrl('https://example.com/services/'))).toBeNull()
  })

  it('keeps the seeded order and split stable', () => {
    const candidates = ['a.com', 'b.com', 'c.com'].map((url) => normalizeHistoricalUrl(url))
    const first = seededOrder(candidates, 'fixed-seed')
    const second = seededOrder([...candidates].reverse(), 'fixed-seed')
    expect(first.map(({ key }) => key)).toEqual(second.map(({ key }) => key))
    expect(splitSample(first, 2).map(({ split }) => split)).toEqual(['calibration', 'calibration', 'holdout'])
  })

  it('resumes without rerunning completed sample IDs', () => {
    const items = [
      { id: 'one', split: 'calibration' },
      { id: 'two', split: 'calibration' },
      { id: 'three', split: 'holdout' },
    ]
    expect(pendingSample(items, ['one'], 'calibration').map(({ id }) => id)).toEqual(['two'])
  })

  it('reserves budget before a provider call', () => {
    expect(canStartProviderCall(0.94, 1, 0.05)).toBe(true)
    expect(canStartProviderCall(0.96, 1, 0.05)).toBe(false)
  })
})
