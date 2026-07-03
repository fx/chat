/**
 * `useLiveTokensPerSecond` — live tokens/second estimate during streaming with a
 * provider-preferred finalized value.
 *
 * While `isActive`, an explicit positive provider-reported
 * `metrics.tokensPerSecond` wins outright (a host streaming accurate mid-turn
 * rates beats the heuristic; `usage`/`durationMs` are finalized-only inputs
 * and are NOT consulted while active). Otherwise it ticks on an interval and
 * estimates the rate from the current `tokenCount` over the elapsed time since
 * `startedAt` — but only once at least {@link MIN_LIVE_ELAPSED_MS} has
 * elapsed: a handful of tokens over a tiny window extrapolates to a wildly
 * inflated rate, so sub-300ms windows yield `undefined` and never enter the
 * cached last-live snapshot. Once the message is complete it prefers, in
 * order:
 *   1. a provider-reported `metrics.tokensPerSecond`,
 *   2. a value derived from `metrics.usage.completion` over `metrics.durationMs`,
 *   3. the last live value captured while active (the estimate, or a
 *      mid-turn provider rate the active branch surfaced).
 *
 * The fallback (3) is a CACHED snapshot, not a recomputation against
 * `Date.now()`, so a completed message's displayed rate stays fixed across
 * later parent re-renders instead of drifting downward as wall-clock advances.
 *
 * Returns `undefined` when no positive rate can be derived (so callers render
 * nothing rather than `0`).
 */
import { useEffect, useRef, useState } from 'react'
import type { MessageMetrics } from '../../model'

/**
 * Minimum elapsed ms since `startedAt` before a live estimate is produced.
 * Below this, the sample window is too small to be meaningful — the first few
 * tokens over a few milliseconds extrapolate to an absurd rate — so the hook
 * returns `undefined` and does NOT cache anything.
 */
const MIN_LIVE_ELAPSED_MS = 300

/** Input to {@link useLiveTokensPerSecond}. */
export interface LiveTokensInput {
  /** Epoch-ms timestamp generation began, when known. */
  startedAt?: number | undefined
  /** Whether generation is currently streaming. */
  isActive: boolean
  /** Best-known generated token count so far (or final). */
  tokenCount?: number | undefined
  /** Finalized per-message metrics, preferred once complete. */
  metrics?: MessageMetrics | undefined
  /** Tick interval in ms while active (default 1000). */
  intervalMs?: number | undefined
}

/** A finite, positive number or `undefined`. */
function positive(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined
}

/** Estimate tokens/sec from a token count over elapsed ms; `undefined` if not derivable. */
function estimate(tokenCount: number | undefined, elapsedMs: number): number | undefined {
  const tokens = positive(tokenCount)
  const elapsed = positive(elapsedMs)
  if (tokens === undefined || elapsed === undefined) return undefined
  return tokens / (elapsed / 1000)
}

/**
 * Resolve the finalized rate (used when not active), preferring provider value,
 * then usage/duration-derived, then a CACHED last-live estimate snapshot.
 */
function finalizedRate(
  metrics: MessageMetrics | undefined,
  cachedLive: number | undefined,
): number | undefined {
  const provided = positive(metrics?.tokensPerSecond)
  if (provided !== undefined) return provided
  const completion = positive(metrics?.usage?.completion)
  const durationMs = positive(metrics?.durationMs)
  if (completion !== undefined && durationMs !== undefined) return completion / (durationMs / 1000)
  return positive(cachedLive)
}

/** Returns the current tokens/second estimate, or `undefined` when none applies. */
export function useLiveTokensPerSecond({
  startedAt,
  isActive,
  tokenCount,
  metrics,
  intervalMs = 1000,
}: LiveTokensInput): number | undefined {
  const [, setTick] = useState(0)
  // Snapshot of the most recent live estimate, captured while active so the
  // finalized fallback does not drift against an advancing wall clock.
  const lastLive = useRef<number | undefined>(undefined)
  // Reset the cached estimate when a NEW stream begins (a different `startedAt`),
  // so a later stream that never produces a derivable rate completes as
  // `undefined` rather than showing the previous stream's stale rate.
  const prevStartedAt = useRef<number | undefined>(startedAt)
  if (prevStartedAt.current !== startedAt) {
    prevStartedAt.current = startedAt
    lastLive.current = undefined
  }

  useEffect(() => {
    // Skip arming the ticker for a non-positive/non-finite interval, which the
    // browser would clamp to a near-zero delay and spin a tight render loop.
    if (!isActive || !Number.isFinite(intervalMs) || intervalMs <= 0) return
    const handle = setInterval(() => setTick((n) => n + 1), intervalMs)
    return () => clearInterval(handle)
  }, [isActive, intervalMs])

  if (!isActive) return finalizedRate(metrics, lastLive.current)
  // While ACTIVE, an explicit positive provider rate beats the chars/elapsed
  // estimate (and needs neither a clock anchor nor the min-elapsed window).
  // usage/durationMs stay finalized-only and are NOT consulted here.
  // Cache it as the last-live snapshot too (like the estimate path below): a
  // provider-rate-only stream that finalizes with metrics carrying NO rate
  // then keeps the last known value instead of dropping the pill at finalize.
  const provided = positive(metrics?.tokensPerSecond)
  if (provided !== undefined) {
    lastLive.current = provided
    return provided
  }
  if (startedAt === undefined) return undefined
  const elapsedMs = Date.now() - startedAt
  // Min-elapsed guard, BEFORE the estimate computation: a sub-300ms window must
  // never produce an estimate NOR populate the cached last-live snapshot, so an
  // inflated early rate can neither render live nor leak into the finalized
  // fallback.
  if (elapsedMs < MIN_LIVE_ELAPSED_MS) return undefined
  const live = estimate(tokenCount, elapsedMs)
  // Only cache a valid (defined) estimate so a transient gap in `tokenCount`
  // does not erase the last good rate used as the finalized fallback.
  if (live !== undefined) lastLive.current = live
  return live
}
