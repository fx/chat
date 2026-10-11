import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFlashComplete } from './index'

function Probe({ isActive, duration }: { isActive: boolean; duration?: number }) {
  const flashing = useFlashComplete(isActive, duration)
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
})
