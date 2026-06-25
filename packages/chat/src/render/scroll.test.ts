import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prefersReducedMotion, scrollToMessage } from './scroll'

describe('prefersReducedMotion', () => {
  const originalMatchMedia = window.matchMedia

  afterEach(() => {
    window.matchMedia = originalMatchMedia
    vi.unstubAllGlobals()
  })

  it('returns false when matchMedia is absent (SSR)', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(prefersReducedMotion()).toBe(false)
  })

  it('returns false when matchMedia returns null', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(null))
    expect(prefersReducedMotion()).toBe(false)
  })

  it('reflects the media query match', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    expect(prefersReducedMotion()).toBe(true)
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }))
    expect(prefersReducedMotion()).toBe(false)
  })
})

describe('scrollToMessage', () => {
  const originalMatchMedia = window.matchMedia
  let scrollSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    scrollSpy = vi.fn()
    // jsdom does not implement scrollIntoView.
    Element.prototype.scrollIntoView =
      scrollSpy as unknown as typeof Element.prototype.scrollIntoView
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof matchMedia
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
    document.body.innerHTML = ''
  })

  it('scrolls smoothly to a matching message', () => {
    const el = document.createElement('div')
    el.setAttribute('data-message-id', 'm1')
    document.body.appendChild(el)
    expect(scrollToMessage('m1')).toBe(true)
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('jumps instantly when reduced motion is preferred', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof matchMedia
    const el = document.createElement('div')
    el.setAttribute('data-message-id', 'm2')
    document.body.appendChild(el)
    expect(scrollToMessage('m2')).toBe(true)
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
  })

  it('returns false when no message matches', () => {
    expect(scrollToMessage('missing')).toBe(false)
    expect(scrollSpy).not.toHaveBeenCalled()
  })

  it('escapes ids that contain quotes (via native CSS.escape)', () => {
    const el = document.createElement('div')
    el.setAttribute('data-message-id', 'a"b')
    document.body.appendChild(el)
    expect(scrollToMessage('a"b')).toBe(true)
  })

  it('matches arbitrary ids via attribute scan when CSS.escape is unavailable', () => {
    vi.stubGlobal('CSS', undefined)
    // An id with quotes, a backslash, and a newline would break a naive selector.
    const weird = 'a"b\\c\nd'
    const el = document.createElement('div')
    el.setAttribute('data-message-id', weird)
    document.body.appendChild(el)
    const other = document.createElement('div')
    other.setAttribute('data-message-id', 'unrelated')
    document.body.appendChild(other)
    try {
      expect(scrollToMessage(weird)).toBe(true)
      // No match in fallback mode returns false (loop completes without a hit).
      expect(scrollToMessage('nope')).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('is a no-op when document is undefined (SSR)', () => {
    vi.stubGlobal('document', undefined)
    try {
      expect(scrollToMessage('m1')).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
