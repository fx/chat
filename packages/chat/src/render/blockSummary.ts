/**
 * Shared block-summary helper — the SINGLE source of truth for the collapsed
 * header's kind icon, label, and timing for an auxiliary block.
 *
 * Both the bare block renderers (`ReasoningBlockView`, `ToolCallBlockView`,
 * `SystemBlockView`) and the collapsed `BlockGroup` summary derive their header
 * icon + label from this helper so the two cannot drift: a reasoning row reads
 * the same "Thinking…" / "Thought for <dur>" / "Reasoning" in both the bare and
 * grouped views, with the same `brain` icon.
 *
 * Pure: no React, no DOM.
 */
import type { ContentBlock } from '../model'
import type { RenderableBlock } from './extensions'
import { formatDuration } from './format'

/** Leading kind-icon names used by the auxiliary collapsible rows. */
export type SummaryIconName = 'wrench' | 'brain' | 'gear'

/** The header summary for a single auxiliary block. */
export interface BlockSummary {
  /** Leading kind icon (e.g. `brain` for reasoning), when the kind has one. */
  iconName?: SummaryIconName
  /** Human header label. */
  label: string
  /** Finalized duration in ms, when the block carries one. */
  durationMs?: number
  /** Whether the row should surface a timer pill for this duration. */
  showTimer: boolean
}

/** Context flags that influence the summary (currently just active state). */
export interface BlockSummaryContext {
  /** Whether this block is currently active/streaming. */
  isActive?: boolean
}

/**
 * Derive the {@link BlockSummary} for an auxiliary block. Mirrors each bare
 * renderer's label/icon precedence AND its timer behavior, so the group header
 * stays consistent with the bare block:
 * - reasoning → `brain`; active AND durationless → "Thinking…", else duration
 *   → "Thought for <dur>", else "Reasoning"; carries `durationMs`. A known
 *   `durationMs` means FINISHED regardless of `isActive` (the gate lives here,
 *   the single source of truth). Timer pill ONLY while ACTIVE: the live
 *   "Thinking…" label carries no duration, so the ticking pill surfaces the
 *   elapsed time; once finished, the "Thought for <dur>" label already embeds
 *   the duration, so a separate pill would duplicate it. (The tok/s pill is
 *   added by `BlockGroup`, not here.)
 * - tool_call → `wrench`; label is the tool name; carries `durationMs`, but NO
 *   timer pill — the bare `ToolCallBlockView` renders none, so the group header
 *   matches it.
 * - system → `gear`; label "System prompt"; no timer.
 * - any other kind (status, custom) → label from its type, no icon, no timer. A
 *   custom kind MAY carry a host-supplied `label` string (see
 *   `CustomBlock.label`), preferred over the raw `type` when non-blank.
 */
export function summarizeBlock(
  block: RenderableBlock,
  context: BlockSummaryContext = {},
): BlockSummary {
  switch (block.type) {
    case 'reasoning': {
      const durationMs = (block as Extract<ContentBlock, { type: 'reasoning' }>).durationMs
      // A reasoning block with a known duration is FINISHED regardless of the
      // caller's active flag — the durationMs gate lives HERE (the single
      // source of truth), so a public caller passing `isActive: true` with a
      // finalized block still gets "Thought for <dur>" and no stale live
      // pill. Internal callers' own durationMs gates (e.g. `blockIsActive`)
      // are redundant but harmless.
      const active = context.isActive === true && durationMs === undefined
      let label: string
      if (active) {
        label = 'Thinking…'
      } else if (durationMs !== undefined) {
        label = `Thought for ${formatDuration(durationMs)}`
      } else {
        label = 'Reasoning'
      }
      return {
        iconName: 'brain',
        label,
        ...(durationMs !== undefined ? { durationMs } : {}),
        // Timer pill ONLY while active: "Thinking…" carries no duration, so
        // the live pill ticks the elapsed time. Once finished, the "Thought
        // for <dur>" label already carries the duration, so a separate pill
        // would duplicate it.
        showTimer: active,
      }
    }
    case 'tool_call': {
      const tool = block as Extract<ContentBlock, { type: 'tool_call' }>
      return {
        iconName: 'wrench',
        label: tool.name,
        ...(tool.durationMs !== undefined ? { durationMs: tool.durationMs } : {}),
        // No timer pill: the bare ToolCallBlockView renders none, so the group
        // header matches it (avoids a standalone duration pill on tool rows).
        showTimer: false,
      }
    }
    case 'system':
      return { iconName: 'gear', label: 'System prompt', showTimer: false }
    case 'status':
      return { label: 'Status', showTimer: false }
    case 'text':
      return { label: 'Text', showTimer: false }
    default: {
      // Custom (host-defined) kind: prefer the host-supplied `label` duck-field
      // (see `CustomBlock.label`) when it is a non-blank string, else label by
      // its type. No icon, no timer.
      const custom = block as { label?: unknown }
      return {
        label:
          typeof custom.label === 'string' && custom.label.trim() !== ''
            ? custom.label
            : block.type,
        showTimer: false,
      }
    }
  }
}
