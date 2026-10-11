/**
 * One shared clock for everything that animates.
 *
 * Without a provider every live row runs its own interval (100 ms timers, an
 * 80 ms spinner); on slow terminals each frame is expensive, so a long turn
 * keeps a core busy. Inside a `ClockProvider` every timer, live rate, spinner
 * and pulse re-renders from ONE interval at the host's tick, and only while
 * at least one live subscriber exists.
 */
import type { ReactNode } from 'react'
import type { ReactApi } from './react-api'

/** The shared clock a provider exposes. */
export interface SharedClock {
  /** The provider's tick in ms. */
  tickMs: number
  /** Subscribe a live consumer; returns the unsubscribe. */
  subscribe: (listener: () => void) => () => void
}

/** Create a clock that runs one interval while it has subscribers. */
export function createSharedClock(tickMs: number): SharedClock {
  const listeners = new Set<() => void>()
  let handle: ReturnType<typeof setInterval> | undefined
  return {
    tickMs,
    subscribe(listener) {
      listeners.add(listener)
      if (handle === undefined) {
        handle = setInterval(() => {
          for (const fn of [...listeners]) fn()
        }, tickMs)
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0 && handle !== undefined) {
          clearInterval(handle)
          handle = undefined
        }
      }
    },
  }
}

export interface ClockProviderProps {
  /** Tick in ms (default 1000). */
  tickMs?: number
  children?: ReactNode
}

/** The clock hooks bound to one React instance. */
export function clockHooks(React: ReactApi) {
  const ClockContext = React.createContext<SharedClock | null>(null)

  function ClockProvider({ tickMs = 1000, children }: ClockProviderProps) {
    const clock = React.useMemo(() => createSharedClock(tickMs), [tickMs])
    return React.createElement(ClockContext.Provider, { value: clock }, children)
  }

  /** The shared clock in scope, if any. */
  function useSharedClock(): SharedClock | null {
    return React.useContext(ClockContext)
  }

  /**
   * Re-render on each tick while `active`: from the shared clock when a
   * provider is in scope, else from an own interval of `fallbackMs`. Returns a
   * tick counter (callers read the time themselves). A non-positive or
   * non-finite fallback arms nothing.
   */
  function useTicks(active: boolean, fallbackMs: number): number {
    const shared = useSharedClock()
    const [ticks, setTicks] = React.useState(0)
    React.useEffect(() => {
      if (!active) return
      const tick = () => setTicks((n) => n + 1)
      if (shared) return shared.subscribe(tick)
      if (!Number.isFinite(fallbackMs) || fallbackMs <= 0) return
      const handle = setInterval(tick, fallbackMs)
      return () => clearInterval(handle)
    }, [active, shared, fallbackMs])
    return ticks
  }

  /** The current time (epoch ms), re-rendering at the clock's tick while `active`. */
  function useClock(active: boolean, fallbackMs = 1000): number {
    useTicks(active, fallbackMs)
    return Date.now()
  }

  return { ClockProvider, useSharedClock, useTicks, useClock }
}
