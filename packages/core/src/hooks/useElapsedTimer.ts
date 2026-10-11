/**
 * `useElapsedTimer` — epoch-driven elapsed-time hook.
 *
 * Derives elapsed milliseconds purely from a `startedAt` epoch timestamp and an
 * `isActive` flag, ticking on an interval while active so the displayed value
 * survives component remounts (it is recomputed from `Date.now() - startedAt`,
 * never accumulated in state). The default 100ms tick lets timer pills count up
 * in tenths of a second, matching the display precision of `formatDuration`;
 * the interval is per-row and only armed while active — callers whose UI does
 * not consume the tick gate `isActive` at the call site (e.g. `CollapsibleRow`
 * passes `isActive && showTimer`). A finalized `durationMs` always wins
 * over the live ticker. Guards against `NaN`/missing inputs by reporting `0`.
 */

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
   * 100ms interval per active row whose caller passes `isActive: true`.
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
export function elapsedTimerHook(useTicks: (active: boolean, fallbackMs: number) => number) {
  return function useElapsedTimer({
    startedAt,
    isActive,
    durationMs,
    intervalMs = 100,
  }: ElapsedTimerInput): number {
    const finalized = durationMs !== undefined && Number.isFinite(durationMs) && durationMs >= 0
    // Only tick for a genuinely live timer with a usable anchor — an invalid
    // `startedAt` would otherwise run a useless interval. Inside a
    // ClockProvider the shared clock drives it and `intervalMs` is ignored; a
    // non-positive/non-finite own interval arms nothing.
    useTicks(!finalized && isActive && Number.isFinite(startedAt), intervalMs)

    if (finalized) return durationMs as number
    return computeElapsed(startedAt)
  }
}
