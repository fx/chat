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
 * renderer's label/icon precedence:
 * - reasoning → `brain`; active → "Thinking…", else duration → "Thought for
 *   <dur>", else "Reasoning"; carries `durationMs`, timer eligible.
 * - tool_call → `wrench`; label is the tool name; carries `durationMs`, timer
 *   eligible.
 * - system → `gear`; label "System prompt"; no timer.
 * - any other kind (status, custom) → label from its type, no icon, no timer.
 */
export function summarizeBlock(
  block: RenderableBlock,
  context: BlockSummaryContext = {},
): BlockSummary {
  switch (block.type) {
    case 'reasoning': {
      const durationMs = (block as Extract<ContentBlock, { type: 'reasoning' }>).durationMs
      let label: string
      if (context.isActive) {
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
        showTimer: true,
      }
    }
    case 'tool_call': {
      const tool = block as Extract<ContentBlock, { type: 'tool_call' }>
      return {
        iconName: 'wrench',
        label: tool.name,
        ...(tool.durationMs !== undefined ? { durationMs: tool.durationMs } : {}),
        showTimer: true,
      }
    }
    case 'system':
      return { iconName: 'gear', label: 'System prompt', showTimer: false }
    case 'status':
      return { label: 'Status', showTimer: false }
    case 'text':
      return { label: 'Text', showTimer: false }
    default:
      // Custom (host-defined) kind: label by its type, no icon, no timer.
      return { label: block.type, showTimer: false }
  }
}
