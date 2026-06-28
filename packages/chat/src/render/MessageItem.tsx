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
import { BlockGroup } from './BlockGroup'
import { MessageAttachments } from './MessageAttachments'
import { MessageFooter } from './MessageFooter'
import { RawJsonBlockView } from './blocks'
import { BlockView } from './blocks'
import type { BlockRenderContext } from './blocks'
import type { ChatExtensions, RenderableMessage } from './extensions'
import { deriveTokensPerSecond, formatMessageTime } from './format'
import { groupBlocks } from './grouping'
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
   * Show the left-aligned message timestamp (from `message.createdAt`). Renders
   * only when a valid timestamp is present; defaults to `true`.
   */
  showTimestamps?: boolean
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

/** Renders a single message and its footer. */
export function MessageItem({
  message,
  isActive = false,
  flat = false,
  raw = false,
  minimal = false,
  defaultOpen,
  showFooter = true,
  showTimestamps = true,
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

  // Left-aligned message chrome: a small muted timestamp rendered above the
  // bubble when present. Gated on `showTimestamps` and a valid `createdAt`.
  const timeLabel = showTimestamps ? formatMessageTime(message.createdAt) : undefined

  return (
    <div
      className="chat-message"
      data-message-id={message.id}
      data-role={message.role}
      {...(minimalActive ? { 'data-minimal': 'true' } : {})}
    >
      {timeLabel ? (
        <span className="chat-message-time" data-testid="chat-message-time">
          {timeLabel}
        </span>
      ) : null}
      {raw ? (
        <RawJsonBlockView value={message} />
      ) : (
        <div className="chat-message-blocks">
          {flat
            ? blocks.map((block) => (
                <BlockView
                  key={block.id}
                  block={block}
                  context={context}
                  {...(extensions ? { extensions } : {})}
                />
              ))
            : groupedItems.map((item) =>
                item.kind === 'bare' ? (
                  <BlockView
                    key={item.block.id}
                    block={item.block}
                    context={context}
                    {...(extensions ? { extensions } : {})}
                  />
                ) : (
                  <BlockGroup
                    key={`group-${(item.blocks[0] as { id: string }).id}`}
                    blocks={item.blocks}
                    context={context}
                    {...(defaultOpen !== undefined ? { defaultOpen } : {})}
                    {...(extensions ? { extensions } : {})}
                  />
                ),
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
