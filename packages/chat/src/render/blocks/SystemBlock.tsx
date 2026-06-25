/**
 * `SystemBlockView` — a collapsible "system prompt" block.
 */
import type { SystemBlock } from '../../model'
import { CollapsibleRow } from '../CollapsibleRow'

/** Props for {@link SystemBlockView}. */
export interface SystemBlockViewProps {
  block: SystemBlock
  /** Default-open state (e.g. driven by a verbose toggle). */
  defaultOpen?: boolean | undefined
}

/** Renders the system prompt as a collapsible row. */
export function SystemBlockView({ block, defaultOpen }: SystemBlockViewProps) {
  return (
    <CollapsibleRow label="System prompt" iconName="gear" defaultOpen={defaultOpen} alwaysShow>
      <div className="chat-system-body">{block.text}</div>
    </CollapsibleRow>
  )
}
