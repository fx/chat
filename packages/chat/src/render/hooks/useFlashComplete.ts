/**
 * `useFlashComplete` — brief success flash on an active → inactive transition.
 *
 * When `isActive` falls from `true` to `false`, the hook returns `true` for a
 * bounded `duration` (default 1200ms), then `false`. Honors
 * `prefers-reduced-motion`: when reduced motion is preferred the flash is
 * suppressed entirely (returns `false`). The timer is cleared on unmount and
 * re-armed cleanly across repeated transitions.
 */
import { useEffect, useRef, useState } from 'react'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

/**
 * Returns whether a completion flash is currently showing.
 *
 * @param isActive Whether the underlying activity is in progress.
 * @param duration Flash duration in ms (default 1200).
 */
export function useFlashComplete(isActive: boolean, duration = 1200): boolean {
  const reducedMotion = usePrefersReducedMotion()
  const [flashing, setFlashing] = useState(false)
  const wasActive = useRef(isActive)

  useEffect(() => {
    const justCompleted = wasActive.current && !isActive
    wasActive.current = isActive
    if (!justCompleted || reducedMotion) return
    setFlashing(true)
    const handle = setTimeout(() => setFlashing(false), duration)
    return () => clearTimeout(handle)
  }, [isActive, duration, reducedMotion])

  return flashing && !reducedMotion
}
