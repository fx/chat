/**
 * `PlanBlockView` — an agent's checklist as a collapsible row: the shared
 * summary (`Plan d/t`, checklist icon) heads it, and the body lists one entry
 * per row with its status as `data-status` for host styling.
 */
import { type PlanBlock, summarizeBlock } from '@fx/chat-core'
import { cx } from '../../cx'
import { useChatClassNames } from '../../registry'
import { CollapsibleRow } from '../CollapsibleRow'

/** Props for {@link PlanBlockView}. */
export interface PlanBlockViewProps {
  block: PlanBlock
  /** Default-open state (e.g. driven by a verbose toggle). */
  defaultOpen?: boolean | undefined
}

const STATUS_TEXT: Record<PlanBlock['entries'][number]['status'], string> = {
  completed: 'done',
  in_progress: 'in progress',
  pending: 'pending',
}

export function PlanBlockView({ block, defaultOpen }: PlanBlockViewProps) {
  const cn = useChatClassNames()
  const summary = summarizeBlock(block)
  return (
    <CollapsibleRow label={summary.label} iconName="checklist" defaultOpen={defaultOpen} alwaysShow>
      {block.entries.length > 0 ? (
        <ul className={cx('chat-plan', cn.plan)}>
          {block.entries.map((entry, index) => (
            <li
              key={entry.id ?? index}
              className={cx('chat-plan-entry', cn.planEntry)}
              data-status={entry.status}
              {...(entry.priority ? { 'data-priority': entry.priority } : {})}
              aria-label={`${entry.content} (${STATUS_TEXT[entry.status]})`}
            >
              {entry.content}
            </li>
          ))}
        </ul>
      ) : null}
    </CollapsibleRow>
  )
}
