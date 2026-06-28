import { describe, expect, it } from 'vitest'
import {
  deriveTokensPerSecond,
  formatDuration,
  formatMessageTime,
  formatTokensPerSecond,
} from './format'

describe('formatDuration', () => {
  it('renders "<1s" for sub-second durations', () => {
    expect(formatDuration(0)).toBe('<1s')
    expect(formatDuration(999)).toBe('<1s')
  })

  it('renders "X.Xs" for sub-minute durations', () => {
    expect(formatDuration(1000)).toBe('1.0s')
    expect(formatDuration(1500)).toBe('1.5s')
    expect(formatDuration(59_900)).toBe('59.9s')
  })

  it('renders "Xm Ys" for minute-plus durations', () => {
    expect(formatDuration(60_000)).toBe('1m 0s')
    expect(formatDuration(90_000)).toBe('1m 30s')
    expect(formatDuration(605_000)).toBe('10m 5s')
  })

  it('clamps negative, NaN, and non-finite inputs to "<1s"', () => {
    expect(formatDuration(-5)).toBe('<1s')
    expect(formatDuration(Number.NaN)).toBe('<1s')
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('<1s')
  })
})

describe('formatTokensPerSecond', () => {
  it('formats a positive rate', () => {
    expect(formatTokensPerSecond(12.34)).toBe('12.3 tok/s')
  })

  it('returns undefined for undefined, zero, negative, and non-finite', () => {
    expect(formatTokensPerSecond(undefined)).toBeUndefined()
    expect(formatTokensPerSecond(0)).toBeUndefined()
    expect(formatTokensPerSecond(-1)).toBeUndefined()
    expect(formatTokensPerSecond(Number.NaN)).toBeUndefined()
  })
})

describe('deriveTokensPerSecond', () => {
  it('prefers a positive provider rate', () => {
    expect(deriveTokensPerSecond(42, 100, 1000)).toBe(42)
  })

  it('derives from completion over durationMs when no provider rate', () => {
    expect(deriveTokensPerSecond(undefined, 30, 3000)).toBe(10)
  })

  it('ignores a non-positive provider rate and derives instead', () => {
    expect(deriveTokensPerSecond(0, 30, 3000)).toBe(10)
  })

  it('returns undefined when nothing is derivable', () => {
    expect(deriveTokensPerSecond(undefined, undefined, undefined)).toBeUndefined()
    expect(deriveTokensPerSecond(undefined, 30, undefined)).toBeUndefined()
    expect(deriveTokensPerSecond(undefined, undefined, 3000)).toBeUndefined()
  })
})

describe('formatMessageTime', () => {
  it('formats an epoch-ms timestamp as zero-padded local HH:MM', () => {
    // Build a local time deterministically so the assertion is TZ-independent.
    const date = new Date(2024, 0, 2, 9, 5)
    expect(formatMessageTime(date.getTime())).toBe('09:05')
  })

  it('zero-pads single-digit hours and minutes', () => {
    const date = new Date(2024, 0, 2, 0, 0)
    expect(formatMessageTime(date.getTime())).toBe('00:00')
  })

  it('accepts an ISO/date string', () => {
    const date = new Date(2024, 0, 2, 14, 30)
    expect(formatMessageTime(date.toISOString())).toBe('14:30')
  })

  it('returns undefined for missing or invalid input', () => {
    expect(formatMessageTime(undefined)).toBeUndefined()
    expect(formatMessageTime('not-a-date')).toBeUndefined()
    expect(formatMessageTime(Number.NaN)).toBeUndefined()
  })
})
