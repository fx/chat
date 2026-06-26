/**
 * Streaming-driver hook tests.
 *
 * Verifies the virtual-clock behavior (advances while active, finalizes, and is
 * reduced-motion-aware) without any real-clock sleeps — the suite's fake timers
 * drive the interval.
 */
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STREAM_DURATION_MS } from './conversation'
import { STREAM_TICK_MS, useStreamingDriver } from './useStreamingDriver'

let reducedMotion = false

function setMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }),
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  reducedMotion = false
  setMatchMedia(reducedMotion)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** A probe component exposing the latest driver state to the test. */
function Probe({
  active,
  onState,
}: {
  active: boolean
  onState: (s: ReturnType<typeof useStreamingDriver>) => void
}) {
  const state = useStreamingDriver(active)
  onState(state)
  return null
}

function streamedText(state: ReturnType<typeof useStreamingDriver>): string {
  const block = state.messages[1].blocks.find((b) => b.type === 'text') as { text: string }
  return block.text
}

describe('useStreamingDriver', () => {
  it('advances the stream over time and finalizes', () => {
    let latest!: ReturnType<typeof useStreamingDriver>
    render(
      <Probe
        active
        onState={(s) => {
          latest = s
        }}
      />,
    )

    const initialLen = streamedText(latest).length
    expect(latest.isStreaming).toBe(true)

    // Advance a few ticks — the revealed text grows.
    act(() => {
      vi.advanceTimersByTime(STREAM_TICK_MS * 5)
    })
    expect(streamedText(latest).length).toBeGreaterThan(initialLen)
    expect(latest.isStreaming).toBe(true)

    // Run to completion — streaming stops.
    act(() => {
      vi.advanceTimersByTime(STREAM_DURATION_MS)
    })
    expect(latest.isStreaming).toBe(false)
  })

  it('jumps straight to the finalized end state under reduced motion (no animation)', () => {
    setMatchMedia(true)
    let latest!: ReturnType<typeof useStreamingDriver>
    render(
      <Probe
        active
        onState={(s) => {
          latest = s
        }}
      />,
    )
    // Effects run on mount; reduced motion sets the finalized state immediately.
    act(() => {
      vi.advanceTimersByTime(0)
    })
    expect(latest.isStreaming).toBe(false)
  })

  it('does not run while inactive', () => {
    let latest!: ReturnType<typeof useStreamingDriver>
    render(
      <Probe
        active={false}
        onState={(s) => {
          latest = s
        }}
      />,
    )
    const before = streamedText(latest).length
    act(() => {
      vi.advanceTimersByTime(STREAM_DURATION_MS)
    })
    // Inactive: the conversation is built at the initial offset and never advances.
    expect(streamedText(latest).length).toBe(before)
  })

  it('replay restarts the stream from the beginning', () => {
    let latest!: ReturnType<typeof useStreamingDriver>
    render(
      <Probe
        active
        onState={(s) => {
          latest = s
        }}
      />,
    )
    act(() => {
      vi.advanceTimersByTime(STREAM_DURATION_MS)
    })
    expect(latest.isStreaming).toBe(false)

    act(() => {
      latest.replay()
    })
    // Restarted: streaming again, with a short revealed prefix.
    expect(latest.isStreaming).toBe(true)
  })
})
