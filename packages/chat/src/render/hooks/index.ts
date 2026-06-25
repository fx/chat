/**
 * Streaming/timing hooks for the render layer. All are pure-input and SSR-safe;
 * timers are driven by epoch timestamps so values survive remounts and tests
 * can drive them with fake timers.
 */
export type { ElapsedTimerInput } from './useElapsedTimer'
export { useElapsedTimer } from './useElapsedTimer'
export { useFlashComplete } from './useFlashComplete'
export type { LiveTokensInput } from './useLiveTokensPerSecond'
export { useLiveTokensPerSecond } from './useLiveTokensPerSecond'
export { usePrefersReducedMotion } from './usePrefersReducedMotion'
