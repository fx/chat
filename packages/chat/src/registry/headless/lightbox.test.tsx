import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Lightbox } from './lightbox'

/** Stub `matchMedia` with a controllable reduced-motion preference. */
function stubMatchMedia(reduced: boolean) {
  const mql = { matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() }
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('headless Lightbox', () => {
  beforeEach(() => {
    stubMatchMedia(false)
  })

  it('renders nothing while closed', () => {
    const { container } = render(
      <Lightbox src="https://x/a.png" alt="a" open={false} onClose={() => {}} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders an accessible dialog with the enlarged image and alt as label', () => {
    render(<Lightbox src="https://x/a.png" alt="a cat" open onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-label', 'a cat')
    const img = screen.getByRole('img', { name: 'a cat' })
    expect(img).toHaveAttribute('src', 'https://x/a.png')
  })

  it('forwards className onto the backdrop', () => {
    const { container } = render(
      <Lightbox src="https://x/a.png" alt="a" open onClose={() => {}} className="host-lb" />,
    )
    expect((container.firstChild as HTMLElement).className).toContain('host-lb')
    expect((container.firstChild as HTMLElement).className).toContain('chat-lightbox')
  })

  it('moves focus to the close control on open', () => {
    render(<Lightbox src="https://x/a.png" alt="a" open onClose={() => {}} />)
    expect(screen.getByLabelText('Close')).toHaveFocus()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<Lightbox src="https://x/a.png" alt="a" open onClose={onClose} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when the close control is activated', () => {
    const onClose = vi.fn()
    render(<Lightbox src="https://x/a.png" alt="a" open onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on a backdrop click but not on a dialog-body click', () => {
    const onClose = vi.fn()
    const { container } = render(<Lightbox src="https://x/a.png" alt="a" open onClose={onClose} />)
    // Click on the dialog body: stopped, does not close.
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
    // Click on the backdrop: closes.
    fireEvent.click(container.firstChild as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores non-Tab, non-Escape keys', () => {
    const onClose = vi.fn()
    render(<Lightbox src="https://x/a.png" alt="a" open onClose={onClose} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'a' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('traps Tab forward from the last focusable back to the first', () => {
    render(<Lightbox src="https://x/a.png" alt="a" open onClose={() => {}} />)
    const close = screen.getByLabelText('Close')
    close.focus()
    const dialog = screen.getByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Tab' })
    // Single focusable: wrap keeps focus on the close control.
    expect(close).toHaveFocus()
  })

  it('traps Shift+Tab backward from the first focusable to the last', () => {
    render(<Lightbox src="https://x/a.png" alt="a" open onClose={() => {}} />)
    const close = screen.getByLabelText('Close')
    close.focus()
    const dialog = screen.getByRole('dialog')
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(close).toHaveFocus()
  })

  it('wraps Shift+Tab to the last control when focus is outside the overlay', () => {
    render(<Lightbox src="https://x/a.png" alt="a" open onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    // Move focus out of the overlay (to the body) so `!root.contains(active)`.
    ;(document.activeElement as HTMLElement)?.blur()
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(screen.getByLabelText('Close')).toHaveFocus()
  })

  it('does nothing on forward Tab when focus is outside the overlay', () => {
    const onClose = vi.fn()
    render(<Lightbox src="https://x/a.png" alt="a" open onClose={onClose} />)
    const dialog = screen.getByRole('dialog')
    ;(document.activeElement as HTMLElement)?.blur()
    // Forward Tab with focus on body: active !== last, so no wrap and no close.
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('restores focus to the originating element on close', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    expect(trigger).toHaveFocus()

    const { rerender } = render(<Lightbox src="https://x/a.png" alt="a" open onClose={() => {}} />)
    expect(screen.getByLabelText('Close')).toHaveFocus()

    rerender(<Lightbox src="https://x/a.png" alt="a" open={false} onClose={() => {}} />)
    expect(trigger).toHaveFocus()
    trigger.remove()
  })

  it('does not restore focus when nothing was focused before open', () => {
    // Default active element is <body>: nothing to restore. Closing must not throw.
    const { rerender } = render(<Lightbox src="https://x/a.png" alt="a" open onClose={() => {}} />)
    expect(() =>
      rerender(<Lightbox src="https://x/a.png" alt="a" open={false} onClose={() => {}} />),
    ).not.toThrow()
  })

  it('locks body scroll while open and restores the previous value on close', () => {
    document.body.style.overflow = 'auto'
    const { rerender } = render(<Lightbox src="https://x/a.png" alt="a" open onClose={() => {}} />)
    expect(document.body.style.overflow).toBe('hidden')

    rerender(<Lightbox src="https://x/a.png" alt="a" open={false} onClose={() => {}} />)
    expect(document.body.style.overflow).toBe('auto')
    document.body.style.overflow = ''
  })

  it('restores the prior body overflow when unmounted while open', () => {
    document.body.style.overflow = 'scroll'
    const { unmount } = render(<Lightbox src="https://x/a.png" alt="a" open onClose={() => {}} />)
    expect(document.body.style.overflow).toBe('hidden')

    unmount()
    expect(document.body.style.overflow).toBe('scroll')
    document.body.style.overflow = ''
  })

  it('does not lock body scroll while closed', () => {
    document.body.style.overflow = 'auto'
    render(<Lightbox src="https://x/a.png" alt="a" open={false} onClose={() => {}} />)
    expect(document.body.style.overflow).toBe('auto')
    document.body.style.overflow = ''
  })

  it('marks reduced-motion on the backdrop when the OS prefers reduce', () => {
    stubMatchMedia(true)
    const { container } = render(<Lightbox src="https://x/a.png" alt="a" open onClose={() => {}} />)
    expect(container.firstChild as HTMLElement).toHaveAttribute('data-reduced-motion', 'true')
  })

  it('omits the reduced-motion hook under normal motion', () => {
    const { container } = render(<Lightbox src="https://x/a.png" alt="a" open onClose={() => {}} />)
    expect(container.firstChild as HTMLElement).not.toHaveAttribute('data-reduced-motion')
  })

  it('defaults reduced-motion to false when matchMedia is unavailable', () => {
    vi.unstubAllGlobals()
    // No matchMedia on globalThis: the `?? false` fallback applies (no hook).
    const { container } = render(<Lightbox src="https://x/a.png" alt="a" open onClose={() => {}} />)
    expect(container.firstChild as HTMLElement).not.toHaveAttribute('data-reduced-motion')
  })
})
