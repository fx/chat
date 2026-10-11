/**
 * Redirect detection for requests made with `redirect: 'manual'`. Shared by
 * the endpoint client (which must keep the API key on the configured base URL)
 * and the fetch tool (where every loaded URL needs its own approval).
 */

/** The URL without its fragment, normalized, for comparing request and response URLs. */
function comparable(url: string): string {
  const parsed = new URL(url)
  parsed.hash = ''
  return parsed.href
}

/**
 * Whether `response` (to a request for `requested`) is a redirect, and where
 * it points. Returns `undefined` for a normal response; otherwise `target` is
 * the absolute redirect target, or `undefined` when it is not known (an opaque
 * redirect). Also catches transports that followed the redirect anyway despite
 * `redirect: 'manual'`. Never reads the body.
 */
export function redirectOf(
  response: Response,
  requested: string,
): { target: string | undefined } | undefined {
  if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
    const location = response.headers.get('location')
    return { target: location ? new URL(location, requested).href : undefined }
  }
  if (response.redirected || (response.url && comparable(response.url) !== comparable(requested))) {
    return { target: response.url || undefined }
  }
  return undefined
}
