import { vi } from 'vitest'

/**
 * Stub `globalThis.matchMedia` with a controllable reduced-motion preference and
 * a no-op event-listener pair, so components using the timing hooks render
 * cleanly under jsdom. Returns the mock for assertions.
 */
export function stubMatchMedia(reducedMotion = false) {
  const mql = {
    matches: reducedMotion,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  const fn = vi.fn().mockReturnValue(mql)
  vi.stubGlobal('matchMedia', fn)
  return { mql, fn }
}
