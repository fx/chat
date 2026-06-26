import { describe, expect, it } from 'vitest'
import { NON_AUX_BEHAVIOR, isCoreBlockType } from './extensions'

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
