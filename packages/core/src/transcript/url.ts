/**
 * Scheme-safety guard for attachment URLs.
 *
 * Attachment URLs are host-provided data and could carry an active scheme
 * (`javascript:`, `vbscript:`, …) that would turn attachment rendering into an
 * injection vector. The renderer therefore honors only a small allow-list of
 * inert, content-bearing schemes — `http:`, `https:`, `data:`, and `blob:` —
 * and treats everything else as unsafe so it can be rendered inert (no active
 * link or media `src`).
 *
 * This module is pure (no React, no DOM) so it is trivially unit-testable and
 * shared by every attachment renderer.
 */

/** The inert, content-bearing URL schemes the renderer is allowed to load/link. */
const SAFE_SCHEMES = new Set(['http:', 'https:', 'data:', 'blob:'])

/**
 * Returns `true` when `url` uses an allowed scheme (`http(s):`/`data:`/`blob:`).
 *
 * Parsing is done without the WHATWG `URL` constructor so the guard works in any
 * environment and never throws: it extracts the leading `scheme:` token by hand
 * and compares it (case-insensitively) against the allow-list. A value with no
 * scheme (e.g. a bare relative path) is refused — attachments are expected to be
 * absolute, fully-qualified URLs, so the safe default is to treat an ambiguous
 * value as unsafe.
 */
export function isSafeAttachmentUrl(url: string): boolean {
  // A scheme is `ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )` followed by ':'.
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(url.trim())
  if (!match) return false
  return SAFE_SCHEMES.has(`${(match[1] as string).toLowerCase()}:`)
}
