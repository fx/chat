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
import type { ReactNode } from 'react'
import { cx } from '../cx'
import { useChatClassNames } from '../registry'
import { BlockGroup } from './BlockGroup'
import { GutterRow } from './GutterRow'
import { MessageAttachments } from './MessageAttachments'
import { MessageFooter, hasFooterContent } from './MessageFooter'
import { RawJsonBlockView } from './blocks'
import { BlockView } from './blocks'
import type { BlockRenderContext } from './blocks'
import type { ChatExtensions, RenderableBlock, RenderableMessage } from './extensions'
import { approxTokenCount, createClockGutterDeduper, positiveTimestamp } from './format'
import { type GroupedItem, getTimelineBehavior, groupBlocks } from './grouping'
import { useLiveTokensPerSecond } from './hooks'
import { collapseTurnAux } from './minimalGrouping'

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
function groupedItemTimestamp(item: GroupedItem): number | undefined {
  if (item.kind === 'bare') return blockTimestamp(item.block)
  // Groups are always non-empty by construction (every group has at least one
  // block), but they are NOT limited to runs of length >= 2 — in minimal mode
  // `collapseTurnAux` can emit a single-item group.
  return blockTimestamp(item.blocks[0] as RenderableBlock)
}

/** Renders a single message and its footer. */
export function MessageItem({
  message,
  isActive = false,
  flat = false,
  raw = false,
  minimal = false,
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

  // The footer renders only for a completed assistant turn the host asked for a
  // footer on — a cheap eligibility gate computed BEFORE any block walk.
  const footerEligible = showFooter && !raw && message.role === 'assistant' && !isActive
  // Whether the message carries at least one CONTENT (non-auxiliary) block —
  // i.e. an actual answer (`text`/`system`), not just auxiliary chrome
  // (`tool_call`/`reasoning`/`status`). Consults the timeline-behavior registry
  // by block TYPE (honoring type-level and custom-block host overrides) rather
  // than branching on block kind — content-worthiness is a per-kind question,
  // not a per-tool-name one, so it deliberately uses `getTimelineBehavior` and
  // never the per-tool-name resolution (keeping the flat/raw "no per-name
  // lookup" guarantee intact).
  //
  // Short-circuited behind `footerEligible` so the `.some()` walk — and the
  // registry lookup it performs — runs ONLY when the footer could actually
  // render, never on the raw, hidden (`showFooter={false}`), non-assistant, or
  // active paths, which must avoid timeline-behavior lookups and any host
  // override getter side effects. An auxiliary-only turn (e.g. a tool-call-only
  // step) is part of the assistant answer that follows, not a standalone
  // answer, so it gets no footer even when action callbacks or metrics are
  // present.
  const showContentFooter =
    footerEligible &&
    blocks.some((block) => !getTimelineBehavior(block.type, behaviorOverrides).auxEligible)

  // Minimal (density) mode folds ALL of an assistant turn's auxiliary blocks into
  // one group (via collapseTurnAux) and forces a compact footer. `flat` and `raw`
  // FULLY override `minimal` — `minimalActive` gates every minimal-driven
  // behavior (grouping, forced compact footer, and the `data-minimal` attribute)
  // so neither is applied in flat/raw mode. User messages get the compact chrome
  // but no aux-collapse (the default non-aux behavior keeps content bare/visible).
  const minimalActive = minimal && !flat && !raw
  const useMinimalGrouping = minimalActive && message.role === 'assistant'
  const effectiveCompactFooter = minimalActive || compactFooter
  // Only compute grouping when the grouped render path actually consumes it. The
  // flat path renders every block bare and the raw path renders JSON, so running
  // collapseTurnAux/groupBlocks (and their timelineBehavior hooks) there is
  // wasted work — gate it on `!flat && !raw`.
  const groupedItems =
    !flat && !raw
      ? useMinimalGrouping
        ? collapseTurnAux(blocks, behaviorOverrides)
        : groupBlocks(blocks, behaviorOverrides)
      : []

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
    renderRow: (item: GroupedItem) => { node: ReactNode; key: string },
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
  const pendingStatusRow = (): ReactNode => {
    const pendingId = `${message.id}:pending`
    const row = (
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
              : groupedRows((item) =>
                  item.kind === 'bare'
                    ? {
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
                    : {
                        key: `group-${(item.blocks[0] as { id: string }).id}`,
                        node: (
                          <BlockGroup
                            key={`group-${(item.blocks[0] as { id: string }).id}`}
                            blocks={item.blocks}
                            context={context}
                            {...(defaultOpen !== undefined ? { defaultOpen } : {})}
                            {...(extensions ? { extensions } : {})}
                          />
                        ),
                      },
                )}
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
      {showContentFooter
        ? (() => {
            const copyText = messageCopyText(message)
            // Gate the ENTIRE branch — including the gutter-row wrapper below —
            // on the footer having something to render. `MessageFooter` would
            // return null anyway (zero-affordance early return), but without
            // this gate a timestamp-gutter layout would still emit an empty
            // `.chat-gutter-row` with a blank clock cell around it.
            const metrics = message.metrics
            if (!hasFooterContent({ copyText, onRegenerate, onFork, onReset, metrics })) {
              return null
            }
            const footer = (
              <MessageFooter
                copyText={copyText}
                compact={effectiveCompactFooter}
                {...(metrics ? { metrics } : {})}
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
    </div>
  )
}
