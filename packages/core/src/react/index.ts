/**
 * Streaming/timing hooks for the render layer, bound to the `react` package.
 * All are pure-input and SSR-safe; timers are driven by epoch timestamps so
 * values survive remounts and tests can drive them with fake timers. A host
 * that must use a React instance it is handed uses `@fx/chat-core/hooks`.
 */
import * as React from 'react'
import { createCoreHooks } from '../hooks/index'

export type {
  ClockProviderProps,
  ElapsedTimerInput,
  LiveTokensInput,
  SharedClock,
} from '../hooks/index'
export { createSharedClock } from '../hooks/index'

const hooks = createCoreHooks(React)

export const ClockProvider = hooks.ClockProvider
export const useSharedClock = hooks.useSharedClock
export const useTicks = hooks.useTicks
export const useClock = hooks.useClock
export const useElapsedTimer = hooks.useElapsedTimer
export const useLiveTokensPerSecond = hooks.useLiveTokensPerSecond
export const usePrefersReducedMotion = hooks.usePrefersReducedMotion
export const useFlashComplete = hooks.useFlashComplete
