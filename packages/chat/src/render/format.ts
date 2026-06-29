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

/**
 * Format an epoch-ms (or ISO-string) timestamp as a local 24-hour `HH:MM:SS`
 * clock label, zero-padded. Built manually from `Date` math (NOT
 * `toLocaleTimeString`) so every output is constant-width and locale-stable.
 * SSR-safe (pure `Date` math, no DOM). Returns `''` for `null`, `undefined`,
 * the empty string, or any non-finite / invalid input so callers can render an
 * empty (but width-reserving) gutter cell.
 */
export function formatClockTime(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const date = new Date(value)
  const ms = date.getTime()
  if (!Number.isFinite(ms)) return ''
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

/**
 * Create a stateful de-duper for clock-gutter cells. The returned function
 * formats a timestamp via {@link formatClockTime} and returns `''` when the
 * formatted value equals the immediately-previous NON-EMPTY formatted value —
 * so a run of consecutive rows sharing the same `HH:MM:SS` shows the time once
 * (on the first row) and blanks the rest. A blank/invalid input (formatting to
 * `''`) resets the run, so the next identical time prints again.
 *
 * Pure per instance (no shared module state): each call to this factory yields
 * an independent de-duper. Because the returned closure is mutable, it MUST NOT
 * be shared across React component renders — a shared instance desyncs under
 * StrictMode/concurrent re-renders (render impurity). Each `MessageItem` creates
 * its OWN per-render instance and feeds it that message's rows top-to-bottom, so
 * de-dupe is deterministic per render.
 */
export function createClockGutterDeduper(): (value: number | string | null | undefined) => string {
  let previous = ''
  return (value) => {
    const clock = formatClockTime(value)
    if (clock === '') {
      // A blank/invalid row resets the run so the next identical time prints.
      previous = ''
      return ''
    }
    if (clock === previous) return ''
    previous = clock
    return clock
  }
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
