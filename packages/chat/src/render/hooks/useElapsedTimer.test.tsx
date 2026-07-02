import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useElapsedTimer } from './useElapsedTimer'
import type { ElapsedTimerInput } from './useElapsedTimer'

function Probe(props: ElapsedTimerInput) {
  const elapsed = useElapsedTimer(props)
  return <span data-testid="elapsed">{elapsed}</span>
}

const value = () => Number(screen.getByTestId('elapsed').textContent)

describe('useElapsedTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the finalized duration verbatim, ignoring the ticker', () => {
    render(<Probe isActive={false} startedAt={0} durationMs={4200} />)
    expect(value()).toBe(4200)
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(value()).toBe(4200)
  })

  it('ticks while active, recomputing from startedAt (survives remount)', () => {
    vi.setSystemTime(1000)
    const { unmount } = render(<Probe isActive startedAt={0} />)
    expect(value()).toBe(1000)
    // advanceTimersByTime moves the fake Date clock AND fires the interval.
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(value()).toBe(3000)
    unmount()
    // Remount mid-stream: elapsed continues from real elapsed since startedAt.
    vi.setSystemTime(5000)
    render(<Probe isActive startedAt={0} />)
    expect(value()).toBe(5000)
  })

  it('reports 0 when startedAt is missing or not finite', () => {
    render(<Probe isActive />)
    expect(value()).toBe(0)
  })

  it('reports 0 when startedAt is non-finite', () => {
    render(<Probe isActive startedAt={Number.NaN} />)
    expect(value()).toBe(0)
  })

  it('reports 0 when elapsed would be negative (future startedAt)', () => {
    vi.setSystemTime(0)
    render(<Probe isActive startedAt={10_000} />)
    expect(value()).toBe(0)
  })

  it('does not tick when inactive and no finalized duration', () => {
    vi.setSystemTime(2000)
    render(<Probe isActive={false} startedAt={0} />)
    expect(value()).toBe(2000)
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    // No interval armed; value stays as last render even as the clock advances.
    expect(value()).toBe(2000)
  })

  it('ignores a negative finalized duration and falls back to live elapsed', () => {
    vi.setSystemTime(1500)
    render(<Probe isActive startedAt={0} durationMs={-1} />)
    expect(value()).toBe(1500)
  })

  it('ticks every 100ms by default so pills count up in tenths', () => {
    render(<Probe isActive startedAt={0} />)
    expect(value()).toBe(0)
    // One default tick (100ms) is enough to re-render with the new elapsed —
    // a 1s default would leave the value at 0 here.
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(value()).toBe(100)
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(value()).toBe(400)
  })

  it('honors a custom interval', () => {
    render(<Probe isActive startedAt={0} intervalMs={500} />)
    expect(value()).toBe(0)
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(value()).toBe(500)
  })
})
