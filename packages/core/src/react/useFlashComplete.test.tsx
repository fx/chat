import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClockProvider, useFlashComplete } from './index'

function Probe({
  isActive,
  duration,
  enabled,
}: {
  isActive: boolean
  duration?: number
  enabled?: boolean
}) {
  const flashing = useFlashComplete(isActive, duration, enabled)
  return <span data-testid="flash">{flashing ? 'on' : 'off'}</span>
}

const state = () => screen.getByTestId('flash').textContent

function setReducedMotion(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof matchMedia
}

describe('useFlashComplete', () => {
  const originalMatchMedia = window.matchMedia
  beforeEach(() => {
    vi.useFakeTimers()
    setReducedMotion(false)
  })
  afterEach(() => {
    vi.useRealTimers()
    window.matchMedia = originalMatchMedia
  })

  it('flashes on active → inactive then clears after the duration', () => {
    const { rerender } = render(<Probe isActive />)
    expect(state()).toBe('off')
    rerender(<Probe isActive={false} />)
    expect(state()).toBe('on')
    act(() => {
      vi.advanceTimersByTime(1200)
    })
    expect(state()).toBe('off')
  })

  it('does not flash when staying active', () => {
    const { rerender } = render(<Probe isActive />)
    rerender(<Probe isActive />)
    expect(state()).toBe('off')
  })

  it('honors a custom duration', () => {
    const { rerender } = render(<Probe isActive duration={300} />)
    rerender(<Probe isActive={false} duration={300} />)
    expect(state()).toBe('on')
    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(state()).toBe('on')
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(state()).toBe('off')
  })

  it('suppresses the flash entirely under prefers-reduced-motion', () => {
    setReducedMotion(true)
    const { rerender } = render(<Probe isActive />)
    rerender(<Probe isActive={false} />)
    expect(state()).toBe('off')
  })

  it('re-arms cleanly across repeated transitions', () => {
    const { rerender } = render(<Probe isActive />)
    rerender(<Probe isActive={false} />)
    act(() => {
      vi.advanceTimersByTime(1200)
    })
    rerender(<Probe isActive />)
    rerender(<Probe isActive={false} />)
    expect(state()).toBe('on')
  })

  it('cancels for good when switched off mid-flash, then re-enabled', () => {
    const { rerender } = render(<Probe isActive />)
    rerender(<Probe isActive={false} />)
    expect(state()).toBe('on')
    rerender(<Probe isActive={false} enabled={false} />)
    expect(state()).toBe('off')
    expect(vi.getTimerCount()).toBe(0)
    rerender(<Probe isActive={false} enabled />)
    expect(state()).toBe('off')
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(state()).toBe('off')
  })

  it('cancels for good when reduced motion turns on mid-flash, then off', () => {
    let listener: ((event: { matches: boolean }) => void) | undefined
    let matches = false
    window.matchMedia = vi.fn(() => ({
      get matches() {
        return matches
      },
      addEventListener: (_: string, fn: typeof listener) => {
        listener = fn
      },
      removeEventListener: vi.fn(),
    })) as unknown as typeof matchMedia
    const { rerender } = render(<Probe isActive />)
    rerender(<Probe isActive={false} />)
    expect(state()).toBe('on')
    act(() => {
      matches = true
      listener?.({ matches: true })
    })
    expect(state()).toBe('off')
    act(() => {
      matches = false
      listener?.({ matches: false })
    })
    expect(state()).toBe('off')
  })

  it('cancels a showing flash when a new activity starts', () => {
    const { rerender } = render(<Probe isActive />)
    rerender(<Probe isActive={false} />)
    rerender(<Probe isActive />)
    expect(state()).toBe('off')
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    ['shortened', 500],
    ['lengthened', 2000],
  ])('keeps the original deadline when the duration is %s mid-flash', (_, next) => {
    const { rerender } = render(<Probe isActive duration={1000} />)
    rerender(<Probe isActive={false} duration={1000} />)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    rerender(<Probe isActive={false} duration={next} />)
    expect(state()).toBe('on')
    act(() => {
      vi.advanceTimersByTime(499)
    })
    expect(state()).toBe('on')
    act(() => {
      vi.advanceTimersByTime(101)
    })
    expect(state()).toBe('off')
  })

  describe('inside a shared clock', () => {
    function Clocked(props: {
      isActive: boolean
      enabled?: boolean
      duration?: number
      tickMs?: number
    }) {
      return (
        <ClockProvider tickMs={props.tickMs ?? 500}>
          <Probe duration={1200} {...props} />
        </ClockProvider>
      )
    }

    it('arms no timer of its own and ends on the first tick at or after the duration', () => {
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
      const { rerender, unmount } = render(<Clocked isActive />)
      expect(vi.getTimerCount()).toBe(0)
      rerender(<Clocked isActive={false} />)
      expect(state()).toBe('on')
      expect(setTimeoutSpy).not.toHaveBeenCalled()
      expect(setIntervalSpy).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(1)
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(state()).toBe('on')
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(state()).toBe('off')
      // The clock stops once nothing live subscribes.
      expect(vi.getTimerCount()).toBe(0)
      unmount()
      setTimeoutSpy.mockRestore()
      setIntervalSpy.mockRestore()
    })

    it.each([
      ['shortened', 500],
      ['lengthened', 2000],
    ])('keeps the original deadline when the duration is %s mid-flash', (_, next) => {
      const { rerender } = render(<Clocked isActive duration={1000} tickMs={100} />)
      rerender(<Clocked isActive={false} duration={1000} tickMs={100} />)
      act(() => {
        vi.advanceTimersByTime(400)
      })
      rerender(<Clocked isActive={false} duration={next} tickMs={100} />)
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(state()).toBe('on')
      act(() => {
        vi.advanceTimersByTime(100)
      })
      expect(state()).toBe('off')
    })

    it('unsubscribes when switched off mid-flash and stays off when re-enabled', () => {
      const { rerender } = render(<Clocked isActive />)
      rerender(<Clocked isActive={false} />)
      expect(vi.getTimerCount()).toBe(1)
      rerender(<Clocked isActive={false} enabled={false} />)
      expect(state()).toBe('off')
      expect(vi.getTimerCount()).toBe(0)
      rerender(<Clocked isActive={false} enabled />)
      expect(state()).toBe('off')
      expect(vi.getTimerCount()).toBe(0)
    })
  })
})
