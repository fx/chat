import {
  type ContentBlock,
  type PlanBlock,
  type ToolCallBlock,
  countActivity,
  formatDuration,
  formatTokenCount,
  isBlockActive,
} from '@fx/chat-core'
/**
 * A message's activity as plain data for the optional `ActivitySummary`
 * presenter and the footer's activity facts — what the rows say, without the
 * rows. Pure; the presenter decides how it looks.
 */
import type { ActivityFact, ActivityItem } from '../registry'
import type { RenderableBlock } from './extensions'

export interface ActivityItemContext {
  isActive: boolean
  activeBlockId?: string | undefined
  /** The live reasoning rate, while the message streams. */
  tokensPerSecond?: number | undefined
  /** When the message started (its `createdAt`): the pending status item's clock. */
  startedAt?: number | undefined
}

/** One activity block as a summary item. */
export function activityItem(block: RenderableBlock, context: ActivityItemContext): ActivityItem {
  const live = isBlockActive(block, context)
  const timing = (b: { startedAt?: number; durationMs?: number }) => ({
    ...(b.startedAt !== undefined ? { startedAt: b.startedAt } : {}),
    ...(b.durationMs !== undefined ? { durationMs: b.durationMs } : {}),
  })
  switch (block.type) {
    case 'tool_call': {
      const tool = block as ToolCallBlock
      const approval = tool.approval?.state
      const refused = approval === 'denied' || approval === 'unavailable'
      const status: ActivityItem['status'] =
        approval === 'pending'
          ? 'awaiting'
          : tool.status === 'error' || refused
            ? 'error'
            : tool.status === 'pending' || tool.status === 'running'
              ? 'running'
              : 'done'
      return {
        id: tool.id,
        kind: 'tool',
        label: tool.name,
        name: tool.name,
        status,
        ...timing(tool),
      }
    }
    case 'reasoning': {
      const reasoning = block as Extract<ContentBlock, { type: 'reasoning' }>
      return {
        id: reasoning.id,
        kind: 'reasoning',
        label: 'Thinking',
        status: live ? 'running' : 'done',
        ...timing(reasoning),
        ...(live && context.tokensPerSecond !== undefined
          ? { tokensPerSecond: context.tokensPerSecond }
          : {}),
      }
    }
    case 'plan': {
      const { entries } = block as PlanBlock
      const done = entries.filter((entry) => entry.status === 'completed').length
      return {
        id: block.id,
        kind: 'plan',
        label: 'Plan',
        status: context.isActive && done < entries.length ? 'running' : 'done',
        detail: `${done}/${entries.length}`,
      }
    }
    case 'status':
      return {
        id: block.id,
        kind: 'waiting',
        label: 'Starting',
        status: context.isActive ? 'running' : 'done',
        ...(context.startedAt !== undefined ? { startedAt: context.startedAt } : {}),
      }
    default:
      return { id: block.id, kind: 'other', label: block.type, status: live ? 'running' : 'done' }
  }
}

/**
 * A finished message's activity as footer facts: tool calls (and failures),
 * thinking time (or size, when untimed), and plan progress — present ones only.
 */
export function activityFacts(blocks: readonly RenderableBlock[]): ActivityFact[] {
  const counts = countActivity(blocks)
  const facts: ActivityFact[] = []
  const { total, failed } = counts.tools
  if (total > 0) {
    facts.push({
      key: 'tools',
      text: String(total),
      label: `${total} tool call${total === 1 ? '' : 's'}${failed > 0 ? `, ${failed} failed` : ''}`,
      ...(failed > 0 ? { failed } : {}),
    })
  }
  if (counts.reasoningChars > 0) {
    const thought = blocks
      .filter((b): b is Extract<ContentBlock, { type: 'reasoning' }> => b.type === 'reasoning')
      .reduce<number | undefined>(
        (sum, b) => (b.durationMs === undefined ? sum : (sum ?? 0) + b.durationMs),
        undefined,
      )
    const text =
      thought !== undefined ? formatDuration(thought) : formatTokenCount(counts.reasoningChars)
    facts.push({
      key: 'reasoning',
      text,
      label: thought !== undefined ? `Thought for ${text}` : `Thought (${text} characters)`,
    })
  }
  if (counts.plan) {
    const { done, total: steps } = counts.plan
    facts.push({ key: 'plan', text: `${done}/${steps}`, label: `Plan: ${done} of ${steps} done` })
  }
  return facts
}
