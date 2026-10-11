/**
 * `usePrefersReducedMotion` — reactive `prefers-reduced-motion` signal.
 *
 * SSR-safe (defaults to `false` when `window`/`matchMedia` is absent) and
 * subscribes to changes so animation-gated behavior updates live.
 */
import type { ReactApi } from './react-api'

const QUERY = '(prefers-reduced-motion: reduce)'

/** The MediaQueryList for the reduced-motion query, or `null` outside the DOM. */
function matchMedia(): MediaQueryList | null {
  // `globalThis.matchMedia` is defined in browsers (and jsdom) and absent under
  // SSR; the optional call keeps this safe without an untestable
  // `typeof window` branch.
  return globalThis.matchMedia?.(QUERY) ?? null
}

/** Legacy MediaQueryList listener API (pre-`addEventListener` Safari/WebViews). */
interface LegacyMediaQueryList {
  addListener?: (listener: () => void) => void
  removeListener?: (listener: () => void) => void
}

/**
 * Subscribe to a MediaQueryList's changes, preferring the modern
 * `addEventListener('change', …)` and falling back to the legacy
 * `addListener`/`removeListener` pair on older Safari/iOS WebViews. Returns an
 * unsubscribe function.
 */
function subscribe(mql: MediaQueryList, onChange: () => void): () => void {
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }
  const legacy = mql as MediaQueryList & LegacyMediaQueryList
  legacy.addListener?.(onChange)
  return () => legacy.removeListener?.(onChange)
}

/**
 * Returns `true` when the user prefers reduced motion. Subscribes to media-query
 * changes; cleans up its listener on unmount.
 */
export function prefersReducedMotionHook(React: ReactApi) {
  return function usePrefersReducedMotion(): boolean {
    // Initialize to the SSR-safe fallback (`false`) so the first client render
    // matches the server snapshot; the effect immediately syncs the real value.
    const [reduced, setReduced] = React.useState(false)

    React.useEffect(() => {
      const mql = matchMedia()
      if (!mql) return
      const onChange = () => setReduced(mql.matches)
      onChange()
      return subscribe(mql, onChange)
    }, [])

    return reduced
  }
}
