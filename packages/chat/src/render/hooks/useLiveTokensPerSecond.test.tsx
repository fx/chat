import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MessageMetrics } from '../../model'
import { useLiveTokensPerSecond } from './useLiveTokensPerSecond'
import type { LiveTokensInput } from './useLiveTokensPerSecond'

function Probe(props: LiveTokensInput) {
  const rate = useLiveTokensPerSecond(props)
  return <span data-testid="tps">{rate === undefined ? 'none' : rate.toFixed(2)}</span>
}

const value = () => screen.getByTestId('tps').textContent

describe('useLiveTokensPerSecond', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('estimates live rate from tokenCount over elapsed while active', () => {
    vi.setSystemTime(2000)
    render(<Probe isActive startedAt={0} tokenCount={10} />)
    // 10 tokens over 2s = 5 tok/s.
    expect(value()).toBe('5.00')
    // advanceTimersByTime advances the fake Date clock to 4000 and fires the tick.
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    // 10 tokens over 4s = 2.5 tok/s.
    expect(value()).toBe('2.50')
  })

  it('returns none while active without a startedAt', () => {
    render(<Probe isActive tokenCount={10} />)
    expect(value()).toBe('none')
  })

  it('prefers a provider tokensPerSecond when complete', () => {
    const metrics: MessageMetrics = { tokensPerSecond: 42 }
    render(<Probe isActive={false} startedAt={0} tokenCount={5} metrics={metrics} />)
    expect(value()).toBe('42.00')
  })

  it('derives from usage.completion over durationMs when no provider rate', () => {
    const metrics: MessageMetrics = { usage: { completion: 30 }, durationMs: 3000 }
    render(<Probe isActive={false} metrics={metrics} />)
    expect(value()).toBe('10.00')
  })

  it('uses the cached last-live estimate as the finalized fallback (no drift)', () => {
    vi.setSystemTime(2000)
    const { rerender } = render(<Probe isActive startedAt={0} tokenCount={10} />)
    // Active: 10 tokens over 2s = 5 tok/s (this estimate is cached).
    expect(value()).toBe('5.00')
    // Complete with no provider/usage metrics → fall back to the cached snapshot.
    rerender(<Probe isActive={false} startedAt={0} tokenCount={10} />)
    expect(value()).toBe('5.00')
    // A later parent re-render after the wall clock advances must NOT drift.
    act(() => {
      vi.setSystemTime(20_000)
    })
    rerender(<Probe isActive={false} startedAt={0} tokenCount={10} />)
    expect(value()).toBe('5.00')
  })

  it('resets the cached estimate when a new stream (new startedAt) begins', () => {
    vi.setSystemTime(2000)
    const { rerender } = render(<Probe isActive startedAt={0} tokenCount={10} />)
    // First stream caches 5 tok/s and completes by falling back to it.
    expect(value()).toBe('5.00')
    rerender(<Probe isActive={false} startedAt={0} tokenCount={10} />)
    expect(value()).toBe('5.00')
    // A NEW stream (different startedAt) that never yields a rate must NOT show
    // the previous stream's cached value once complete.
    rerender(<Probe isActive startedAt={2000} />)
    rerender(<Probe isActive={false} startedAt={2000} />)
    expect(value()).toBe('none')
  })

  it('returns none when complete with only startedAt + tokens but never streamed', () => {
    // No active phase ran, so there is no cached live estimate to fall back on.
    vi.setSystemTime(5000)
    render(<Probe isActive={false} startedAt={0} tokenCount={20} />)
    expect(value()).toBe('none')
  })

  it('returns none when complete with no derivable rate', () => {
    render(<Probe isActive={false} />)
    expect(value()).toBe('none')
  })

  it('returns none for a non-positive provider rate (ignored), then derives', () => {
    const metrics: MessageMetrics = {
      tokensPerSecond: 0,
      usage: { completion: 12 },
      durationMs: 2000,
    }
    render(<Probe isActive={false} metrics={metrics} />)
    expect(value()).toBe('6.00')
  })

  it('returns none when usage present but durationMs missing and no startedAt', () => {
    const metrics: MessageMetrics = { usage: { completion: 12 } }
    render(<Probe isActive={false} metrics={metrics} />)
    expect(value()).toBe('none')
  })

  it('returns none for a non-positive tokenCount while active', () => {
    vi.setSystemTime(1000)
    render(<Probe isActive startedAt={0} tokenCount={0} />)
    expect(value()).toBe('none')
  })

  it('does not arm a ticker for a zero interval', () => {
    vi.setSystemTime(1000)
    render(<Probe isActive startedAt={0} tokenCount={5} intervalMs={0} />)
    // Initial estimate renders, but no interval is armed (no tight loop).
    expect(value()).toBe('5.00')
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    // The displayed value does not change because the ticker never armed.
    expect(value()).toBe('5.00')
  })

  it('does not arm a ticker for a non-finite interval', () => {
    vi.setSystemTime(1000)
    render(<Probe isActive startedAt={0} tokenCount={5} intervalMs={Number.NaN} />)
    expect(value()).toBe('5.00')
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(value()).toBe('5.00')
  })

  it('honors a custom interval', () => {
    vi.setSystemTime(1000)
    render(<Probe isActive startedAt={0} tokenCount={5} intervalMs={250} />)
    // 5 tokens over 1s = 5 tok/s at first render.
    expect(value()).toBe('5.00')
    act(() => {
      vi.advanceTimersByTime(250)
    })
    // 5 tokens over 1.25s = 4 tok/s.
    expect(value()).toBe('4.00')
  })
})
