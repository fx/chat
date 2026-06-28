/**
 * `MessageItem` — renders one `ChatMessage`, wrapped with the `data-message-id`
 * anchor contract.
 *
 * It applies the grouping pass (unless `flat`) to fold consecutive auxiliary
 * blocks into a single `BlockGroup`; non-aux blocks render bare. A `raw` debug
 * mode renders the whole message via the registry `JsonView` instead. The footer
 * affordances render beneath the blocks.
 *
 * In `minimal` (density) mode, an assistant turn folds ALL of its auxiliary
 * blocks into ONE group (via `collapseTurnAux`) rather than only maximal runs,
 * and the footer is forced compact — a denser, single-metadata-line view. `flat`
 * and `raw` FULLY override `minimal`: when either is set, no minimal grouping,
 * no forced compact footer, and no `data-minimal` attribute (an explicitly
 * passed `compactFooter` prop is still honored).
 */
import type { ReactNode } from 'react'
import { BlockGroup } from './BlockGroup'
import { MessageAttachments } from './MessageAttachments'
import { MessageFooter } from './MessageFooter'
import { RawJsonBlockView } from './blocks'
import { BlockView } from './blocks'
import type { BlockRenderContext } from './blocks'
import type { ChatExtensions, RenderableBlock, RenderableMessage } from './extensions'
import { createClockGutterDeduper, deriveTokensPerSecond } from './format'
import { type GroupedItem, groupBlocks } from './grouping'
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
   * Render each top-level row in a two-column TIMESTAMP GUTTER layout: a fixed
   * 56px left clock cell (`HH:MM:SS`, local, de-duped within this message) + the
   * row content on the right. OPTIONAL; the host enables it. When OFF (default),
   * rows render in a plain column with no gutter and no timestamps.
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

/** A finite, positive number, else `undefined`. */
function positiveTimestamp(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined
}

/**
 * Resolve the timestamp for a single rendered block, preferring a block-level
 * timestamp (`startedAt`, currently carried by `tool_call` blocks) when finite
 * and positive. Returns `undefined` when the block carries none, so the caller
 * falls back to the message `createdAt`.
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
  // Groups are non-empty by construction (only runs of length >= 2 form a group).
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
  // Only the trailing block of an active message is the streaming one.
  const trailingBlock = message.blocks[message.blocks.length - 1]
  // Prefer a provider tokens/sec, else derive it from usage/duration so the pill
  // appears for the common metrics shape that omits a precomputed rate.
  const tokensPerSecond = deriveTokensPerSecond(
    message.metrics?.tokensPerSecond,
    message.metrics?.usage?.completion,
    message.metrics?.durationMs,
  )
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
  const wrapRow = (key: string, rowTimestamp: number | undefined, row: ReactNode): ReactNode => {
    const source = rowTimestamp ?? message.createdAt
    const clock = gutter(source)
    return (
      <div className="chat-gutter-row" key={key}>
        <span
          className="chat-gutter-time"
          data-testid="chat-gutter-time"
          {...(clock === '' ? { 'aria-hidden': true } : {})}
        >
          {clock}
        </span>
        <div className="chat-gutter-content">{row}</div>
      </div>
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

  return (
    <div
      className="chat-message"
      data-message-id={message.id}
      data-role={message.role}
      {...(minimalActive ? { 'data-minimal': 'true' } : {})}
      {...(timestampGutter ? { 'data-timestamp-gutter': 'true' } : {})}
    >
      {raw ? (
        <RawJsonBlockView value={message} />
      ) : (
        <div className="chat-message-blocks">
          {flat
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
      {!raw && message.role === 'user' && message.attachments && message.attachments.length > 0 ? (
        <MessageAttachments attachments={message.attachments} />
      ) : null}
      {showFooter && !raw ? (
        <MessageFooter
          copyText={messageCopyText(message)}
          compact={effectiveCompactFooter}
          {...(message.metrics ? { metrics: message.metrics } : {})}
          {...(onRegenerate ? { onRegenerate } : {})}
          {...(onFork ? { onFork } : {})}
          {...(onReset ? { onReset } : {})}
        />
      ) : null}
    </div>
  )
}
