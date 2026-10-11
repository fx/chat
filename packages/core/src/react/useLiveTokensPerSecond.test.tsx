import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MessageMetrics } from '../model'
import { useLiveTokensPerSecond } from './index'
import type { LiveTokensInput } from './index'

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

  it('returns none while active before 300ms has elapsed, even with tokens', () => {
    // Sub-300ms sample windows extrapolate a handful of tokens into an absurd
    // rate — the min-elapsed guard suppresses the estimate entirely.
    vi.setSystemTime(200)
    render(<Probe isActive startedAt={0} tokenCount={10} />)
    expect(value()).toBe('none')
  })

  it('prefers a positive provider rate while ACTIVE (no clock, no min-elapsed window)', () => {
    // A host streaming accurate mid-turn rates beats the chars/elapsed
    // estimate; the provider value needs neither startedAt nor 300ms elapsed.
    vi.setSystemTime(100)
    const metrics: MessageMetrics = { tokensPerSecond: 42 }
    render(<Probe isActive tokenCount={10} metrics={metrics} />)
    expect(value()).toBe('42.00')
  })

  it('caches an active provider rate as the finalized fallback (pill survives finalize)', () => {
    // A provider-rate-only stream (no content worth estimating) that finalizes
    // with metrics carrying NO rate/usage/duration must keep the last known
    // provider rate — the active branch caches it like the estimate path does.
    vi.setSystemTime(100)
    const { rerender } = render(<Probe isActive startedAt={0} metrics={{ tokensPerSecond: 42 }} />)
    expect(value()).toBe('42.00')
    // Finalize with metrics that preserve no rate at all.
    rerender(<Probe isActive={false} startedAt={0} metrics={{}} />)
    expect(value()).toBe('42.00')
  })

  it('resets the cached rate on a new active phase even when startedAt never changes', () => {
    // A reused hook instance across streams that all OMIT startedAt: the
    // startedAt-change reset can't fire, so the inactive → active transition
    // must clear the cache — stream B (no rate) finalizing without metrics
    // must not resurface stream A's 42.
    const { rerender } = render(<Probe isActive metrics={{ tokensPerSecond: 42 }} />)
    expect(value()).toBe('42.00')
    // Stream A finalizes; the cached provider rate carries the pill.
    rerender(<Probe isActive={false} metrics={{}} />)
    expect(value()).toBe('42.00')
    // Stream B begins (same undefined startedAt) with no rate at all.
    rerender(<Probe isActive />)
    expect(value()).toBe('none')
    // Stream B finalizes without metrics: none — not stream A's stale 42.
    rerender(<Probe isActive={false} />)
    expect(value()).toBe('none')
  })

  it('falls through to the estimate for a non-positive provider rate while active', () => {
    vi.setSystemTime(2000)
    const metrics: MessageMetrics = { tokensPerSecond: 0 }
    render(<Probe isActive startedAt={0} tokenCount={10} metrics={metrics} />)
    // 10 tokens over 2s = 5 tok/s.
    expect(value()).toBe('5.00')
  })

  it('does NOT consult usage/durationMs while active (finalized-only inputs)', () => {
    vi.setSystemTime(2000)
    const metrics: MessageMetrics = { usage: { completion: 100 }, durationMs: 1000 }
    const { rerender } = render(<Probe isActive startedAt={0} tokenCount={10} metrics={metrics} />)
    // The estimate (10 tokens / 2s), NOT the usage-derived 100 tok/s.
    expect(value()).toBe('5.00')
    // Without a derivable estimate, the rate is none — usage is still ignored.
    rerender(<Probe isActive startedAt={0} metrics={metrics} />)
    expect(value()).toBe('none')
  })

  it('starts returning estimates once 300ms has elapsed', () => {
    vi.setSystemTime(200)
    render(<Probe isActive startedAt={0} tokenCount={10} intervalMs={100} />)
    expect(value()).toBe('none')
    // The next tick crosses the 300ms threshold: 10 tokens over 0.3s.
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(value()).toBe('33.33')
  })

  it('never caches a sub-300ms estimate as the finalized fallback', () => {
    // The guard sits BEFORE the estimate computation, so an early-window rate
    // cannot enter the cache and resurface once the stream completes.
    vi.setSystemTime(200)
    const { rerender } = render(<Probe isActive startedAt={0} tokenCount={10} />)
    expect(value()).toBe('none')
    rerender(<Probe isActive={false} startedAt={0} tokenCount={10} />)
    expect(value()).toBe('none')
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
