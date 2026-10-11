/**
 * `useFlashComplete` — brief success flash on an active → inactive transition.
 *
 * When `isActive` falls from `true` to `false`, the hook returns `true` for a
 * bounded `duration` (default 1200ms), then `false`. Honors
 * `prefers-reduced-motion`: when reduced motion is preferred the flash is
 * suppressed entirely (returns `false`). The timer is cleared on unmount and
 * re-armed cleanly across repeated transitions.
 */
import type { ReactApi } from './react-api'

export function flashCompleteHook(React: ReactApi, usePrefersReducedMotion: () => boolean) {
  /**
   * Returns whether a completion flash is currently showing.
   *
   * @param isActive Whether the underlying activity is in progress.
   * @param duration Flash duration in ms (default 1200).
   * @param enabled When false, never flashes (it costs extra frames on slow terminals).
   */
  function useFlashComplete(isActive: boolean, duration = 1200, enabled = true): boolean {
    const reducedMotion = usePrefersReducedMotion()
    const [flashing, setFlashing] = React.useState(false)
    const wasActive = React.useRef(isActive)

    React.useEffect(() => {
      const justCompleted = wasActive.current && !isActive
      wasActive.current = isActive
      if (!justCompleted || reducedMotion || !enabled) return
      setFlashing(true)
      const handle = setTimeout(() => setFlashing(false), duration)
      return () => clearTimeout(handle)
    }, [isActive, duration, reducedMotion, enabled])

    return flashing && !reducedMotion && enabled
  }
  return useFlashComplete
}
