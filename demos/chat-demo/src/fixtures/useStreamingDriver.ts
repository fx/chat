/**
 * `useStreamingDriver` — drives the streaming fixture from synthetic timestamps.
 *
 * The library's timing hooks (elapsed timer, tokens/sec) derive their display
 * from `Date.now()` against a message's `createdAt`. To animate a deterministic,
 * backend-free stream we advance a VIRTUAL clock and rebuild the conversation at
 * each tick via {@link buildStreamingConversation}, so the same hooks light up
 * exactly as they would for a real stream.
 *
 * The driver honors `prefers-reduced-motion` (via the library's
 * `usePrefersReducedMotion` hook): when reduced motion is requested it does not
 * run an interval — it jumps straight to the finalized end state — so no motion
 * is produced.
 */
import { usePrefersReducedMotion } from '@fx-/chat'
import { useEffect, useRef, useState } from 'react'
import { STREAM_DURATION_MS, buildStreamingConversation } from './conversation'

/** Tick interval (ms) for the virtual clock while streaming. */
export const STREAM_TICK_MS = 120

/** Virtual-ms advanced per tick (≈ real-time playback). */
const STREAM_STEP_MS = STREAM_DURATION_MS / Math.ceil(STREAM_DURATION_MS / STREAM_TICK_MS)

/** The result of the streaming driver: a live conversation + replay control. */
export interface StreamingDriverState {
  messages: ReturnType<typeof buildStreamingConversation>['messages']
  streamingMessageId: string
  isStreaming: boolean
  /** Restart the stream from the beginning (no-op semantics under reduced motion). */
  replay: () => void
}

/**
 * Returns a live streaming conversation. It captures a REAL start time
 * (`Date.now()`) when the stream begins and advances an elapsed offset on an
 * interval (cleared on completion/unmount). The conversation is built from
 * `(startMs, startMs + elapsed)`, so the message's `createdAt` is anchored to
 * real wall-clock time and the library's `useElapsedTimer` (which reads
 * `Date.now() - createdAt`) shows a correct live timer that tracks the revealed
 * text. `replay` restarts the stream from the beginning.
 */
export function useStreamingDriver(active: boolean): StreamingDriverState {
  const reducedMotion = usePrefersReducedMotion()
  // Elapsed ms since the (real) stream start. Under reduced motion, start at the
  // end so the finalized state shows immediately with no animation.
  const [elapsed, setElapsed] = useState(() => (reducedMotion ? STREAM_DURATION_MS : 0))
  // A nonce that forces a fresh start when `replay` is called.
  const [runId, setRunId] = useState(0)
  // The real epoch-ms instant the current run started; re-anchored on (re)start.
  const [startMs, setStartMs] = useState(() => Date.now())
  const elapsedRef = useRef(elapsed)
  elapsedRef.current = elapsed

  useEffect(() => {
    // `runId` is read so a `replay()` (which bumps it) re-runs this effect and
    // restarts the stream, even though its value is not otherwise used.
    void runId
    if (!active) return
    // Anchor the run to the current real clock.
    setStartMs(Date.now())
    if (reducedMotion) {
      setElapsed(STREAM_DURATION_MS)
      return
    }
    setElapsed(0)
    elapsedRef.current = 0
    const handle = setInterval(() => {
      const next = Math.min(STREAM_DURATION_MS, elapsedRef.current + STREAM_STEP_MS)
      elapsedRef.current = next
      setElapsed(next)
      if (next >= STREAM_DURATION_MS) clearInterval(handle)
    }, STREAM_TICK_MS)
    return () => clearInterval(handle)
  }, [active, reducedMotion, runId])

  const conversation = buildStreamingConversation(startMs, startMs + elapsed)

  return {
    ...conversation,
    replay: () => setRunId((n) => n + 1),
  }
}
