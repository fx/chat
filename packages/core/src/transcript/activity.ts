/**
 * Activity planning shared by every renderer: activity counts, the live phase,
 * the footer facts, and their formatters. Behavior is owned by
 * message-rendering § Agent Activity.
 *
 * Pure: no React, no DOM.
 */
import type { ContentBlock, MessageMetrics, PlanBlock, ToolCallBlock } from '../model'
import type { RenderableBlock, RenderableMessage } from './extensions'
import { formatDuration, formatTokensPerSecond } from './format'

/** Counts of a message's activity. */
export interface ActivityCounts {
  reasoningChars: number
  /** Progress of the latest plan, when the message has one. */
  plan?: { done: number; total: number }
  tools: { total: number; failed: number; denied: number; running: number }
}

export function countActivity(blocks: readonly RenderableBlock[]): ActivityCounts {
  const counts: ActivityCounts = {
    reasoningChars: 0,
    tools: { total: 0, failed: 0, denied: 0, running: 0 },
  }
  for (const block of blocks) {
    if (block.type === 'reasoning') {
      counts.reasoningChars += (block as Extract<ContentBlock, { type: 'reasoning' }>).text.length
    } else if (block.type === 'plan') {
      const { entries } = block as PlanBlock
      counts.plan = {
        done: entries.filter((entry) => entry.status === 'completed').length,
        total: entries.length,
      }
    } else if (block.type === 'tool_call') {
      const tool = block as ToolCallBlock
      counts.tools.total++
      // Denied includes unavailable; failed includes denied (each call once).
      const refused = tool.approval?.state === 'denied' || tool.approval?.state === 'unavailable'
      if (tool.status === 'error' || refused) counts.tools.failed++
      if (refused) counts.tools.denied++
      if (tool.status === 'running' || tool.status === 'pending') counts.tools.running++
    }
  }
  return counts
}

/** What a live message is doing right now. */
export type LivePhase =
  | { kind: 'waiting' }
  | { kind: 'thinking' }
  | { kind: 'tool'; call: ToolCallBlock }
  | { kind: 'writing' }

/**
 * The live phase: a pending/running tool call (the latest such) outranks
 * everything — text that streamed before it is not "writing" any more; else
 * trailing open reasoning is `thinking`, trailing text `writing`, and anything
 * else (nothing yet, a finished tool) `waiting`.
 */
export function livePhase(message: RenderableMessage): LivePhase {
  const { blocks } = message
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i] as RenderableBlock
    if (block.type !== 'tool_call') continue
    const tool = block as ToolCallBlock
    if (tool.status === 'running' || tool.status === 'pending') return { kind: 'tool', call: tool }
  }
  const trailing = blocks[blocks.length - 1]
  if (
    trailing?.type === 'reasoning' &&
    (trailing as Extract<ContentBlock, { type: 'reasoning' }>).durationMs === undefined
  ) {
    return { kind: 'thinking' }
  }
  if (trailing?.type === 'text') return { kind: 'writing' }
  return { kind: 'waiting' }
}

/**
 * Elapsed time. Live: whole seconds (`12s`, `2m 05s`), so the text changes at
 * most once a second. Finished: `640ms` below a second, else the tenths format
 * used by every row timer.
 */
export function formatElapsed(ms: number, options: { live?: boolean } = {}): string {
  const safe = Math.max(0, ms)
  if (options.live) {
    const seconds = Math.floor(safe / 1000)
    if (seconds < 60) return `${seconds}s`
    return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
  }
  if (safe < 1000) return `${Math.round(safe)}ms`
  return formatDuration(safe)
}

/** Token and character counts: exact below 1000, then `2.4k`, `12k`, `1.2M`. */
export function formatTokenCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
}

/** Cost: `$` and four decimals below 0.01, else two; other currencies suffixed. */
export function formatCost(cost: NonNullable<MessageMetrics['cost']>): string {
  const amount = cost.amount.toFixed(Math.abs(cost.amount) < 0.01 && cost.amount !== 0 ? 4 : 2)
  const currency = cost.currency?.toUpperCase()
  return !currency || currency === 'USD' ? `$${amount}` : `${amount} ${currency}`
}

/** The footer facts, in their default order. */
export type FooterFactKey =
  | 'elapsed'
  | 'outcome'
  | 'reasoning'
  | 'plan'
  | 'tools'
  | 'cost'
  | 'context'
  | 'model'
  | 'rate'

export const FOOTER_FACT_ORDER: readonly FooterFactKey[] = [
  'elapsed',
  'outcome',
  'reasoning',
  'plan',
  'tools',
  'cost',
  'context',
  'model',
  'rate',
]

/** One planned footer fact; renderers add glyphs and separators. */
export interface FooterFact {
  key: FooterFactKey
  text: string
}

/** How much activity is shown with the message. */
export type DetailLevel = 'collapsed' | 'details' | 'full'

export interface FooterPlanOptions {
  isActive?: boolean | undefined
  /** Activity detail shown with the message (default `collapsed`). */
  detail?: DetailLevel | undefined
  /** Current time (epoch ms) for a live message's elapsed fact. */
  now?: number | undefined
  /** Which facts, in which order (default {@link FOOTER_FACT_ORDER}). */
  facts?: readonly FooterFactKey[] | undefined
}

/** Plan a message's footer facts (see message-rendering § Agent Activity). */
export function planFooter(
  message: RenderableMessage,
  options: FooterPlanOptions = {},
): FooterFact[] {
  const { isActive = false, detail = 'collapsed', now, facts = FOOTER_FACT_ORDER } = options
  const metrics = message.metrics
  const counts = countActivity(message.blocks)
  const collapsed = detail === 'collapsed'

  const textOf = (key: FooterFactKey): string | undefined => {
    switch (key) {
      case 'elapsed':
        if (isActive) {
          return now !== undefined && message.createdAt !== undefined
            ? formatElapsed(now - message.createdAt, { live: true })
            : undefined
        }
        return metrics?.durationMs !== undefined ? formatElapsed(metrics.durationMs) : undefined
      case 'outcome':
        return message.outcome
          ? message.outcome.kind === 'stopped'
            ? 'stopped'
            : 'failed'
          : undefined
      case 'reasoning':
        return collapsed && counts.reasoningChars > 0
          ? formatTokenCount(counts.reasoningChars)
          : undefined
      case 'plan':
        return collapsed && counts.plan ? `${counts.plan.done}/${counts.plan.total}` : undefined
      case 'tools': {
        const { total, failed } = counts.tools
        if (!collapsed || total === 0) return undefined
        return `${total} tool${total === 1 ? '' : 's'}${failed > 0 ? `, ${failed} failed` : ''}`
      }
      case 'cost':
        return metrics?.cost ? formatCost(metrics.cost) : undefined
      case 'context':
        if (collapsed || !metrics?.context) return undefined
        return `ctx ${formatTokenCount(metrics.context.used)}${
          metrics.context.size !== undefined ? `/${formatTokenCount(metrics.context.size)}` : ''
        }`
      case 'model':
        return metrics?.model || undefined
      case 'rate':
        return isActive ? undefined : formatTokensPerSecond(metrics?.tokensPerSecond)
    }
  }

  const out: FooterFact[] = []
  for (const key of facts) {
    const text = textOf(key)
    if (text) out.push({ key, text })
  }
  return out
}
