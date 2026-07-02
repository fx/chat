/**
 * `useElapsedTimer` — epoch-driven elapsed-time hook.
 *
 * Derives elapsed milliseconds purely from a `startedAt` epoch timestamp and an
 * `isActive` flag, ticking on an interval while active so the displayed value
 * survives component remounts (it is recomputed from `Date.now() - startedAt`,
 * never accumulated in state). The default 100ms tick lets timer pills count up
 * in tenths of a second, matching the display precision of `formatDuration`;
 * the interval is per-row and only armed while active, so in practice only the
 * one actively-streaming row pays for it. A finalized `durationMs` always wins
 * over the live ticker. Guards against `NaN`/missing inputs by reporting `0`.
 */
import { useEffect, useState } from 'react'

/** Input to {@link useElapsedTimer}. */
export interface ElapsedTimerInput {
  /** Epoch-ms timestamp the activity began, when known. */
  startedAt?: number | undefined
  /** Whether the activity is currently in progress. */
  isActive: boolean
  /** Finalized wall-clock duration in ms; takes precedence when provided. */
  durationMs?: number | undefined
  /**
   * Tick interval in ms while active (default 100, so a live timer pill ticks
   * up in tenths — matching the `X.Xs` display precision of `formatDuration`).
   * The interval is per-row and only armed while active, so the cost is one
   * 100ms interval per actively-streaming row — effectively one.
   */
  intervalMs?: number | undefined
}

/** Compute live elapsed ms from `startedAt`, clamped and NaN-guarded. */
function computeElapsed(startedAt: number | undefined): number {
  if (startedAt === undefined || !Number.isFinite(startedAt)) return 0
  const delta = Date.now() - startedAt
  return delta > 0 && Number.isFinite(delta) ? delta : 0
}

/**
 * Returns the elapsed duration in milliseconds. While `isActive` and no
 * finalized `durationMs` is set, it ticks every `intervalMs` recomputing from
 * `startedAt`. When `durationMs` is provided, that value is returned verbatim.
 */
export function useElapsedTimer({
  startedAt,
  isActive,
  durationMs,
  intervalMs = 100,
}: ElapsedTimerInput): number {
  const finalized = durationMs !== undefined && Number.isFinite(durationMs) && durationMs >= 0
  const [, setTick] = useState(0)

  useEffect(() => {
    // Only arm the ticker for a genuinely live timer with a usable interval —
    // an invalid `startedAt` or a non-positive/non-finite `intervalMs` would
    // otherwise spin a useless (or hot-looping) interval.
    if (finalized || !isActive) return
    if (!Number.isFinite(startedAt) || !Number.isFinite(intervalMs) || intervalMs <= 0) return
    const handle = setInterval(() => setTick((n) => n + 1), intervalMs)
    return () => clearInterval(handle)
  }, [finalized, isActive, startedAt, intervalMs])

  if (finalized) return durationMs as number
  return computeElapsed(startedAt)
}
