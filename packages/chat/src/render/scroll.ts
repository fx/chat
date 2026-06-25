/**
 * Scroll-to-message utility built on the `data-message-id` anchor contract.
 *
 * SSR-safe: guards `document` so importing/calling in a non-DOM context is a
 * no-op. Honors `prefers-reduced-motion` by switching to an instant jump.
 */

/** True when the environment prefers reduced motion (SSR-safe). */
export function prefersReducedMotion(): boolean {
  // Optional call keeps this SSR-safe: a missing `matchMedia` global yields
  // `undefined`, coerced to `false`. `globalThis.matchMedia` is defined in
  // browsers (and jsdom) and absent under SSR.
  const mql = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')
  return mql?.matches ?? false
}

/**
 * Find the element carrying `data-message-id === id`.
 *
 * Uses `CSS.escape` to build a safe selector when available; otherwise scans
 * `[data-message-id]` elements and compares the attribute value directly. The
 * scan avoids constructing a dynamic selector entirely, so arbitrary id strings
 * (newlines, quotes, control characters) can never throw a `SyntaxError` or
 * require `CSS.escape`.
 */
function findMessageElement(id: string): Element | null {
  const cssEscape = (globalThis as { CSS?: { escape?: (v: string) => string } }).CSS?.escape
  if (cssEscape) return document.querySelector(`[data-message-id="${cssEscape(id)}"]`)
  for (const el of document.querySelectorAll('[data-message-id]')) {
    if (el.getAttribute('data-message-id') === id) return el
  }
  return null
}

/**
 * Scroll the message whose `id` matches into view via its
 * `[data-message-id="<id>"]` wrapper.
 *
 * Returns `true` when a matching element was found and scrolled, `false`
 * otherwise (no DOM, or no matching message). Uses smooth scrolling unless the
 * user prefers reduced motion, in which case it jumps instantly.
 */
export function scrollToMessage(id: string): boolean {
  if (typeof document === 'undefined') return false
  const el = findMessageElement(id)
  if (!el) return false
  el.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'start',
  })
  return true
}
