/**
 * No-network assertion.
 *
 * The demo MUST make no runtime network request — all data is local fixtures.
 * This test spies on every network primitive, renders the full demo shell
 * (controls + panes) through every registry by toggling the compare layout, and
 * asserts none of the network primitives were ever invoked.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

const spies: Record<string, ReturnType<typeof vi.fn>> = {}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }),
  )

  spies.fetch = vi.fn(() => Promise.reject(new Error('network forbidden')))
  vi.stubGlobal('fetch', spies.fetch)

  // XMLHttpRequest.open is the choke point for any XHR.
  spies.xhrOpen = vi.fn()
  vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(spies.xhrOpen)

  // sendBeacon may be absent in jsdom; stub it so a call would be observed.
  spies.beacon = vi.fn()
  vi.stubGlobal('navigator', {
    ...globalThis.navigator,
    sendBeacon: spies.beacon,
    clipboard: { writeText: vi.fn(() => Promise.resolve()) },
  })

  spies.ws = vi.fn()
  vi.stubGlobal(
    'WebSocket',
    class {
      constructor(...args: unknown[]) {
        spies.ws?.(...args)
      }
    },
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('no runtime network', () => {
  it('renders the demo through all registries and streaming with zero network calls', () => {
    render(<App />)

    // Drive the demo across every surface that could plausibly fetch:
    // - the compare layout renders all three registries at once,
    // - the streaming fixture runs the timing driver.
    act(() => {
      fireEvent.change(screen.getByLabelText('Layout'), { target: { value: 'compare' } })
      fireEvent.change(screen.getByLabelText('Fixture'), { target: { value: 'streaming' } })
    })

    // Advance the virtual clock through the whole stream window.
    act(() => {
      vi.advanceTimersByTime(10_000)
    })

    expect(spies.fetch).not.toHaveBeenCalled()
    expect(spies.xhrOpen).not.toHaveBeenCalled()
    expect(spies.beacon).not.toHaveBeenCalled()
    expect(spies.ws).not.toHaveBeenCalled()
  })
})
