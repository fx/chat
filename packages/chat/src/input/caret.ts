/**
 * Framework-free caret coordinate measurement via the mirror-div technique.
 *
 * `getCaretCoords(textarea, caret)` returns the pixel position (relative to the
 * textarea's border box) of the caret at character offset `caret`, plus the
 * line height. The popup uses this to anchor itself at the caret so it follows
 * the user's typing.
 *
 * How it works: a hidden `<div>` is created with the textarea's text-layout
 * styles copied onto it, the textarea's value up to `caret` is written into it,
 * and a zero-width marker `<span>` is appended at the caret. The marker's offset
 * within the mirror equals the caret's offset within the textarea. Scroll is
 * subtracted so the result is in the textarea's visible coordinate space.
 *
 * SSR-safe: this module references the DOM only inside `getCaretCoords`, which
 * callers invoke from effects/handlers (never during render). Importing the
 * module touches no browser globals.
 */

/** Fallback line height (px) when neither line-height nor font-size resolves. */
const DEFAULT_LINE_HEIGHT = 20

/** Caret coordinates relative to the textarea's border box, plus line height. */
export interface CaretCoords {
  /** Horizontal offset of the caret, in px, from the textarea's left edge. */
  left: number
  /** Vertical offset of the caret's top, in px, from the textarea's top edge. */
  top: number
  /** The line height in px (height of one text line). */
  height: number
}

/**
 * CSS properties copied from the textarea onto the mirror div so its text wraps
 * and lays out identically. Kept explicit (rather than copying the whole
 * computed style) so the mirror stays cheap and predictable.
 */
const MIRRORED_PROPERTIES = [
  'boxSizing',
  'width',
  // Direction + bidi so the mirror lays text out identically in RTL textareas.
  'direction',
  'unicodeBidi',
  'borderLeftWidth',
  'borderRightWidth',
  'borderTopWidth',
  'borderBottomWidth',
  'paddingLeft',
  'paddingRight',
  'paddingTop',
  'paddingBottom',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'fontFamily',
  'lineHeight',
  'letterSpacing',
  'textTransform',
  'textIndent',
  'textAlign',
  'whiteSpace',
  'wordSpacing',
  'wordBreak',
  'overflowWrap',
  'tabSize',
] as const

/**
 * Measure the caret position at character offset `caret` within `textarea`.
 *
 * The returned coordinates are relative to the textarea's border box and already
 * account for the textarea's own scroll position, so callers can place an
 * anchored element by adding the textarea's bounding-rect origin.
 */
export function getCaretCoords(textarea: HTMLTextAreaElement, caret: number): CaretCoords {
  const doc = textarea.ownerDocument
  // Prefer the textarea's own document view; fall back to the global `window`
  // only when it actually exists. In a no-DOM context (SSR) both are absent, so
  // fail DETERMINISTICALLY with a clear message instead of a raw ReferenceError
  // from touching an undefined `window`.
  const win = doc.defaultView ?? (typeof window !== 'undefined' ? window : null)
  if (!win) {
    throw new Error('getCaretCoords requires a browser environment')
  }
  const style = win.getComputedStyle(textarea)

  const mirror = doc.createElement('div')
  for (const prop of MIRRORED_PROPERTIES) {
    mirror.style[prop] = style[prop]
  }
  // Reserve the same vertical scrollbar gutter as the textarea so wrapped-line
  // measurements don't drift when the input is scrollable.
  mirror.style.height = `${textarea.clientHeight}px`
  mirror.style.overflowY = style.overflowY
  // Take the mirror out of flow and hide it while preserving text metrics.
  mirror.style.position = 'absolute'
  mirror.style.top = '0'
  mirror.style.left = '0'
  mirror.style.visibility = 'hidden'
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.overflowWrap = 'break-word'

  // Text up to the caret drives the marker's position. When `head` ends with a
  // newline the marker lands at the START of the next line (column 0) — which is
  // exactly where the caret is — so NO placeholder space is prepended (a space
  // would mis-anchor the marker one column to the right).
  const value = textarea.value
  const head = value.slice(0, caret)
  mirror.textContent = head

  const marker = doc.createElement('span')
  // A non-empty marker so it has a layout box at the caret. The tail text gives
  // it width/position; an empty tail falls back to a single char.
  marker.textContent = value.slice(caret) || '.'
  mirror.appendChild(marker)

  doc.body.appendChild(mirror)
  const lineHeight = Number.parseFloat(style.lineHeight)
  // `lineHeight: normal` yields NaN; fall back to ~1.2x the font size, and to a
  // sane default if the font size is unresolved too (e.g. a detached element).
  const fontSize = Number.parseFloat(style.fontSize)
  const height = Number.isNaN(lineHeight)
    ? Number.isNaN(fontSize)
      ? DEFAULT_LINE_HEIGHT
      : fontSize * 1.2
    : lineHeight
  const coords: CaretCoords = {
    left: marker.offsetLeft - textarea.scrollLeft,
    top: marker.offsetTop - textarea.scrollTop,
    height,
  }
  doc.body.removeChild(mirror)
  return coords
}

/** Fixed-position popup anchor coordinates plus whether it flipped above the caret. */
export interface PopupAnchor {
  /** Left offset in viewport (fixed) coordinates. */
  left: number
  /** Top offset in viewport (fixed) coordinates. */
  top: number
  /** True when the popup is anchored ABOVE the caret to avoid bottom clipping. */
  flip: boolean
}

/**
 * Margin (px) kept between the popup and the viewport edges when clamping the
 * horizontal position so the popup never sits flush against (or off) the screen.
 */
const VIEWPORT_MARGIN = 8

/** Clamp `value` into the inclusive `[min, max]` range. Never returns `< min`. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

/**
 * Compute the fixed-position anchor for a caret-attached popup of approximately
 * `popupHeight` px. Anchors just below the caret normally; flips to anchor at
 * the caret's top (so the popup grows upward) when there is not enough room
 * below AND there is enough room above.
 *
 * Horizontally, the popup is anchored at the caret but CLAMPED so it stays fully
 * on-screen: when the caret sits near the right edge and the popup would overflow
 * (its measured `popupWidth` runs past the viewport), `left` is pulled left so
 * the popup's right edge stays within `viewportWidth - VIEWPORT_MARGIN`; `left`
 * is never less than `VIEWPORT_MARGIN`. When there is room, the caret-anchored
 * position is preserved. Pass the popup's MEASURED width (like `popupHeight` for
 * the vertical flip); when `0`/omitted (pre-measure), no horizontal clamp is
 * applied and the raw caret-anchored left is returned.
 *
 * The viewport height/width are taken from the textarea's own document view
 * (falling back to `0` for a detached element with no view, which disables the
 * flip and the clamp). Pure given a textarea + caret offset: it composes
 * {@link getCaretCoords} with the textarea's bounding rect, so it is
 * unit-testable without real layout.
 */
export function computePopupAnchor(
  textarea: HTMLTextAreaElement,
  caret: number,
  popupHeight: number,
  popupWidth = 0,
): PopupAnchor {
  const c = getCaretCoords(textarea, caret)
  const rect = textarea.getBoundingClientRect()
  const view = textarea.ownerDocument.defaultView
  const viewportHeight = view?.innerHeight ?? 0
  const viewportWidth = view?.innerWidth ?? 0
  const caretViewportTop = rect.top + c.top
  const spaceBelow = viewportHeight - (caretViewportTop + c.height)
  // Flip when there isn't room below AND the caret sits at least `popupHeight`
  // from the viewport top (an exact fit above counts).
  const flip = spaceBelow < popupHeight && caretViewportTop >= popupHeight
  const desiredLeft = rect.left + c.left
  // Clamp horizontally only when we know both the popup width and the viewport
  // width; otherwise keep the raw caret-anchored left. The max bound keeps the
  // popup's right edge on-screen; `clamp` also floors `left` at the margin.
  const left =
    popupWidth > 0 && viewportWidth > 0
      ? clamp(desiredLeft, VIEWPORT_MARGIN, viewportWidth - popupWidth - VIEWPORT_MARGIN)
      : desiredLeft
  return {
    left,
    top: flip ? caretViewportTop : caretViewportTop + c.height,
    flip,
  }
}
