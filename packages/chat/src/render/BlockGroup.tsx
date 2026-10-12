import { planGroupHeader } from '@fx-/chat-core'
/**
 * `BlockGroup` — renders a collapsed run of auxiliary blocks under one
 * disclosure, with the header core plans (`planGroupHeader`): a tool group's
 * count, outcome split and time; a reasoning group's thoughts; else a summary
 * chip and a plain muted `(+N)` text count of the hidden blocks.
 *
 * The header summary text is derived from the chosen block's kind via the
 * grouping policy's selection (`selectHeaderSummary`), never via ad-hoc kind
 * branching in the log walk.
 */
import { cx } from '../cx'
import { useChatClassNames } from '../registry'
import { CollapsibleRow } from './CollapsibleRow'
import { BlockView } from './blocks'
import type { BlockRenderContext } from './blocks'
import { APPROVAL_TEXT } from './blocks/ToolCallBlock'
import type { ChatExtensions, RenderableBlock } from './extensions'

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

export function BlockGroup({ blocks, context, defaultOpen, extensions }: BlockGroupProps) {
  const cn = useChatClassNames()
  // The trailing status only heads the summary while it is the live row; a
  // completed run surfaces the latest tool/reasoning summary instead.
  const header = planGroupHeader(blocks, {
    ...context,
    ...(extensions?.timelineBehavior ? { overrides: extensions.timelineBehavior } : {}),
  })
  const { summary, hiddenCount, isActive, showTimer, durationMs, startedAt } = header
  const tokensPerSecond = header.showRate ? context.tokensPerSecond : undefined
  const prefix =
    hiddenCount > 0 ? (
      <span className={cx('chat-group-more', cn.groupMore)}>(+{hiddenCount})</span>
    ) : null

  // A one-call group reads as that call's row: its error state and approval qualifier.
  const only = header.tools?.only
  const failedOnly = only !== undefined && header.tools?.failed === 1
  const approval = only?.approval ? APPROVAL_TEXT[only.approval.state] : undefined
  const label = (
    <span
      className={cx('chat-group-summary', cn.groupSummary)}
      {...(header.tools
        ? { 'data-tools': header.tools.total, 'data-failed': header.tools.failed }
        : {})}
    >
      <span className={cx('chat-group-summary-label', cn.groupSummaryLabel)}>{summary.label}</span>
      {approval ? (
        <span
          className={cx('chat-tool-approval', cn.toolApproval)}
          data-approval={only?.approval?.state}
        >
          {' · '}
          {approval}
        </span>
      ) : null}
    </span>
  )

  return (
    <CollapsibleRow
      label={label}
      {...(prefix ? { prefix } : {})}
      {...(summary.iconName ? { iconName: summary.iconName } : {})}
      isActive={isActive}
      error={failedOnly}
      startedAt={startedAt}
      showTimer={showTimer}
      {...(durationMs !== undefined ? { durationMs } : {})}
      {...(tokensPerSecond !== undefined ? { tokensPerSecond } : {})}
      defaultOpen={defaultOpen}
      alwaysShow
      className={cx('chat-group', cn.group)}
    >
      <div className={cx('chat-group-body', cn.groupBody)} data-testid="chat-group-body">
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
