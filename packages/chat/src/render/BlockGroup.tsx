/**
 * `BlockGroup` — renders a collapsed run of auxiliary blocks under one
 * disclosure, with a header summary chip selected by the grouping policy and a
 * `+N` badge counting the hidden blocks.
 *
 * The header summary text is derived from the chosen block's kind via the
 * grouping policy's selection (`selectHeaderSummary`), never via ad-hoc kind
 * branching in the log walk.
 */
import type { ContentBlock } from '../model'
import { useChatComponents } from '../registry'
import { CollapsibleRow } from './CollapsibleRow'
import { summarizeBlock } from './blockSummary'
import { BlockView } from './blocks'
import type { BlockRenderContext } from './blocks'
import type { ChatExtensions, RenderableBlock } from './extensions'
import { selectHeaderSummary } from './grouping'

/** Props for {@link BlockGroup}. */
export interface BlockGroupProps {
  /** The auxiliary blocks folded under this disclosure (length ≥ 2). */
  blocks: RenderableBlock[]
  /** Shared render context for the inner blocks. */
  context: BlockRenderContext
  /** Default-open for the disclosure (verbose/expand-all). */
  defaultOpen?: boolean
  /** Optional render-layer extensions (threaded to inner blocks + grouping). */
  extensions?: ChatExtensions
}

/** Whether a single block is currently active (drives the spinner). */
function blockIsActive(block: RenderableBlock, context: BlockRenderContext): boolean {
  // tool_call carries its own lifecycle, so a running/pending tool anywhere in
  // the run counts regardless of which block is the message's trailing one.
  if (block.type === 'tool_call') {
    const status = (block as Extract<ContentBlock, { type: 'tool_call' }>).status
    return status === 'running' || status === 'pending'
  }
  // status/reasoning are active only when they are the message's trailing block.
  const isTrailingActive = Boolean(context.isActive) && block.id === context.activeBlockId
  if (block.type === 'status') return isTrailingActive
  if (block.type === 'reasoning') {
    return (
      isTrailingActive &&
      (block as Extract<ContentBlock, { type: 'reasoning' }>).durationMs === undefined
    )
  }
  // Custom (host-defined) kinds opted into grouping: active when they are the
  // message's trailing active block — mirroring what `BlockView` passes as
  // `isStreaming` to the host renderer, so the group spinner stays consistent.
  return isTrailingActive
}

/**
 * Whether ANY block in the run is currently active. Checking the whole run (not
 * just the trailing block) means a still-running tool earlier in the collapsed
 * run keeps the group's spinner visible.
 */
function groupIsActive(blocks: RenderableBlock[], context: BlockRenderContext): boolean {
  return blocks.some((block) => blockIsActive(block, context))
}

/** Renders the collapsed group disclosure. */
export function BlockGroup({ blocks, context, defaultOpen, extensions }: BlockGroupProps) {
  const { Badge } = useChatComponents()
  // The trailing status only heads the summary while it is the live row; a
  // completed run surfaces the latest tool/reasoning summary instead.
  const trailingBlock = blocks[blocks.length - 1] as RenderableBlock
  const trailingActive = blockIsActive(trailingBlock, context)
  const { block: summaryBlock, hiddenCount } = selectHeaderSummary(
    blocks,
    trailingActive,
    extensions?.timelineBehavior,
  )
  const isActive = groupIsActive(blocks, context)

  // Derive the collapsed-header summary (kind icon + label + timing) from the
  // SAME `summarizeBlock` helper the bare renderers use, so the group header
  // mirrors what the bare block shows (e.g. `brain` + "Thought for 1.3s" for a
  // reasoning summary) and the two can't drift. Active state for the summary
  // mirrors the row-level activeness of the chosen block.
  const summaryActive = blockIsActive(summaryBlock, context)
  const summary = summarizeBlock(summaryBlock, { isActive: summaryActive })

  // When the chosen summary is a status row, surface its live/final timing and
  // tokens/sec on the collapsed header — that is the whole reason the policy
  // prefers a trailing active status as the summary (to keep the timer visible).
  const summaryIsStatus = summaryBlock.type === 'status'

  // Timer: a status summary uses the message-level duration (as before); a
  // reasoning/tool summary uses its OWN block duration so "Thought for <dur>"
  // gets its matching pill. tok/s: the status summary shows the live rate; a
  // reasoning/tool summary shows the message-level finalized rate so the
  // collapsed header carries the same `N tok/s` pill the reference renders.
  const showTimer = summaryIsStatus || summary.showTimer
  const durationMs = summaryIsStatus ? context.durationMs : summary.durationMs
  // Status summary: live tok/s only while active (unchanged). Reasoning/tool
  // summary: the message-level finalized tok/s so the pill matches the reference.
  const tokensPerSecond = summaryIsStatus
    ? isActive
      ? context.tokensPerSecond
      : undefined
    : context.tokensPerSecond

  // The `(+N)` hidden-count badge renders right after the disclosure caret and
  // BEFORE the kind icon/label (reference order), via CollapsibleRow's `prefix`
  // slot. Rendered only when there is a hidden remainder.
  const prefix =
    hiddenCount > 0 ? (
      <Badge className="chat-group-more" tone="default">
        (+{hiddenCount})
      </Badge>
    ) : null

  const label = (
    <span className="chat-group-summary">
      <span className="chat-group-summary-label">{summary.label}</span>
    </span>
  )

  return (
    <CollapsibleRow
      label={label}
      {...(prefix ? { prefix } : {})}
      {...(summary.iconName ? { iconName: summary.iconName } : {})}
      isActive={isActive}
      startedAt={context.startedAt}
      showTimer={showTimer}
      {...(showTimer && durationMs !== undefined ? { durationMs } : {})}
      {...(tokensPerSecond !== undefined ? { tokensPerSecond } : {})}
      defaultOpen={defaultOpen}
      alwaysShow
      className="chat-group"
    >
      <div className="chat-group-body" data-testid="chat-group-body">
        {blocks.map((block) => (
          <BlockView
            key={block.id}
            block={block}
            context={context}
            {...(extensions ? { extensions } : {})}
          />
        ))}
      </div>
    </CollapsibleRow>
  )
}
