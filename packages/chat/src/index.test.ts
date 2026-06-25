import { describe, expect, it } from 'vitest'
import { cx, version } from './index'

describe('version', () => {
  it('exposes a non-empty string version', () => {
    expect(typeof version).toBe('string')
    expect(version.length).toBeGreaterThan(0)
  })
})

describe('cx', () => {
  it('returns an empty string with no arguments', () => {
    expect(cx()).toBe('')
  })

  it('joins truthy string values with a single space', () => {
    expect(cx('a', 'b', 'c')).toBe('a b c')
  })

  it('ignores all falsy values', () => {
    expect(cx('a', false, null, undefined, 0, '', 'b')).toBe('a b')
  })

  it('stringifies non-empty numbers', () => {
    expect(cx('a', 1, 2)).toBe('a 1 2')
  })

  it('flattens nested arrays recursively', () => {
    expect(cx('a', ['b', ['c', false, 'd']], 'e')).toBe('a b c d e')
  })

  it('drops nested arrays that produce no output', () => {
    expect(cx('a', [false, null, []], 'b')).toBe('a b')
  })
})
