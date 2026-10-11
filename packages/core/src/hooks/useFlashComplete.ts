/**
 * `useFlashComplete` — brief success flash on an active → inactive transition.
 *
 * When `isActive` falls from `true` to `false`, the hook returns `true` for a
 * bounded `duration` (default 1200ms), then `false`. Honors
 * `prefers-reduced-motion`: when reduced motion is preferred the flash is
 * suppressed entirely (returns `false`).
 *
 * The flash is held as its start time, so it can only end or be cancelled,
 * never resurrected: suppression (`enabled` off or reduced motion on), a new
 * activity, or unmount drops it. Inside a `ClockProvider` it ends on the
 * first shared tick at or after `duration` and arms no timer of its own;
 * without one it arms a single timeout for the remaining time.
 */
import type { SharedClock } from './clock'
import type { ReactApi } from './react-api'

export function flashCompleteHook(
  React: ReactApi,
  usePrefersReducedMotion: () => boolean,
  useSharedClock: () => SharedClock | null,
) {
  /**
   * Returns whether a completion flash is currently showing.
   *
   * @param isActive Whether the underlying activity is in progress.
   * @param duration Flash duration in ms (default 1200).
   * @param enabled When false, never flashes (it costs extra frames on slow terminals).
   */
  function useFlashComplete(isActive: boolean, duration = 1200, enabled = true): boolean {
    const reducedMotion = usePrefersReducedMotion()
    const shared = useSharedClock()
    const suppressed = reducedMotion || !enabled
    // Epoch ms the current flash began, or null when none is showing.
    const [startedAt, setStartedAt] = React.useState<number | null>(null)
    const wasActive = React.useRef(isActive)

    // Start a flash on completion; any other change of these inputs (a new
    // activity, or suppression switching on or off) cancels it for good.
    React.useEffect(() => {
      const justCompleted = wasActive.current && !isActive
      wasActive.current = isActive
      setStartedAt(justCompleted && !suppressed ? Date.now() : null)
    }, [isActive, suppressed])

    // End the flash: from the shared clock when one is in scope, else from
    // one own timeout for whatever remains of `duration`.
    React.useEffect(() => {
      if (startedAt === null) return
      const end = () => setStartedAt(null)
      if (shared) {
        return shared.subscribe(() => {
          if (Date.now() - startedAt >= duration) end()
        })
      }
      const handle = setTimeout(end, Math.max(0, startedAt + duration - Date.now()))
      return () => clearTimeout(handle)
    }, [startedAt, duration, shared])

    return startedAt !== null && !suppressed
  }
  return useFlashComplete
}
