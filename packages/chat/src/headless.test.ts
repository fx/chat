import { describe, expect, it } from 'vitest'
import { headlessRegistry, isHeadlessSlot } from './headless'

describe('headlessRegistry', () => {
  it('exposes the known slot names', () => {
    expect(Object.keys(headlessRegistry).sort()).toEqual(['Message', 'Root'])
  })

  it('ships placeholder (null) slots at bootstrap', () => {
    expect(headlessRegistry.Root).toBeNull()
    expect(headlessRegistry.Message).toBeNull()
  })
})

describe('isHeadlessSlot', () => {
  it('returns true for known slots', () => {
    expect(isHeadlessSlot('Root')).toBe(true)
    expect(isHeadlessSlot('Message')).toBe(true)
  })

  it('returns false for unknown slots', () => {
    expect(isHeadlessSlot('Nope')).toBe(false)
    expect(isHeadlessSlot('toString')).toBe(false)
  })
})
