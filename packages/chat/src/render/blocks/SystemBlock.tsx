/**
 * `SystemBlockView` — a collapsible "system prompt" block.
 */
import { cx } from '../../cx'
import type { SystemBlock } from '../../model'
import { useChatClassNames } from '../../registry'
import { CollapsibleRow } from '../CollapsibleRow'

/** Props for {@link SystemBlockView}. */
export interface SystemBlockViewProps {
  block: SystemBlock
  /** Default-open state (e.g. driven by a verbose toggle). */
  defaultOpen?: boolean | undefined
}

/** Renders the system prompt as a collapsible row. */
export function SystemBlockView({ block, defaultOpen }: SystemBlockViewProps) {
  const cn = useChatClassNames()
  return (
    <CollapsibleRow label="System prompt" iconName="gear" defaultOpen={defaultOpen} alwaysShow>
      <div className={cx('chat-system-body', cn.systemBody)}>{block.text}</div>
    </CollapsibleRow>
  )
}
