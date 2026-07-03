/**
 * Pure formatting helpers for the render layer. No React, no DOM.
 */
import type { ContentBlock } from '../model'
import type { RenderableBlock } from './extensions'

/**
 * Format a duration in milliseconds human-readably:
 * - `< 60s` → `X.Xs` (one decimal; sub-second values render as tenths,
 *   `0.0s`–`0.9s` — there is no `<1s` floor)
 * - otherwise → `Xm Ys` (whole minutes + whole seconds)
 *
 * The sub-minute gate applies to the ROUNDED value: inputs in `[59.95s, 60s)`
 * round up to the minute via `toFixed(1)` and render `1m 0s`, never `60.0s`.
 *
 * Negative, `NaN`, or non-finite inputs are clamped to `0` so the output is
 * always a stable, sensible string (`0.0s`).
 */
export function formatDuration(ms: number): string {
  const safe = Number.isFinite(ms) && ms > 0 ? ms : 0
  const totalSeconds = safe / 1000
  // Format first, then gate on the rounded label: [59.95s, 60s) passes
  // `totalSeconds < 60` but rounds to '60.0', which belongs to the minutes path.
  const label = totalSeconds.toFixed(1)
  if (totalSeconds < 60 && label !== '60.0') return `${label}s`
  // Minutes path; use the rounded-up minute for inputs whose label hit '60.0'.
  const minuteSeconds = label === '60.0' ? 60 : totalSeconds
  const minutes = Math.floor(minuteSeconds / 60)
  const seconds = Math.floor(minuteSeconds % 60)
  return `${minutes}m ${seconds}s`
}

/**
 * Format a tokens/second rate as `N.N tok/s`. Non-finite or non-positive
 * inputs — and tiny positive rates that would ROUND to `0.0` (anything below
 * 0.05, e.g. one token over a long stall on the live path) — yield `undefined`
 * so callers render nothing rather than a zero rate.
 */
export function formatTokensPerSecond(rate: number | undefined): string | undefined {
  if (rate === undefined || !Number.isFinite(rate) || rate <= 0) return undefined
  const label = rate.toFixed(1)
  // A positive rate in (0, 0.05) still formats as '0.0' — suppress it too.
  if (label === '0.0') return undefined
  return `${label} tok/s`
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

/**
 * Approximate a message's generated token count from its content: the summed
 * character length of its `text` and `reasoning` blocks divided by 4 (the
 * common chars-per-token heuristic), rounded to the nearest integer. Other
 * block kinds (tool calls, status, system, custom) carry no generated prose
 * and are ignored. Returns `undefined` when the estimate rounds to 0 (no
 * countable content) so callers treat it as "no data" rather than a zero rate.
 * Robust to malformed (codec-bypassing) blocks: a text/reasoning-typed block
 * without a string `text` counts as zero characters instead of throwing.
 */
export function approxTokenCount(blocks: readonly RenderableBlock[]): number | undefined {
  let chars = 0
  for (const block of blocks) {
    if (block.type === 'text' || block.type === 'reasoning') {
      const { text } = block as Partial<Extract<ContentBlock, { type: 'text' | 'reasoning' }>>
      if (typeof text === 'string') chars += text.length
    }
  }
  const tokens = Math.round(chars / 4)
  return tokens > 0 ? tokens : undefined
}
