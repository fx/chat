/**
 * Pure formatting helpers for the render layer. No React, no DOM.
 */

/**
 * Format a duration in milliseconds human-readably:
 * - `< 1000ms` → `<1s`
 * - `< 60s` → `X.Xs` (one decimal)
 * - otherwise → `Xm Ys` (whole minutes + whole seconds)
 *
 * Negative, `NaN`, or non-finite inputs are clamped to `0` so the output is
 * always a stable, sensible string.
 */
export function formatDuration(ms: number): string {
  const safe = Number.isFinite(ms) && ms > 0 ? ms : 0
  if (safe < 1000) return '<1s'
  const totalSeconds = safe / 1000
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return `${minutes}m ${seconds}s`
}

/**
 * Format a tokens/second rate as `N.N tok/s`. Non-finite or non-positive
 * inputs yield `undefined` so callers render nothing rather than `0 tok/s`.
 */
export function formatTokensPerSecond(rate: number | undefined): string | undefined {
  if (rate === undefined || !Number.isFinite(rate) || rate <= 0) return undefined
  return `${rate.toFixed(1)} tok/s`
}

/** A finite, positive number, or `undefined`. */
function positive(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined
}

/**
 * Resolve a finalized tokens/second rate from per-message metrics: prefer a
 * provider-reported `tokensPerSecond`, else derive it from `completion` tokens
 * over `durationMs`. Returns `undefined` when neither is derivable.
 */
export function deriveTokensPerSecond(
  tokensPerSecond: number | undefined,
  completion: number | undefined,
  durationMs: number | undefined,
): number | undefined {
  const provided = positive(tokensPerSecond)
  if (provided !== undefined) return provided
  const tokens = positive(completion)
  const duration = positive(durationMs)
  if (tokens !== undefined && duration !== undefined) return tokens / (duration / 1000)
  return undefined
}
