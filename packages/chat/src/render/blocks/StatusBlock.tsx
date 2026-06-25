/**
 * `StatusBlockView` — a NON-collapsible generation-lifecycle row.
 *
 * Shows a label ("Generating…" while active, "Generated" when complete) with a
 * live timer and a tokens/sec pill while active. It is never collapsible: it has
 * no body, so the substrate renders it as a static row.
 */
import type { StatusBlock } from '../../model'
import { CollapsibleRow } from '../CollapsibleRow'

/** Props for {@link StatusBlockView}. */
export interface StatusBlockViewProps {
  block: StatusBlock
  /** Whether generation is currently active (drives spinner + live metrics). */
  isActive?: boolean | undefined
  /** Epoch-ms start for the live timer. */
  startedAt?: number | undefined
  /** Finalized duration in ms once complete. */
  durationMs?: number | undefined
  /** Live/finalized tokens-per-second to surface as a pill. */
  tokensPerSecond?: number | undefined
}

/** Human label for a lifecycle phase / active state. */
function statusLabel(phase: StatusBlock['phase'], isActive: boolean): string {
  if (isActive) return phase === 'pre-stream' ? 'Starting…' : 'Generating…'
  return 'Generated'
}

/** Renders the status row (always shown; live timer + tokens/sec while active). */
export function StatusBlockView({
  block,
  isActive = false,
  startedAt,
  durationMs,
  tokensPerSecond,
}: StatusBlockViewProps) {
  return (
    <CollapsibleRow
      label={statusLabel(block.phase, isActive)}
      isActive={isActive}
      startedAt={startedAt}
      durationMs={durationMs}
      showTimer
      {...(isActive ? { tokensPerSecond } : {})}
      alwaysShow
    />
  )
}
