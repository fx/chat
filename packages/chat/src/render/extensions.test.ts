import { describe, expect, it } from 'vitest'
import { NON_AUX_BEHAVIOR, isCoreBlockType, lookupExtension } from './extensions'

describe('isCoreBlockType', () => {
  it('returns true for every core ContentBlock type', () => {
    for (const type of ['text', 'reasoning', 'status', 'system', 'tool_call']) {
      expect(isCoreBlockType(type)).toBe(true)
    }
  })

  it('returns false for a host-defined / unknown type', () => {
    expect(isCoreBlockType('host_marker')).toBe(false)
    expect(isCoreBlockType('')).toBe(false)
    expect(isCoreBlockType('generative_ui')).toBe(false)
  })
})

describe('NON_AUX_BEHAVIOR', () => {
  it('is the safe default: non-aux, not header-eligible', () => {
    expect(NON_AUX_BEHAVIOR).toEqual({ auxEligible: false, eligibleForHeaderSummary: false })
  })
})

describe('lookupExtension', () => {
  it('returns undefined for an undefined map', () => {
    expect(lookupExtension(undefined, 'anything')).toBeUndefined()
  })

  it('returns an own-property value', () => {
    const fn = () => null
    expect(lookupExtension({ search: fn }, 'search')).toBe(fn)
  })

  it('returns undefined for an absent key', () => {
    expect(lookupExtension({ search: () => null }, 'other')).toBeUndefined()
  })

  it('does NOT resolve inherited Object.prototype members (prototype-pollution guard)', () => {
    expect(lookupExtension<unknown>({}, 'constructor')).toBeUndefined()
    expect(lookupExtension<unknown>({}, 'toString')).toBeUndefined()
    expect(lookupExtension<unknown>({}, 'hasOwnProperty')).toBeUndefined()
  })
})
