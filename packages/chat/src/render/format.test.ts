import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '../model'
import type { RenderableBlock } from './extensions'
import {
  approxTokenCount,
  createClockGutterDeduper,
  formatClockTime,
  formatDuration,
  formatTokensPerSecond,
} from './format'

describe('formatDuration', () => {
  it('renders sub-second durations as tenths (no "<1s" floor)', () => {
    expect(formatDuration(0)).toBe('0.0s')
    expect(formatDuration(40)).toBe('0.0s')
    expect(formatDuration(80)).toBe('0.1s')
    expect(formatDuration(450)).toBe('0.5s')
    expect(formatDuration(999)).toBe('1.0s')
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

  it('routes inputs that ROUND to 60s onto the minutes path (never "60.0s")', () => {
    // [59.95s, 60s) passes `< 60` but toFixed(1) rounds to '60.0' — the gate
    // applies to the rounded value, so these render '1m 0s', not '60.0s'.
    expect(formatDuration(59_949)).toBe('59.9s')
    expect(formatDuration(59_950)).toBe('1m 0s')
    expect(formatDuration(60_000)).toBe('1m 0s')
  })

  it('clamps negative, NaN, and non-finite inputs to "0.0s"', () => {
    expect(formatDuration(-5)).toBe('0.0s')
    expect(formatDuration(Number.NaN)).toBe('0.0s')
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe('0.0s')
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

describe('approxTokenCount', () => {
  it('returns undefined for an empty block list', () => {
    expect(approxTokenCount([])).toBeUndefined()
  })

  it('sums text + reasoning character counts and divides by 4 (rounded)', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', id: 't', text: 'a'.repeat(10) },
      { type: 'reasoning', id: 'r', text: 'b'.repeat(11) },
    ]
    // 21 chars / 4 = 5.25 → rounds to 5.
    expect(approxTokenCount(blocks)).toBe(5)
  })

  it('ignores non-prose blocks (tool_call, status, system, custom)', () => {
    const blocks: RenderableBlock[] = [
      { type: 'tool_call', id: 'tc', name: 'search', arguments: {}, status: 'success' },
      { type: 'status', id: 's' },
      { type: 'system', id: 'sy', text: 'x'.repeat(400) },
      { type: 'host_card', id: 'hc' } as unknown as RenderableBlock,
      { type: 'text', id: 't', text: 'c'.repeat(8) },
    ]
    // Only the text block counts: 8 / 4 = 2.
    expect(approxTokenCount(blocks)).toBe(2)
  })

  it('returns undefined when the estimate rounds to 0 (no zero rates)', () => {
    const blocks: ContentBlock[] = [{ type: 'text', id: 't', text: 'a' }]
    // 1 char / 4 = 0.25 → rounds to 0 → undefined, not 0.
    expect(approxTokenCount(blocks)).toBeUndefined()
  })
})

describe('formatClockTime', () => {
  it('formats an epoch-ms timestamp as zero-padded local HH:MM:SS', () => {
    // Build a local time deterministically so the assertion is TZ-independent.
    const date = new Date(2024, 0, 2, 9, 5, 7)
    expect(formatClockTime(date.getTime())).toBe('09:05:07')
  })

  it('zero-pads single-digit hours, minutes, and seconds', () => {
    const date = new Date(2024, 0, 2, 0, 0, 0)
    expect(formatClockTime(date.getTime())).toBe('00:00:00')
  })

  it('accepts an ISO/date string', () => {
    const date = new Date(2024, 0, 2, 14, 30, 45)
    expect(formatClockTime(date.toISOString())).toBe('14:30:45')
  })

  it('returns "" for null, undefined, empty string, and invalid input', () => {
    expect(formatClockTime(null)).toBe('')
    expect(formatClockTime(undefined)).toBe('')
    expect(formatClockTime('')).toBe('')
    expect(formatClockTime('not-a-date')).toBe('')
    expect(formatClockTime(Number.NaN)).toBe('')
    expect(formatClockTime(Number.POSITIVE_INFINITY)).toBe('')
  })
})

describe('createClockGutterDeduper', () => {
  const at = (h: number, m: number, s: number) => new Date(2024, 0, 2, h, m, s).getTime()

  it('prints the first occurrence and blanks consecutive same-second rows', () => {
    const gutter = createClockGutterDeduper()
    expect(gutter(at(9, 5, 7))).toBe('09:05:07')
    // Same second → blanked.
    expect(gutter(at(9, 5, 7))).toBe('')
    expect(gutter(at(9, 5, 7))).toBe('')
    // New second → printed again.
    expect(gutter(at(9, 5, 8))).toBe('09:05:08')
  })

  it('resets the run on a blank/invalid input so the next identical time re-prints', () => {
    const gutter = createClockGutterDeduper()
    expect(gutter(at(9, 5, 7))).toBe('09:05:07')
    // An invalid row resets the previous-tracking.
    expect(gutter('not-a-date')).toBe('')
    expect(gutter(undefined)).toBe('')
    // The same time as before now prints again because the run was reset.
    expect(gutter(at(9, 5, 7))).toBe('09:05:07')
  })

  it('is independent per instance (no shared module state)', () => {
    const a = createClockGutterDeduper()
    const b = createClockGutterDeduper()
    expect(a(at(1, 2, 3))).toBe('01:02:03')
    // A second, fresh deduper has no memory of the first.
    expect(b(at(1, 2, 3))).toBe('01:02:03')
  })
})
