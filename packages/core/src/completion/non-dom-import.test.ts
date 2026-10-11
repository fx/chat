/**
 * Proves the completion contract + reference provider + mention parser are
 * importable and usable in a NON-DOM environment.
 *
 * The test env is jsdom, so `document`/`window` exist globally. To make the
 * no-DOM assertion meaningful we temporarily DELETE those globals, then import
 * the modules fresh (via `vi.resetModules` + dynamic import) and exercise them.
 * If any of these modules touched the DOM at import or in the exercised paths,
 * it would throw a `ReferenceError`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('completion contract + reference provider are DOM-free', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('imports and runs with window/document undefined', async () => {
    vi.stubGlobal('window', undefined)
    vi.stubGlobal('document', undefined)
    vi.resetModules()

    expect(typeof window).toBe('undefined')
    expect(typeof document).toBe('undefined')

    const { referenceProvider } = await import('./reference')
    const { parseMentions, mentionsToSegments } = await import('../mentions')

    // Provider contract round-trip with no DOM available.
    const match = referenceProvider.match('~ap', 3)
    expect(match).toEqual({ query: 'ap', range: [0, 3] })
    const items = referenceProvider.items('ap', new AbortController().signal)
    expect(Array.isArray(items)).toBe(true)
    const applied = referenceProvider.apply({ id: 'apple', label: 'apple' }, '', '')
    expect(applied.value).toBe('~apple ')

    // Mention helpers are pure too.
    expect(parseMentions('@a')).toEqual([{ agentId: 'a', range: [0, 2] }])
    expect(mentionsToSegments('@a')).toHaveLength(1)
  })

  it('imports the types module without DOM (type-only icon import)', async () => {
    vi.stubGlobal('window', undefined)
    vi.stubGlobal('document', undefined)
    vi.resetModules()
    // The contract is types-only, so importing it is a no-op at runtime; this
    // asserts it does not eagerly pull a DOM-dependent module.
    const mod = await import('./types')
    expect(mod).toBeDefined()
  })
})
