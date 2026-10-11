import { describe, expect, it } from 'vitest'
import { approvalArguments } from './approval'

describe('approvalArguments', () => {
  it('pretty-prints clean arguments', () => {
    expect(approvalArguments({ url: 'https://x.test/' })).toBe('{\n  "url": "https://x.test/"\n}')
  })

  it('strips what JSON passes: DEL, C1 CSI and OSC', () => {
    const out = approvalArguments({ a: 'x\u009b2Jy\u007fz\u009d52;c;QQ==\u009cw', 'k\u009b': 1 })
    expect(out).toBe('{\n  "a": "xyzw",\n  "k": 1\n}')
  })

  it('falls back to a plain notice when serialising fails or yields nothing', () => {
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    expect(approvalArguments(cycle)).toBe('(arguments could not be shown)')
    expect(approvalArguments(undefined)).toBe('(no arguments)')
    expect(approvalArguments({ n: 1n })).toBe('(arguments could not be shown)')
  })
})
