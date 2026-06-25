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
import { formatDuration } from '../format'

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
  // Label precedence: actively streaming → "Thinking…"; completed with a known
  // duration → "Thought for <dur>"; completed without timing data → a neutral
  // "Reasoning" (never "Thinking…", which would imply it is still in progress).
  let label: string
  if (isActive) {
    label = 'Thinking…'
  } else if (block.durationMs !== undefined) {
    label = `Thought for ${formatDuration(block.durationMs)}`
  } else {
    label = 'Reasoning'
  }
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
