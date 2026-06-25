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
import { BlockView } from './blocks'
import type { BlockRenderContext } from './blocks'
import { selectHeaderSummary } from './grouping'

/** Props for {@link BlockGroup}. */
export interface BlockGroupProps {
  /** The auxiliary blocks folded under this disclosure (length ≥ 2). */
  blocks: ContentBlock[]
  /** Shared render context for the inner blocks. */
  context: BlockRenderContext
  /** Default-open for the disclosure (verbose/expand-all). */
  defaultOpen?: boolean
}

/** A short, human label for the summary-chip block. */
function summaryLabel(block: ContentBlock): string {
  switch (block.type) {
    case 'reasoning':
      return 'Reasoning'
    case 'tool_call':
      return block.name
    case 'status':
      return 'Status'
    case 'text':
      return 'Text'
    case 'system':
      return 'System'
  }
}

/** Whether a single block is currently active (drives the spinner). */
function blockIsActive(block: ContentBlock, context: BlockRenderContext): boolean {
  // tool_call carries its own lifecycle, so a running/pending tool anywhere in
  // the run counts regardless of which block is the message's trailing one.
  if (block.type === 'tool_call') return block.status === 'running' || block.status === 'pending'
  // status/reasoning are active only when they are the message's trailing block.
  const isTrailingActive = Boolean(context.isActive) && block.id === context.activeBlockId
  if (block.type === 'status') return isTrailingActive
  if (block.type === 'reasoning') return isTrailingActive && block.durationMs === undefined
  return false
}

/**
 * Whether ANY block in the run is currently active. Checking the whole run (not
 * just the trailing block) means a still-running tool earlier in the collapsed
 * run keeps the group's spinner visible.
 */
function groupIsActive(blocks: ContentBlock[], context: BlockRenderContext): boolean {
  return blocks.some((block) => blockIsActive(block, context))
}

/** Renders the collapsed group disclosure. */
export function BlockGroup({ blocks, context, defaultOpen }: BlockGroupProps) {
  const { Badge } = useChatComponents()
  // The trailing status only heads the summary while it is the live row; a
  // completed run surfaces the latest tool/reasoning summary instead.
  const trailingBlock = blocks[blocks.length - 1] as ContentBlock
  const trailingActive = blockIsActive(trailingBlock, context)
  const { block: summaryBlock, hiddenCount } = selectHeaderSummary(blocks, trailingActive)
  const isActive = groupIsActive(blocks, context)

  // When the chosen summary is a status row, surface its live/final timing and
  // tokens/sec on the collapsed header — that is the whole reason the policy
  // prefers a trailing active status as the summary (to keep the timer visible).
  const summaryIsStatus = summaryBlock.type === 'status'
  const tokensPerSecond = summaryIsStatus && isActive ? context.tokensPerSecond : undefined

  const label = (
    <span className="chat-group-summary">
      <span className="chat-group-summary-label">{summaryLabel(summaryBlock)}</span>
      {hiddenCount > 0 ? (
        <Badge className="chat-group-more" tone="default">
          +{hiddenCount}
        </Badge>
      ) : null}
    </span>
  )

  return (
    <CollapsibleRow
      label={label}
      isActive={isActive}
      startedAt={context.startedAt}
      showTimer={summaryIsStatus}
      {...(summaryIsStatus && context.durationMs !== undefined
        ? { durationMs: context.durationMs }
        : {})}
      {...(tokensPerSecond !== undefined ? { tokensPerSecond } : {})}
      defaultOpen={defaultOpen}
      alwaysShow
      className="chat-group"
    >
      <div className="chat-group-body" data-testid="chat-group-body">
        {blocks.map((block) => (
          <BlockView key={block.id} block={block} context={context} />
        ))}
      </div>
    </CollapsibleRow>
  )
}
