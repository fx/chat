import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClockProvider, createSharedClock, useClock } from './index'
import { useElapsedTimer } from './index'
import { useFlashComplete } from './index'
import { useLiveTokensPerSecond } from './index'

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'],
  })
  vi.setSystemTime(10_000)
})
afterEach(() => vi.useRealTimers())

const renders = { count: 0 }
function Row({ start }: { start: number }) {
  renders.count++
  const ms = useElapsedTimer({ startedAt: start, isActive: true })
  return <span>{ms}</span>
}

describe('shared clock', () => {
  it('drives many live rows from one interval at the provider tick', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    renders.count = 0
    const { container, unmount } = render(
      <ClockProvider tickMs={1000}>
        <Row start={9_000} />
        <Row start={8_000} />
        <Row start={7_000} />
      </ClockProvider>,
    )
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    const before = renders.count
    for (let i = 0; i < 3; i++) {
      act(() => {
        vi.advanceTimersByTime(1000)
      })
    }
    // One re-render per row per tick, all from the one interval.
    expect(renders.count - before).toBe(9)
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    expect(container.textContent).toBe('400050006000')
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('runs only while subscribed, and restarts on demand', () => {
    const clock = createSharedClock(500)
    const fn = vi.fn()
    const stop = clock.subscribe(fn)
    vi.advanceTimersByTime(1000)
    expect(fn).toHaveBeenCalledTimes(2)
    stop()
    expect(vi.getTimerCount()).toBe(0)
    const again = clock.subscribe(fn)
    vi.advanceTimersByTime(500)
    expect(fn).toHaveBeenCalledTimes(3)
    again()
  })

  it('falls back to an own interval and reads the time', () => {
    function Now({ active, every }: { active: boolean; every?: number }) {
      return <span>{useClock(active, every)}</span>
    }
    const { container, rerender } = render(<Now active />)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(container.textContent).toBe('11000')
    rerender(<Now active={false} />)
    expect(vi.getTimerCount()).toBe(0)
    rerender(<Now active every={0} />)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('drives the live tokens/sec estimate from the shared clock', () => {
    function Rate() {
      const rate = useLiveTokensPerSecond({ startedAt: 9_000, isActive: true, tokenCount: 10 })
      return <span>{rate?.toFixed(1)}</span>
    }
    const { container } = render(
      <ClockProvider tickMs={2000}>
        <Rate />
      </ClockProvider>,
    )
    expect(container.textContent).toBe('10.0')
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(container.textContent).toBe('3.3')
  })

  it('can switch the completion flash off', () => {
    function Flash({ active, enabled }: { active: boolean; enabled: boolean }) {
      return <span>{String(useFlashComplete(active, 1200, enabled))}</span>
    }
    const { container, rerender } = render(<Flash active enabled={false} />)
    rerender(<Flash active={false} enabled={false} />)
    expect(container.textContent).toBe('false')
  })
})
