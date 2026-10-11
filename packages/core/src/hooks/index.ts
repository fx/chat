/**
 * The render-layer hooks as a factory: `createCoreHooks(React)` binds them to
 * the React instance a host hands in, so a renderer never imports its own
 * copy (a terminal host shares React with the tool that loads it). Every
 * call returns a fresh set — a separate clock context included — so call it
 * once per React instance.
 */
import { clockHooks } from './clock'
import type { ReactApi } from './react-api'
import { elapsedTimerHook } from './useElapsedTimer'
import { flashCompleteHook } from './useFlashComplete'
import { liveTokensPerSecondHook } from './useLiveTokensPerSecond'
import { prefersReducedMotionHook } from './usePrefersReducedMotion'

export type { ReactApi } from './react-api'
export type { ClockProviderProps, SharedClock } from './clock'
export { createSharedClock } from './clock'
export type { ElapsedTimerInput } from './useElapsedTimer'
export type { LiveTokensInput } from './useLiveTokensPerSecond'

export function createCoreHooks(React: ReactApi) {
  const { ClockProvider, useSharedClock, useTicks, useClock } = clockHooks(React)
  const usePrefersReducedMotion = prefersReducedMotionHook(React)
  return {
    ClockProvider,
    useSharedClock,
    useTicks,
    useClock,
    useElapsedTimer: elapsedTimerHook(useTicks),
    useLiveTokensPerSecond: liveTokensPerSecondHook(React, useTicks),
    usePrefersReducedMotion,
    useFlashComplete: flashCompleteHook(React, usePrefersReducedMotion, useSharedClock),
  }
}

/** The hooks bound to one React instance. */
export type CoreHooks = ReturnType<typeof createCoreHooks>
