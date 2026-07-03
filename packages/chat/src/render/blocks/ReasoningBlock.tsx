/**
 * `ReasoningBlockView` — a collapsible "thinking" block.
 *
 * The header reads "Thinking…" with a live ticking timer pill while active
 * (the label carries no duration, so the pill surfaces the elapsed time), else
 * "Thought for <dur>" — which embeds the duration, so no pill — using the
 * human-readable reasoning-duration formatter. The body renders the reasoning
 * text through the registry `Markdown` slot (reasoning is model-authored prose,
 * so it gets the same Markdown treatment as assistant answers).
 */
import { cx } from '../../cx'
import type { ReasoningBlock } from '../../model'
import { useChatClassNames, useChatComponents } from '../../registry'
import { CollapsibleRow } from '../CollapsibleRow'
import { summarizeBlock } from '../blockSummary'

/** Props for {@link ReasoningBlockView}. */
export interface ReasoningBlockViewProps {
  block: ReasoningBlock
  /** Whether this reasoning is actively streaming. */
  isActive?: boolean | undefined
  /** Epoch-ms start for the live timer while active. */
  startedAt?: number | undefined
  /** Default-open state (e.g. driven by a verbose toggle). */
  defaultOpen?: boolean | undefined
}

/** Renders the reasoning block as a collapsible row labelled with its duration. */
export function ReasoningBlockView({
  block,
  isActive = false,
  startedAt,
  defaultOpen,
}: ReasoningBlockViewProps) {
  const { Markdown } = useChatComponents()
  const cn = useChatClassNames()
  // Label + icon + timer precedence comes from the shared `summarizeBlock`
  // helper so the bare view and the collapsed `BlockGroup` summary cannot
  // drift: actively streaming → "Thinking…" WITH a live timer pill
  // (`showTimer`; `block.durationMs` is undefined while active, so the pill
  // ticks from `startedAt`); completed with a known duration → "Thought for
  // <dur>" and no pill (the label embeds the duration); completed without
  // timing data → a neutral "Reasoning".
  // A reasoning block always carries the `brain` kind icon (per summarizeBlock),
  // so pass it unconditionally.
  const summary = summarizeBlock(block, { isActive })
  return (
    <CollapsibleRow
      label={summary.label}
      iconName="brain"
      isActive={isActive}
      startedAt={startedAt}
      durationMs={block.durationMs}
      showTimer={summary.showTimer}
      defaultOpen={defaultOpen}
      alwaysShow
    >
      <div className={cx('chat-reasoning-body', cn.reasoningBody)}>
        <Markdown content={block.text} {...(isActive ? { streaming: true } : {})} />
      </div>
    </CollapsibleRow>
  )
}
