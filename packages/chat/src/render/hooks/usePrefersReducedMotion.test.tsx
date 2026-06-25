import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

function Probe() {
  const reduced = usePrefersReducedMotion()
  return <span data-testid="rm">{reduced ? 'reduced' : 'full'}</span>
}

const state = () => screen.getByTestId('rm').textContent

describe('usePrefersReducedMotion', () => {
  const originalMatchMedia = window.matchMedia
  afterEach(() => {
    window.matchMedia = originalMatchMedia
    vi.unstubAllGlobals()
  })

  it('reads the initial preference and subscribes to changes', () => {
    let handler: (() => void) | undefined
    const mql = {
      matches: false,
      addEventListener: vi.fn((_: string, cb: () => void) => {
        handler = cb
      }),
      removeEventListener: vi.fn(),
    }
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql))
    render(<Probe />)
    expect(state()).toBe('full')
    // Flip the query and fire the change listener.
    mql.matches = true
    act(() => {
      handler?.()
    })
    expect(state()).toBe('reduced')
  })

  it('removes its listener on unmount', () => {
    const mql = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql))
    const { unmount } = render(<Probe />)
    unmount()
    expect(mql.removeEventListener).toHaveBeenCalledTimes(1)
  })

  it('defaults to full motion when matchMedia is unavailable (SSR)', () => {
    vi.stubGlobal('matchMedia', undefined)
    render(<Probe />)
    expect(state()).toBe('full')
  })

  it('falls back to legacy addListener/removeListener when modern API is absent', () => {
    let handler: (() => void) | undefined
    const mql = {
      matches: false,
      addListener: vi.fn((cb: () => void) => {
        handler = cb
      }),
      removeListener: vi.fn(),
      // No addEventListener/removeEventListener (legacy Safari).
    }
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql))
    const { unmount } = render(<Probe />)
    expect(mql.addListener).toHaveBeenCalledTimes(1)
    mql.matches = true
    act(() => {
      handler?.()
    })
    expect(state()).toBe('reduced')
    unmount()
    expect(mql.removeListener).toHaveBeenCalledTimes(1)
  })

  it('does not throw when neither modern nor legacy listener APIs exist', () => {
    const mql = { matches: true }
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql))
    const { unmount } = render(<Probe />)
    // Initial read still reflects matches via the effect's onChange().
    expect(state()).toBe('reduced')
    expect(() => unmount()).not.toThrow()
  })
})
