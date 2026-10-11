/**
 * Render planning: the renderer-independent decisions every transcript
 * renderer makes about a message — which rows it shows (bare blocks, folded
 * auxiliary groups, the pending "Starting…" row), which block is live, what a
 * collapsed group's header says and whether it ticks, whether the footer
 * shows, and how footer metrics read.
 *
 * Pure: no React, no DOM. The React-DOM and terminal renderers both project
 * these plans, so labels, timers, and gates cannot drift between them.
 */
import type {
  ContentBlock,
  MessageMetrics,
  MessageOutcome,
  StatusBlock,
  ToolCallBlock,
} from '../model'
import { type BlockSummary, summarizeBlock } from './blockSummary'
import type { RenderableBlock, RenderableMessage } from './extensions'
import { formatDuration, formatTokensPerSecond, positiveTimestamp } from './format'
import {
  type TimelineBehavior,
  getBlockTimelineBehavior,
  groupBlocks,
  selectHeaderSummary,
} from './grouping'
import { collapseTurnAux } from './minimalGrouping'
import { toolHeadline } from './tool'

type Overrides = Record<string, Partial<TimelineBehavior>> | undefined

/** Which message is live, and which of its blocks is the trailing live one. */
export interface ActivityContext {
  /** Whether the owning message is the actively streaming one. */
  isActive?: boolean | undefined
  /** Id of the message's trailing block while it streams. */
  activeBlockId?: string | undefined
  /** How the message ended, when it did not simply complete. */
  outcome?: MessageOutcome | undefined
}

/**
 * Whether one block is live. A tool call is live while `pending`/`running`
 * at any position — but only while its message is live and has no outcome, so
 * a stopped or settled message never shows a spinner; a status row only as
 * the trailing block of the streaming message; reasoning only while trailing
 * AND unfinished (no `durationMs`); any other block while trailing.
 */
export function isBlockActive(block: RenderableBlock, context: ActivityContext): boolean {
  if (block.type === 'tool_call') {
    const status = (block as Extract<ContentBlock, { type: 'tool_call' }>).status
    return (
      Boolean(context.isActive) &&
      !context.outcome &&
      (status === 'running' || status === 'pending')
    )
  }
  const trailing = Boolean(context.isActive) && block.id === context.activeBlockId
  if (block.type === 'reasoning') {
    return (
      trailing && (block as Extract<ContentBlock, { type: 'reasoning' }>).durationMs === undefined
    )
  }
  return trailing
}

/** One planned row of a message. */
export type PlannedRow =
  /** The live placeholder for an active assistant message with no blocks yet. */
  | { kind: 'pending'; id: string }
  | { kind: 'bare'; block: RenderableBlock }
  /** A collapsed run of auxiliary blocks; `key` is stable across appends. */
  | { kind: 'group'; key: string; blocks: RenderableBlock[] }
  /** The error an assistant message ended with, shown after its content. */
  | { kind: 'outcome'; outcome: Extract<MessageOutcome, { kind: 'error' }> }
  /**
   * Live tail: `count` activity blocks older than the first shown row are
   * hidden, `tools` of them tool calls (the rest plans and other activity;
   * hidden reasoning is not counted). See {@link earlierLabel}.
   */
  | { kind: 'earlier'; key: string; count: number; tools: number }

export interface MessagePlanOptions {
  isActive?: boolean | undefined
  /** Fold an assistant turn's auxiliary blocks into one group. */
  minimal?: boolean | undefined
  /** No grouping: every block is a bare row. */
  flat?: boolean | undefined
  /** Whether the host wants footers at all (default true). */
  showFooter?: boolean | undefined
  /**
   * `inline` (default): blocks in stream order, auxiliary runs folded into
   * groups. `after-content`: content blocks (and the outcome row) first, then
   * the turn's auxiliary blocks as one group (a single block stays bare, as a
   * run of one does inline).
   */
  activityPlacement?: 'inline' | 'after-content' | undefined
  /**
   * A finished message's activity: its own rows (`row`, default), or only the
   * footer's counts (`footer`) — every auxiliary row (bare blocks and groups)
   * is dropped from a non-live assistant message whose footer shows. Hosts
   * pass it only while the activity is collapsed. Flat planning ignores it.
   */
  finishedActivity?: 'row' | 'footer' | undefined
  /**
   * While the message is live, show only the newest N tool calls (plus the
   * latest plan, live status rows, and reasoning while nothing else has
   * arrived) bare, after an `earlier` row counting the hidden activity older
   * than the first shown row — reasoning the tail hides is not counted (the
   * footer's reasoning count covers it). Hosts pass
   * it only while the activity is collapsed.
   */
  liveTail?: number | undefined
  overrides?: Overrides
}

export interface MessagePlan {
  rows: PlannedRow[]
  /** The trailing block's id while the message is active. */
  activeBlockId?: string
  /**
   * Whether the completion footer shows: assistant, not active, and at least
   * one non-auxiliary (content) block or an outcome — an aux-only or empty turn
   * without an outcome gets none.
   */
  showFooter: boolean
}

/** The activity blocks a live tail shows (see {@link MessagePlanOptions.liveTail}). */
function tailVisible(
  aux: RenderableBlock[],
  all: RenderableBlock[],
  tail: number,
): Set<RenderableBlock> {
  const visible = new Set<RenderableBlock>()
  const tools = aux.filter((block) => block.type === 'tool_call')
  for (const tool of tools.slice(-tail)) visible.add(tool)
  const plans = aux.filter((block) => block.type === 'plan')
  if (plans.length > 0) visible.add(plans[plans.length - 1] as RenderableBlock)
  for (const block of aux) if (block.type === 'status') visible.add(block)
  const somethingElse = all.some((block) => block.type === 'text' || block.type === 'tool_call')
  const reasoning = aux.filter((block) => block.type === 'reasoning')
  if (!somethingElse && reasoning.length > 0)
    visible.add(reasoning[reasoning.length - 1] as RenderableBlock)
  return visible
}

export function planMessage(
  message: RenderableMessage,
  options: MessagePlanOptions = {},
): MessagePlan {
  const {
    isActive = false,
    minimal = false,
    flat = false,
    showFooter = true,
    activityPlacement = 'inline',
    finishedActivity = 'row',
    liveTail,
    overrides,
  } = options
  const { blocks } = message
  const trailing = blocks[blocks.length - 1]
  const activeBlockId = isActive && trailing ? trailing.id : undefined
  const { outcome } = message
  const assistant = message.role === 'assistant'
  const outcomeRow: PlannedRow[] =
    outcome?.kind === 'error' && assistant ? [{ kind: 'outcome', outcome }] : []
  const isAux = (block: RenderableBlock) => getBlockTimelineBehavior(block, overrides).auxEligible

  let rows: PlannedRow[]
  if (isActive && assistant && blocks.length === 0) {
    rows = [{ kind: 'pending', id: `${message.id}:pending` }]
  } else if (flat) {
    rows = [...blocks.map((block): PlannedRow => ({ kind: 'bare', block })), ...outcomeRow]
  } else if (assistant && isActive && liveTail !== undefined && liveTail > 0) {
    const aux = blocks.filter(isAux)
    const visible = tailVisible(aux, blocks, liveTail)
    // Announce only what would have been a row above the tail: hidden blocks
    // older than its first shown tool call, never hidden reasoning. The latest
    // plan and status rows show however old they are, so they do not anchor it.
    const first = aux.findIndex((block) => block.type === 'tool_call' && visible.has(block))
    const hidden = aux.filter(
      (block, i) =>
        !visible.has(block) && block.type !== 'reasoning' && (first === -1 || i < first),
    )
    const earlier: PlannedRow[] =
      hidden.length > 0
        ? [
            {
              kind: 'earlier',
              key: `earlier-${message.id}`,
              count: hidden.length,
              tools: hidden.filter((block) => block.type === 'tool_call').length,
            },
          ]
        : []
    const shown = (block: RenderableBlock) => !isAux(block) || visible.has(block)
    if (activityPlacement === 'after-content') {
      rows = [
        ...blocks
          .filter((block) => !isAux(block))
          .map((block): PlannedRow => ({ kind: 'bare', block })),
        ...outcomeRow,
        ...earlier,
        ...aux
          .filter((block) => visible.has(block))
          .map((block): PlannedRow => ({ kind: 'bare', block })),
      ]
    } else {
      rows = []
      let placed = false
      for (const block of blocks) {
        if (!shown(block)) continue
        if (!placed && isAux(block)) {
          rows.push(...earlier)
          placed = true
        }
        rows.push({ kind: 'bare', block })
      }
      if (!placed) rows.push(...earlier)
      rows.push(...outcomeRow)
    }
  } else if (assistant && activityPlacement === 'after-content') {
    const aux = blocks.filter(isAux)
    rows = [
      ...blocks
        .filter((block) => !isAux(block))
        .map((block): PlannedRow => ({ kind: 'bare', block })),
      ...outcomeRow,
      ...(aux.length > 1
        ? [
            {
              kind: 'group' as const,
              key: `activity-${(aux[0] as RenderableBlock).id}`,
              blocks: aux,
            },
          ]
        : aux.map((block): PlannedRow => ({ kind: 'bare', block }))),
    ]
  } else {
    const grouped =
      minimal && assistant ? collapseTurnAux(blocks, overrides) : groupBlocks(blocks, overrides)
    rows = [
      ...grouped.map(
        (item): PlannedRow =>
          item.kind === 'bare'
            ? { kind: 'bare', block: item.block }
            : {
                kind: 'group',
                key: `group-${(item.blocks[0] as RenderableBlock).id}`,
                blocks: item.blocks,
              },
      ),
      ...outcomeRow,
    ]
  }

  const footer =
    showFooter &&
    assistant &&
    !isActive &&
    (outcome !== undefined || blocks.some((block) => !isAux(block)))

  // A finished answer may leave its activity to the footer's counts — only
  // when there is a footer to carry them.
  if (finishedActivity === 'footer' && footer && !flat) {
    rows = rows.filter((row) => row.kind !== 'group' && !(row.kind === 'bare' && isAux(row.block)))
  }

  return { rows, ...(activeBlockId ? { activeBlockId } : {}), showFooter: footer }
}

/**
 * The live tail's `earlier` row as plain text: `+2 earlier tool calls`,
 * `+1 earlier step`, or `+3 earlier steps (2 tool calls)` when both kinds are
 * hidden. Renderers add their own marker.
 */
export function earlierLabel(row: { count: number; tools: number }): string {
  const s = (n: number) => (n === 1 ? '' : 's')
  if (row.tools === row.count) return `+${row.count} earlier tool call${s(row.count)}`
  if (row.tools === 0) return `+${row.count} earlier step${s(row.count)}`
  return `+${row.count} earlier steps (${row.tools} tool call${s(row.tools)})`
}

/** Context for planning a collapsed group's header. */
export interface GroupHeaderContext extends ActivityContext {
  /** The message's start (fallback timer anchor). */
  startedAt?: number | undefined
  /** The message's finalized duration (status-headed groups show it). */
  durationMs?: number | undefined
  overrides?: Overrides
}

/** A group's tool calls, counted for its header (see {@link toolGroupLabel}). */
export interface ToolGroupCounts {
  total: number
  /** Calls that finished successfully. */
  succeeded: number
  /** Calls that failed, including denied and unavailable ones. */
  failed: number
  /** The latest live call, while one runs. */
  running?: ToolCallBlock
  /** The call itself, when the group holds exactly one. */
  only?: ToolCallBlock
}

export interface GroupHeaderPlan {
  /**
   * What the header is about: the group's tool calls (`tools`; reasoning and
   * status rows are not mentioned), its reasoning (`reasoning`), or one
   * summary block (`block`: a plan, a live status row, other kinds).
   */
  kind: 'tools' | 'reasoning' | 'block'
  /** The counts a `tools` header states; renderers may format them with their own glyphs. */
  tools?: ToolGroupCounts
  /** How many reasoning blocks a `reasoning` header covers. */
  reasoningCount?: number
  /** The block heading the group. */
  summaryBlock: RenderableBlock
  summary: BlockSummary
  /** The `+N` count of other blocks in the group; 0 when the label states what the group holds. */
  hiddenCount: number
  /** Whether any block in the group is live (spinner). */
  isActive: boolean
  /** Whether the header carries a timer pill. */
  showTimer: boolean
  /** Finalized duration for the pill, when known. */
  durationMs?: number
  /** Live timer anchor. */
  startedAt?: number
  /** Whether the header may show the message's tokens/sec. */
  showRate: boolean
}

/** Whether a tool call failed: an error, or a denied or unavailable approval. */
function toolFailed(tool: ToolCallBlock): boolean {
  const approval = tool.approval?.state
  return tool.status === 'error' || approval === 'denied' || approval === 'unavailable'
}

/**
 * The wall-clock time of a group's tool calls: from the earliest start to the
 * latest end of the calls with a duration (parallel calls overlap), or the sum
 * of their durations when one lacks a start; undefined when none has one.
 */
export function toolSpanMs(tools: ToolCallBlock[]): number | undefined {
  // Only finite, non-negative durations count; a bad one never poisons the span.
  const timed = tools.filter(
    (tool) => Number.isFinite(tool.durationMs) && (tool.durationMs as number) >= 0,
  )
  if (timed.length === 0) return undefined
  const starts = timed.map((tool) => positiveTimestamp(tool.startedAt))
  if (starts.every((start) => start !== undefined)) {
    const first = Math.min(...(starts as number[]))
    const last = Math.max(
      ...timed.map((tool, i) => (starts[i] as number) + (tool.durationMs as number)),
    )
    return last - first
  }
  return timed.reduce((sum, tool) => sum + (tool.durationMs as number), 0)
}

/**
 * A tool group's header as plain text: one call reads as its row does
 * (`toolHeadline`); more read `5 tool calls`, then `4 ok · 1 failed` when any
 * failed, then the running call's headline while one runs, then the duration
 * when given. Renderers with glyphs may format {@link ToolGroupCounts} themselves.
 */
export function toolGroupLabel(tools: ToolGroupCounts, durationMs?: number): string {
  const parts: string[] = []
  if (tools.only) {
    parts.push(toolHeadline(tools.only))
  } else {
    parts.push(`${tools.total} tool call${tools.total === 1 ? '' : 's'}`)
    if (tools.failed > 0) parts.push(`${tools.succeeded} ok`, `${tools.failed} failed`)
    if (tools.running) parts.push(toolHeadline(tools.running))
  }
  if (durationMs !== undefined) parts.push(formatDuration(durationMs))
  return parts.join(' · ')
}

/**
 * Plan a collapsed group's header.
 *
 * - A group with tool calls is about them only: their count (or the one
 *   call's headline), how many failed, the running call while live, and their
 *   time — the span of the calls, or a live timer from the earliest start.
 * - Else a group of reasoning (and finished status rows): one block reads as
 *   its row; two or more read `Thought ×N · <total>` (`Thinking… ×N` live).
 * - Else a plan heads it (unless a live status row trails), else the grouping
 *   policy's summary block (a trailing live status row keeps its timer; else
 *   the latest header-eligible block), with the `+N` count.
 */
export function planGroupHeader(
  blocks: RenderableBlock[],
  context: GroupHeaderContext,
): GroupHeaderPlan {
  const trailing = blocks[blocks.length - 1] as RenderableBlock
  const isActive = blocks.some((block) => isBlockActive(block, context))
  const rate = isActive || !context.isActive

  const tools = blocks.filter((block) => block.type === 'tool_call') as ToolCallBlock[]
  if (tools.length > 0) {
    const live = tools.filter((tool) => isBlockActive(tool, context))
    const running = live[live.length - 1]
    const counts: ToolGroupCounts = {
      total: tools.length,
      succeeded: tools.filter((tool) => tool.status === 'success' && !toolFailed(tool)).length,
      failed: tools.filter(toolFailed).length,
      ...(running ? { running } : {}),
      ...(tools.length === 1 ? { only: tools[0] as ToolCallBlock } : {}),
    }
    // The time ticks only while a call runs; otherwise it is the calls' span.
    const durationMs = running ? undefined : toolSpanMs(tools)
    const showTimer = running !== undefined || durationMs !== undefined
    const starts = tools
      .map((tool) => positiveTimestamp(tool.startedAt))
      .filter((start): start is number => start !== undefined)
    const startedAt = starts.length > 0 ? Math.min(...starts) : context.startedAt
    return {
      kind: 'tools',
      tools: counts,
      summaryBlock: running ?? (tools[tools.length - 1] as ToolCallBlock),
      summary: {
        iconName: 'wrench',
        label: toolGroupLabel(counts),
        ...(durationMs !== undefined ? { durationMs } : {}),
        showTimer,
      },
      hiddenCount: 0,
      isActive,
      showTimer,
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(startedAt !== undefined ? { startedAt } : {}),
      showRate: false,
    }
  }

  const trailingLiveStatus = trailing.type === 'status' && isBlockActive(trailing, context)
  const reasoning = blocks.filter((block) => block.type === 'reasoning') as Array<
    Extract<ContentBlock, { type: 'reasoning' }>
  >
  const reasoningOnly =
    reasoning.length > 0 &&
    blocks.every((block) => block.type === 'reasoning' || block.type === 'status')
  if (reasoningOnly && !trailingLiveStatus) {
    const liveThought = reasoning.find((block) => isBlockActive(block, context))
    const anchor = liveThought ?? (reasoning[reasoning.length - 1] as (typeof reasoning)[number])
    const startedAt = positiveTimestamp(anchor.startedAt) ?? context.startedAt
    let summary: BlockSummary
    if (reasoning.length === 1) {
      summary = summarizeBlock(anchor, { isActive: liveThought !== undefined })
    } else if (liveThought) {
      summary = { iconName: 'brain', label: `Thinking… ×${reasoning.length}`, showTimer: true }
    } else {
      const timed = reasoning.filter((block) => block.durationMs !== undefined)
      const total = timed.reduce((sum, block) => sum + (block.durationMs as number), 0)
      summary = {
        iconName: 'brain',
        label:
          timed.length > 0
            ? `Thought ×${reasoning.length} · ${formatDuration(total)}`
            : `Reasoning ×${reasoning.length}`,
        ...(timed.length > 0 ? { durationMs: total } : {}),
        showTimer: false,
      }
    }
    return {
      kind: 'reasoning',
      reasoningCount: reasoning.length,
      summaryBlock: anchor,
      summary,
      hiddenCount: 0,
      isActive,
      // Only a live thought ticks; a finished one carries its time in the label.
      showTimer: summary.showTimer,
      ...(startedAt !== undefined ? { startedAt } : {}),
      showRate: rate,
    }
  }

  const plans = blocks.filter((block) => block.type === 'plan')
  const latestPlan = trailingLiveStatus ? undefined : plans[plans.length - 1]
  const { block: summaryBlock, hiddenCount } = latestPlan
    ? { block: latestPlan, hiddenCount: blocks.length - 1 }
    : selectHeaderSummary(blocks, isBlockActive(trailing, context), context.overrides)
  const summary = summarizeBlock(summaryBlock, { isActive: isBlockActive(summaryBlock, context) })
  const summaryIsStatus = summaryBlock.type === 'status'
  const showTimer = summaryIsStatus || summary.showTimer
  const durationMs = summaryIsStatus ? context.durationMs : summary.durationMs
  const startedAt =
    positiveTimestamp(
      summaryBlock.type === 'reasoning'
        ? (summaryBlock as Extract<ContentBlock, { type: 'reasoning' }>).startedAt
        : undefined,
    ) ?? context.startedAt
  return {
    kind: 'block',
    summaryBlock,
    summary,
    hiddenCount,
    isActive,
    showTimer,
    ...(showTimer && durationMs !== undefined ? { durationMs } : {}),
    ...(startedAt !== undefined ? { startedAt } : {}),
    // A status-headed group shows the rate only while live; otherwise while
    // live, or once the whole message has finished.
    showRate: summaryIsStatus ? isActive : rate,
  }
}

/** The status row's label: "Starting…" / "Generating…" while live, else "Generated". */
export function statusLabel(phase: StatusBlock['phase'], isActive: boolean): string {
  if (isActive) return phase === 'pre-stream' ? 'Starting…' : 'Generating…'
  return 'Generated'
}

/**
 * Whether a row shows its timer pill: a finalized duration always does; a
 * live row only with a usable (finite) clock anchor, so it never shows a
 * frozen "0.0s".
 */
export function shouldShowTimer(input: {
  showTimer: boolean
  isActive: boolean
  startedAt?: number | undefined
  durationMs?: number | undefined
}): boolean {
  return (
    input.showTimer &&
    (input.durationMs !== undefined || (input.isActive && Number.isFinite(input.startedAt)))
  )
}

/** Footer metrics as `model · 1.2s · 34 tok/s`, or `undefined` when there are none. */
export function formatFooterMetrics(metrics: MessageMetrics | undefined): string | undefined {
  if (!metrics) return undefined
  const parts: string[] = []
  if (metrics.model) parts.push(metrics.model)
  if (metrics.durationMs !== undefined) parts.push(formatDuration(metrics.durationMs))
  const tps = formatTokensPerSecond(metrics.tokensPerSecond)
  if (tps) parts.push(tps)
  return parts.length > 0 ? parts.join(' · ') : undefined
}
