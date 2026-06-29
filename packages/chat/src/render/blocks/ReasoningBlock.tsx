/**
 * `ReasoningBlockView` — a collapsible "thinking" block.
 *
 * The header reads "Thinking…" while active, else "Thought for <dur>" using the
 * human-readable reasoning-duration formatter. The body renders the reasoning
 * text through the registry `Markdown` slot (reasoning is model-authored prose,
 * so it gets the same Markdown treatment as assistant answers).
 */
import type { ReasoningBlock } from '../../model'
import { useChatComponents } from '../../registry'
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
  // Label + icon precedence comes from the shared `summarizeBlock` helper so the
  // bare view and the collapsed `BlockGroup` summary cannot drift: actively
  // streaming → "Thinking…"; completed with a known duration → "Thought for
  // <dur>"; completed without timing data → a neutral "Reasoning".
  // A reasoning block always carries the `brain` kind icon (per summarizeBlock),
  // so pass it unconditionally.
  const { label } = summarizeBlock(block, { isActive })
  return (
    <CollapsibleRow
      label={label}
      iconName="brain"
      isActive={isActive}
      startedAt={startedAt}
      durationMs={block.durationMs}
      defaultOpen={defaultOpen}
      alwaysShow
    >
      <div className="chat-reasoning-body">
        <Markdown content={block.text} {...(isActive ? { streaming: true } : {})} />
      </div>
    </CollapsibleRow>
  )
}
