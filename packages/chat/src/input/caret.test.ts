/**
 * Caret-measurement tests.
 *
 * jsdom does not run layout, so `offsetLeft`/`offsetTop` are 0; these tests
 * therefore drive the FUNCTION's branches (style mirroring, line-height parsing
 * with the `normal` fallback, trailing-newline placeholder, empty-tail marker
 * fallback, scroll subtraction) rather than asserting real pixel geometry. The
 * mirror div is appended to and removed from `document.body`, which is exercised
 * and asserted clean.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computePopupAnchor, getCaretCoords } from './caret'

function makeTextarea(value: string, lineHeight: string, fontSize = '16px') {
  const textarea = document.createElement('textarea')
  textarea.value = value
  document.body.appendChild(textarea)
  // jsdom returns empty strings for most computed styles; stub the ones the
  // util reads so the parse branches are deterministic.
  const original = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
    if (el === textarea) {
      const style = original(textarea)
      return new Proxy(style, {
        get(target, prop) {
          if (prop === 'lineHeight') return lineHeight
          if (prop === 'fontSize') return fontSize
          return Reflect.get(target, prop)
        },
      }) as CSSStyleDeclaration
    }
    return original(el)
  })
  return textarea
}

describe('getCaretCoords', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('returns numeric coords and a parsed line height', () => {
    const textarea = makeTextarea('hello world', '20px')
    const coords = getCaretCoords(textarea, 5)
    expect(coords.height).toBe(20)
    expect(typeof coords.left).toBe('number')
    expect(typeof coords.top).toBe('number')
    // Mirror is cleaned up.
    expect(document.querySelectorAll('div').length).toBe(0)
  })

  it('falls back to ~1.2x font size when line-height is "normal"', () => {
    const textarea = makeTextarea('abc', 'normal', '10px')
    const coords = getCaretCoords(textarea, 3)
    expect(coords.height).toBeCloseTo(12)
  })

  it('falls back to a default line height when font size is also unresolved', () => {
    const textarea = makeTextarea('abc', 'normal', 'auto')
    const coords = getCaretCoords(textarea, 3)
    expect(coords.height).toBe(20)
  })

  it('measures a caret at the start of a new line without offsetting it', () => {
    const textarea = makeTextarea('line1\n', '20px')
    // Caret after the trailing newline: the marker lands at column 0 of the new
    // line with no prepended placeholder space (which would mis-anchor it).
    const coords = getCaretCoords(textarea, 6)
    expect(coords.height).toBe(20)
    // offsetLeft is 0 in jsdom; the key assertion is no extra offset is added.
    expect(coords.left).toBe(0)
  })

  it('uses a "." marker when there is no text after the caret', () => {
    const textarea = makeTextarea('abc', '20px')
    const coords = getCaretCoords(textarea, 3)
    expect(coords).toBeDefined()
  })

  it('subtracts the textarea scroll offsets', () => {
    const textarea = makeTextarea('abc', '20px')
    Object.defineProperty(textarea, 'scrollLeft', { value: 7, configurable: true })
    Object.defineProperty(textarea, 'scrollTop', { value: 9, configurable: true })
    const coords = getCaretCoords(textarea, 1)
    // offsetLeft/offsetTop are 0 in jsdom, so the result equals -scroll.
    expect(coords.left).toBe(-7)
    expect(coords.top).toBe(-9)
  })

  it('uses window as the default view when ownerDocument has none', () => {
    // A textarea in a detached document has `defaultView === null`, forcing the
    // `?? window` fallback — without mutating the shared global document (which
    // would break user-event's window lookup in later tests).
    const detached = document.implementation.createHTMLDocument('t')
    const textarea = detached.createElement('textarea')
    textarea.value = 'abc'
    detached.body.appendChild(textarea)
    expect(textarea.ownerDocument.defaultView).toBeNull()
    const real = window.getComputedStyle.bind(window)
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      () =>
        new Proxy(real(document.createElement('textarea')), {
          get(target, prop) {
            if (prop === 'lineHeight') return '20px'
            return Reflect.get(target, prop)
          },
        }) as CSSStyleDeclaration,
    )
    const coords = getCaretCoords(textarea, 1)
    expect(coords.height).toBe(20)
  })
})

describe('computePopupAnchor', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  /**
   * A textarea whose caret height (line-height), bounding rect, and viewport
   * height (via its document's `defaultView.innerHeight`) are stubbed.
   */
  function anchored(rectTop: number, viewportHeight: number, lineHeight = '20px') {
    const textarea = makeTextarea('abc', lineHeight)
    vi.spyOn(textarea, 'getBoundingClientRect').mockReturnValue({
      top: rectTop,
      left: 30,
      bottom: rectTop + 24,
      right: 200,
      width: 170,
      height: 24,
      x: 30,
      y: rectTop,
      toJSON: () => ({}),
    } as DOMRect)
    const view = textarea.ownerDocument.defaultView as Window
    vi.spyOn(view, 'innerHeight', 'get').mockReturnValue(viewportHeight)
    return textarea
  }

  it('anchors below the caret when there is room (no flip)', () => {
    const textarea = anchored(40, 1000)
    const anchor = computePopupAnchor(textarea, 1, 220)
    expect(anchor.flip).toBe(false)
    // top = rect.top(40) + caret.top(0) + height(20) = 60; left = rect.left(30).
    expect(anchor.top).toBe(60)
    expect(anchor.left).toBe(30)
  })

  it('flips above the caret when there is no room below but room above', () => {
    // caretViewportTop = 700; spaceBelow = 720 - (700 + 20) = 0 < 220, and
    // caretViewportTop 700 > 220 → flip.
    const textarea = anchored(700, 720)
    const anchor = computePopupAnchor(textarea, 1, 220)
    expect(anchor.flip).toBe(true)
    expect(anchor.top).toBe(700)
  })

  it('does NOT flip when there is no room below AND no room above', () => {
    // caretViewportTop = 10; spaceBelow small, but 10 < 220 so it cannot flip.
    const textarea = anchored(10, 40)
    const anchor = computePopupAnchor(textarea, 1, 220)
    expect(anchor.flip).toBe(false)
  })

  it('treats a detached element (no view) as zero viewport height', () => {
    const detached = document.implementation.createHTMLDocument('t')
    const textarea = detached.createElement('textarea')
    detached.body.appendChild(textarea)
    expect(textarea.ownerDocument.defaultView).toBeNull()
    const anchor = computePopupAnchor(textarea, 0, 220)
    // viewportHeight 0 → spaceBelow negative, caretTop 0 not > 220 → no flip.
    expect(anchor.flip).toBe(false)
  })
})
