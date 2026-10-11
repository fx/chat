import { approxTokenCount, createClockGutterDeduper, positiveTimestamp } from '@fx/chat-core'
import { type PlannedRow, earlierLabel, getBlockTimelineBehavior, planMessage } from '@fx/chat-core'
import { useLiveTokensPerSecond } from '@fx/chat-core/react'
/**
 * `MessageItem` — renders one `ChatMessage`, wrapped with the `data-message-id`
 * anchor contract.
 *
 * It applies the grouping pass (unless `flat`) to fold consecutive auxiliary
 * blocks into a single `BlockGroup`; non-aux blocks render bare. A `raw` debug
 * mode renders the whole message via the registry `JsonView` instead. The footer
 * affordances render beneath the blocks — only for completed (non-`isActive`)
 * assistant messages that carry at least one CONTENT (non-auxiliary) block, and
 * only when the footer actually has something to show (`hasFooterContent`). An
 * auxiliary-only turn (e.g. a tool-call-only step, or reasoning/status with no
 * answer) is part of the assistant answer that FOLLOWS it, not a standalone
 * answer, so it emits no footer chrome at all — even when action callbacks or
 * metrics are present — including no empty timestamp-gutter row.
 *
 * An ACTIVE assistant message with ZERO blocks (the host's optimistic
 * placeholder appended at send time, before the first token arrives) renders a
 * synthetic pending status row — `StatusBlockView` with `phase: 'pre-stream'`
 * ("Starting…", live timer from `createdAt`, tokens/sec pill) — inside the
 * blocks container, in both grouped and `flat` modes, gutter-wrapped when
 * `timestampGutter` is on. A SETTLED (non-active) empty assistant message still
 * renders nothing.
 *
 * In `minimal` (density) mode, an assistant turn folds ALL of its auxiliary
 * blocks into ONE group (via `collapseTurnAux`) rather than only maximal runs,
 * and the footer is forced compact — a denser, single-metadata-line view. `flat`
 * and `raw` FULLY override `minimal`: when either is set, no minimal grouping,
 * no forced compact footer, and no `data-minimal` attribute (an explicitly
 * passed `compactFooter` prop is still honored).
 */
import { type ComponentType, type ReactNode, memo, useState } from 'react'
import { cx } from '../cx'
import { type ActivitySummaryProps, useChatClassNames, useChatComponents } from '../registry'
import { BlockGroup } from './BlockGroup'
import { GutterRow } from './GutterRow'
import { MessageAttachments } from './MessageAttachments'
import {
  LiveFooter,
  MessageFooter,
  detailsActions,
  hasFooterContent,
  messageDetails,
} from './MessageFooter'
import { activityFacts, activityItem } from './activity-items'
import { RawJsonBlockView } from './blocks'
import { BlockView } from './blocks'
import type { BlockRenderContext } from './blocks'
import type { ChatExtensions, RenderableBlock, RenderableMessage } from './extensions'

/** Props for {@link MessageItem}. */
export interface MessageItemProps {
  message: RenderableMessage
  /** Whether THIS message is the actively-streaming one. */
  isActive?: boolean
  /** Render blocks flat (no grouping). */
  flat?: boolean
  /** Render the whole message as JSON (debug). */
  raw?: boolean
  /**
   * Minimal / density mode: fold ALL of an assistant turn's auxiliary blocks
   * into one group (not just maximal runs) and force a compact footer. `flat`
   * and `raw` FULLY override `minimal` (no folding, no forced compact footer,
   * no `data-minimal` attribute); an explicit `compactFooter` still applies.
   */
  minimal?: boolean
  /** Default-open state for collapsibles (verbose/expand-all). */
  defaultOpen?: boolean
  /** Show the footer affordances. */
  showFooter?: boolean
  /**
   * Render each top-level row in a two-column TIMESTAMP GUTTER layout: a
   * host-width left clock cell (`HH:MM:SS`, local, de-duped within this message)
   * + the row content on the right. The cell width is host-supplied via the
   * `gutterTime` classNames key (the package bakes none). OPTIONAL; the host
   * enables it. When OFF (default), rows render in a plain column with no gutter
   * and no timestamps.
   */
  timestampGutter?: boolean
  /** Compact footer mode. */
  compactFooter?: boolean
  /** Activity after content (see core `planMessage`). */
  activityPlacement?: 'inline' | 'after-content'
  /** While live, show only the newest N activity blocks after an `N earlier` row. */
  liveTail?: number
  /**
   * A finished message's activity: its rows (`row`, default) or only the
   * footer's activity facts (`footer`; see core `planMessage`).
   */
  finishedActivity?: 'row' | 'footer'
  /**
   * `summary`: each run of activity rows renders through the registry's
   * `ActivitySummary` presenter (when it provides one) instead of as rows.
   */
  activityDisplay?: 'rows' | 'summary'
  /** Show a footer with whole-second elapsed time while the message is live (opt-in). */
  liveFooter?: boolean
  /** Optional render-layer extensions (custom block/tool renderers + grouping). */
  extensions?: ChatExtensions
  onRegenerate?: () => void
  onFork?: () => void
  onReset?: () => void
}

/** Concatenate a message's text-block prose for the copy affordance. */
export function messageCopyText(message: RenderableMessage): string {
  return message.blocks
    .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('\n\n')
}

/**
 * Resolve the timestamp for a single rendered block, preferring a block-level
 * timestamp (`startedAt`, carried by `tool_call` and `reasoning` blocks) when
 * finite and positive. Returns `undefined` when the block carries none, so the
 * caller falls back to the message `createdAt`.
 */
function blockTimestamp(block: RenderableBlock): number | undefined {
  const startedAt = (block as { startedAt?: number }).startedAt
  return positiveTimestamp(startedAt)
}

/**
 * Resolve the timestamp for one grouped row. A bare row uses its block's
 * timestamp; a group uses its FIRST block's timestamp (the metadata line appears
 * where the run began). `undefined` when no row block carries one.
 */
type GroupedRow = Exclude<PlannedRow, { kind: 'pending' }>
/** A run of activity shown through the `ActivitySummary` presenter. */
type SummaryRow = { kind: 'summary'; key: string; blocks: RenderableBlock[] }
type DisplayRow = GroupedRow | SummaryRow

/** Fold each run of activity rows into one summary row (dropping `earlier` rows). */
function summarize(rows: GroupedRow[], isAux: (block: RenderableBlock) => boolean): DisplayRow[] {
  const out: DisplayRow[] = []
  let run: RenderableBlock[] = []
  const flush = () => {
    const first = run[0]
    if (first) out.push({ kind: 'summary', key: `summary-${first.id}`, blocks: run })
    run = []
  }
  for (const row of rows) {
    if (row.kind === 'group') run.push(...row.blocks)
    else if (row.kind === 'bare' && isAux(row.block)) run.push(row.block)
    else if (row.kind !== 'earlier') {
      flush()
      out.push(row)
    }
  }
  flush()
  return out
}

function groupedItemTimestamp(item: DisplayRow): number | undefined {
  if (item.kind === 'bare') return blockTimestamp(item.block)
  if (item.kind === 'summary') return blockTimestamp(item.blocks[0] as RenderableBlock)
  if (item.kind === 'outcome' || item.kind === 'earlier') return undefined
  // Groups are always non-empty by construction (every group has at least one
  // block), but they are NOT limited to runs of length >= 2 — in minimal mode
  // `collapseTurnAux` can emit a single-item group.
  return blockTimestamp(item.blocks[0] as RenderableBlock)
}

/**
 * Renders a single message and its footer. Memoized: a message re-renders
 * only when its own props change (a settled message stays put while another
 * streams), so callers should pass stable callbacks (`MessageLog` does).
 */
export const MessageItem = memo(function MessageItem({
  message,
  isActive = false,
  flat = false,
  raw = false,
  minimal = false,
  activityPlacement,
  liveTail,
  finishedActivity,
  activityDisplay = 'rows',
  liveFooter = false,
  defaultOpen,
  showFooter = true,
  timestampGutter = false,
  compactFooter = false,
  extensions,
  onRegenerate,
  onFork,
  onReset,
}: MessageItemProps) {
  const cn = useChatClassNames()
  const { MessageDetails, ActivitySummary, icons } = useChatComponents()
  const [details, setDetails] = useState<{ open: boolean; focusId?: string }>({ open: false })
  // A finished message's activity left to the footer, shown again by its
  // facts: as summaries inside the footer (beside the facts), else as rows
  // back in place.
  const [activityShown, setActivityShown] = useState(false)
  const expandInFooter =
    activityDisplay === 'summary' &&
    ActivitySummary !== undefined &&
    finishedActivity === 'footer' &&
    !flat &&
    !raw
  // Only the trailing block of an active message is the streaming one.
  const trailingBlock = message.blocks[message.blocks.length - 1]
  // Tokens/sec for the render context. While ACTIVE, the hook prefers an
  // explicit provider `metrics.tokensPerSecond` (same as after completion) and
  // only falls back to the live estimate — the message's text+reasoning
  // content (≈4 chars/token) over elapsed time since `createdAt`,
  // min-elapsed-guarded so tiny windows yield nothing — when no provider rate
  // is available. Once complete, the finalized precedence — provider
  // `tokensPerSecond`, else `usage.completion` over `durationMs` — reproduces
  // the static derivation this replaced, so completed rendering is unchanged.
  // (The footer reads `message.metrics` directly and never sees a live value.)
  // `tokenCount` is a LIVE-ONLY input: the hook's inactive branch never reads
  // it, so skip the content walk entirely for settled messages instead of
  // re-counting characters on every transcript re-render.
  const tokensPerSecond = useLiveTokensPerSecond({
    startedAt: message.createdAt,
    isActive,
    tokenCount: isActive ? approxTokenCount(message.blocks) : undefined,
    metrics: message.metrics,
  })
  const context: BlockRenderContext = {
    role: message.role,
    isActive,
    message,
    ...(raw ? { raw: true } : {}),
    ...(isActive && trailingBlock ? { activeBlockId: trailingBlock.id } : {}),
    ...(message.outcome ? { outcome: message.outcome } : {}),
    ...(message.createdAt !== undefined ? { startedAt: message.createdAt } : {}),
    ...(message.metrics?.durationMs !== undefined
      ? { durationMs: message.metrics.durationMs }
      : {}),
    ...(tokensPerSecond !== undefined ? { tokensPerSecond } : {}),
    ...(defaultOpen !== undefined ? { defaultOpen } : {}),
  }

  // `RenderableMessage.blocks` already admits host-defined custom kinds (rendered
  // through `extensions.blockRenderers`); a plain `ChatMessage` is assignable, so
  // core behavior is unchanged.
  const blocks = message.blocks
  const behaviorOverrides = extensions?.timelineBehavior

  // Minimal (density) mode folds ALL of an assistant turn's auxiliary blocks into
  // one group and forces a compact footer. `flat` and `raw` FULLY override
  // `minimal` — `minimalActive` gates every minimal-driven behavior (grouping,
  // forced compact footer, and the `data-minimal` attribute).
  const minimalActive = minimal && !flat && !raw
  const effectiveCompactFooter = minimalActive || compactFooter
  // Row + footer planning is shared with every renderer (`planMessage` in
  // core). The flat and raw paths plan no grouping — so they perform no
  // timeline-behavior lookups — and raw never shows a footer. The footer gate is
  // short-circuited so the content-block walk only runs when a footer could
  // render: a completed assistant turn with at least one content (non-aux)
  // block; an aux-only turn is part of the answer that follows.
  const plan = planMessage(message, {
    isActive,
    minimal: minimalActive,
    ...(activityPlacement ? { activityPlacement } : {}),
    ...(liveTail !== undefined ? { liveTail } : {}),
    ...(finishedActivity
      ? { finishedActivity: activityShown && !expandInFooter ? 'row' : finishedActivity }
      : {}),
    flat: flat || raw,
    showFooter: showFooter && !raw,
    overrides: behaviorOverrides,
  })
  const showContentFooter = plan.showFooter
  const plannedRows =
    !flat && !raw ? plan.rows.filter((row): row is GroupedRow => row.kind !== 'pending') : []
  const isAux = (block: RenderableBlock) =>
    getBlockTimelineBehavior(block, behaviorOverrides).auxEligible
  const assistant = message.role === 'assistant'
  // Activity as a summary: each run of activity rows (groups and bare activity
  // blocks; a live tail's `earlier` row folds away) becomes one summary row.
  const summary = activityDisplay === 'summary' && ActivitySummary !== undefined && !flat && !raw
  const groupedItems: DisplayRow[] = summary ? summarize(plannedRows, isAux) : plannedRows
  // The message owns its details presenter (so live activity can open it too)
  // when the registry provides one and something opens it.
  const ownsDetails =
    MessageDetails !== undefined && assistant && !raw && (effectiveCompactFooter || summary)
  // The activity blocks, walked only where something shows them (never on the
  // flat and raw paths, which consult no timeline behavior).
  const auxBlocks =
    !flat && !raw && (summary || ownsDetails || finishedActivity === 'footer')
      ? blocks.filter(isAux)
      : []
  const openDetails = (focusId?: string) =>
    setDetails({ open: true, ...(focusId !== undefined ? { focusId } : {}) })
  const itemContext = {
    isActive,
    activeBlockId: context.activeBlockId,
    tokensPerSecond: isActive ? tokensPerSecond : undefined,
  }
  // Only called in summary mode, which requires the registry's ActivitySummary.
  const Summary = ActivitySummary as ComponentType<ActivitySummaryProps>
  const summaryNode = (key: string, summarized: RenderableBlock[]): ReactNode => (
    <Summary
      key={key}
      items={summarized.map((block) => activityItem(block, itemContext))}
      live={isActive}
      {...(ownsDetails ? { onActivate: (id: string) => openDetails(id) } : {})}
    />
  )
  // Flat mode renders blocks directly, so its outcome row trails them.
  const flatOutcome = flat && !raw ? plan.rows.find((row) => row.kind === 'outcome') : undefined

  // A FRESH per-render clock de-duper, owned by this MessageItem and used only
  // for its own rows in order. Creating it inside render (not sharing one across
  // components) keeps render PURE: every (re-)invocation — StrictMode double
  // invoke, concurrent re-render — starts from the same empty state and yields
  // identical output, so the committed DOM matches. De-dupe is therefore
  // per-message: this message's first same-second row shows the clock and later
  // same-second rows blank; each message's first row shows its own clock (no
  // cross-message suppression). Only consulted when `timestampGutter` is set.
  const gutter = createClockGutterDeduper()

  // Wrap a single top-level row in the two-column gutter layout: a fixed-width
  // left clock cell + the row content. The clock comes from the row's own
  // timestamp (block-level `startedAt` if present, else the message `createdAt`)
  // run through this message's per-render de-duper, so the message's first row of
  // a given second shows the time and later same-second rows render a blank
  // (width-reserved) cell. The cell is `aria-hidden` when blank so screen
  // readers skip it.
  const wrapRow = (
    key: string,
    rowTimestamp: number | undefined,
    row: ReactNode,
    // Footer/attachment rows are not timestamped events — they trail the content
    // and only need to ALIGN with the content column, so they force a blank clock
    // cell (still width-reserving) rather than printing a time.
    blankClock = false,
  ): ReactNode => {
    const source = rowTimestamp ?? message.createdAt
    const clock = blankClock ? '' : gutter(source)
    return (
      <GutterRow key={key} clock={clock}>
        {row}
      </GutterRow>
    )
  }

  const flatRows = (renderRow: (block: RenderableBlock) => ReactNode): ReactNode =>
    blocks.map((block) =>
      timestampGutter
        ? wrapRow(block.id, blockTimestamp(block), renderRow(block))
        : renderRow(block),
    )

  const groupedRows = (
    renderRow: (item: DisplayRow) => { node: ReactNode; key: string },
  ): ReactNode =>
    groupedItems.map((item) => {
      const { node, key } = renderRow(item)
      return timestampGutter ? wrapRow(key, groupedItemTimestamp(item), node) : node
    })

  // Pre-first-token affordance: an ACTIVE assistant message with ZERO blocks is
  // the host's optimistic placeholder — render a synthetic pending status row
  // ("Starting…" with a live timer) instead of nothing. The synthetic block id
  // doubles as the context `activeBlockId` (there is no trailing block to derive
  // it from), so `BlockView` treats the row as the streaming block and
  // `StatusBlockView` gets the live state. It renders as its own branch —
  // flat/grouped both map over an empty array here — and is gutter-wrapped with
  // the message `createdAt` so the clock cell prints. A settled (non-active)
  // empty message keeps rendering nothing.
  const outcomeNode = (text: string): ReactNode => (
    <div key="outcome" className={cx('chat-outcome', cn.outcome)} data-outcome="error" role="alert">
      {text}
    </div>
  )

  const pendingStatusRow = (): ReactNode => {
    const pendingId = `${message.id}:pending`
    const row = summary ? (
      summaryNode(pendingId, [{ type: 'status', id: pendingId, phase: 'pre-stream' }])
    ) : (
      <BlockView
        key={pendingId}
        block={{ type: 'status', id: pendingId, phase: 'pre-stream' }}
        context={{ ...context, activeBlockId: pendingId }}
        {...(extensions ? { extensions } : {})}
      />
    )
    return timestampGutter ? wrapRow(pendingId, message.createdAt, row) : row
  }

  return (
    <div
      className={cx('chat-message', cn.message)}
      data-message-id={message.id}
      data-role={message.role}
      {...(minimalActive ? { 'data-minimal': 'true' } : {})}
      {...(timestampGutter ? { 'data-timestamp-gutter': 'true' } : {})}
    >
      {raw ? (
        <RawJsonBlockView value={message} />
      ) : (
        <div className={cx('chat-message-blocks', cn.messageBlocks)}>
          {isActive && message.role === 'assistant' && blocks.length === 0
            ? pendingStatusRow()
            : flat
              ? flatRows((block) => (
                  <BlockView
                    key={block.id}
                    block={block}
                    context={context}
                    {...(extensions ? { extensions } : {})}
                  />
                ))
              : groupedRows((item) => {
                  if (item.kind === 'bare') {
                    return {
                      key: item.block.id,
                      node: (
                        <BlockView
                          key={item.block.id}
                          block={item.block}
                          context={context}
                          {...(extensions ? { extensions } : {})}
                        />
                      ),
                    }
                  }
                  if (item.kind === 'outcome')
                    return { key: 'outcome', node: outcomeNode(item.outcome.message) }
                  if (item.kind === 'summary')
                    return { key: item.key, node: summaryNode(item.key, item.blocks) }
                  if (item.kind === 'earlier') {
                    return {
                      key: item.key,
                      node: (
                        <div
                          key={item.key}
                          className={cx('chat-earlier', cn.earlier)}
                          data-count={item.count}
                          data-tools={item.tools}
                        >
                          {earlierLabel(item)}
                        </div>
                      ),
                    }
                  }
                  return {
                    key: item.key,
                    node: (
                      <BlockGroup
                        key={item.key}
                        blocks={item.blocks}
                        context={context}
                        {...(defaultOpen !== undefined ? { defaultOpen } : {})}
                        {...(extensions ? { extensions } : {})}
                      />
                    ),
                  }
                })}
          {flatOutcome?.kind === 'outcome'
            ? timestampGutter
              ? wrapRow('outcome', undefined, outcomeNode(flatOutcome.outcome.message), true)
              : outcomeNode(flatOutcome.outcome.message)
            : null}
        </div>
      )}
      {!raw && message.role === 'user' && message.attachments && message.attachments.length > 0
        ? (() => {
            const attachments = <MessageAttachments attachments={message.attachments} />
            // With the gutter on, align the attachments with the content column
            // (block rows are gutter-wrapped) via a blank clock cell.
            return timestampGutter
              ? wrapRow('attachments', undefined, attachments, true)
              : attachments
          })()
        : null}
      {liveFooter && isActive && message.role === 'assistant' && blocks.length > 0 ? (
        <LiveFooter startedAt={message.createdAt} />
      ) : null}
      {showContentFooter
        ? (() => {
            const copyText = messageCopyText(message)
            // Gate the ENTIRE branch — including the gutter-row wrapper below —
            // on the footer having something to render. `MessageFooter` would
            // return null anyway (zero-affordance early return), but without
            // this gate a timestamp-gutter layout would still emit an empty
            // `.chat-gutter-row` with a blank clock cell around it.
            const metrics = message.metrics
            const outcome = message.outcome
            if (!hasFooterContent({ copyText, onRegenerate, onFork, onReset, metrics, outcome })) {
              return null
            }
            const facts = finishedActivity === 'footer' && !flat ? activityFacts(auxBlocks) : []
            const footer = (
              <MessageFooter
                copyText={copyText}
                compact={effectiveCompactFooter}
                {...(ownsDetails ? { onOpenDetails: () => openDetails() } : {})}
                {...(facts.length > 0
                  ? {
                      activity: facts,
                      activityShown,
                      onToggleActivity: () => setActivityShown((shown) => !shown),
                      ...(expandInFooter && activityShown
                        ? { activityItems: summaryNode('footer-activity', auxBlocks) }
                        : {}),
                    }
                  : {})}
                {...(metrics ? { metrics } : {})}
                {...(outcome ? { outcome } : {})}
                {...(onRegenerate ? { onRegenerate } : {})}
                {...(onFork ? { onFork } : {})}
                {...(onReset ? { onReset } : {})}
              />
            )
            // With the gutter on, align the footer with the content column (block
            // rows are gutter-wrapped) via a blank clock cell.
            return timestampGutter ? wrapRow('footer', undefined, footer, true) : footer
          })()
        : null}
      {ownsDetails && MessageDetails ? (
        <MessageDetails
          open={details.open}
          onOpenChange={(open) => setDetails((current) => ({ ...current, open }))}
          details={messageDetails(message.metrics)}
          outcome={
            message.outcome?.kind === 'error'
              ? { kind: 'error', message: message.outcome.message }
              : message.outcome
          }
          // A live message offers no copy or actions until it settles.
          copyText={isActive ? '' : messageCopyText(message).trim() ? messageCopyText(message) : ''}
          actions={
            isActive
              ? []
              : detailsActions(icons, {
                  ...(onRegenerate ? { onRegenerate } : {}),
                  ...(onFork ? { onFork } : {}),
                  ...(onReset ? { onReset } : {}),
                })
          }
          {...(auxBlocks.length > 0
            ? {
                activity: (
                  <div className={cx('chat-details-activity', cn.detailsActivity)}>
                    {auxBlocks.map((block) => (
                      <div
                        key={block.id}
                        className={cx('chat-details-activity-item', cn.detailsActivityItem)}
                        data-block-id={block.id}
                        {...(block.id === details.focusId ? { 'data-focused': 'true' } : {})}
                      >
                        <BlockView
                          block={block}
                          context={
                            block.id === details.focusId
                              ? { ...context, defaultOpen: true }
                              : context
                          }
                          {...(extensions ? { extensions } : {})}
                        />
                      </div>
                    ))}
                  </div>
                ),
              }
            : {})}
          {...(details.focusId !== undefined ? { focusId: details.focusId } : {})}
        />
      ) : null}
    </div>
  )
})
