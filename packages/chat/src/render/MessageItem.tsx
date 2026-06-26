/**
 * `MessageItem` — renders one `ChatMessage`, wrapped with the `data-message-id`
 * anchor contract.
 *
 * It applies the grouping pass (unless `flat`) to fold consecutive auxiliary
 * blocks into a single `BlockGroup`; non-aux blocks render bare. A `raw` debug
 * mode renders the whole message via the registry `JsonView` instead. The footer
 * affordances render beneath the blocks.
 */
import type { ChatMessage } from '../model'
import { BlockGroup } from './BlockGroup'
import { MessageAttachments } from './MessageAttachments'
import { MessageFooter } from './MessageFooter'
import { RawJsonBlockView } from './blocks'
import { BlockView } from './blocks'
import type { BlockRenderContext } from './blocks'
import { deriveTokensPerSecond } from './format'
import { groupBlocks } from './grouping'

/** Props for {@link MessageItem}. */
export interface MessageItemProps {
  message: ChatMessage
  /** Whether THIS message is the actively-streaming one. */
  isActive?: boolean
  /** Render blocks flat (no grouping). */
  flat?: boolean
  /** Render the whole message as JSON (debug). */
  raw?: boolean
  /** Default-open state for collapsibles (verbose/expand-all). */
  defaultOpen?: boolean
  /** Show the footer affordances. */
  showFooter?: boolean
  /** Compact footer mode. */
  compactFooter?: boolean
  onRegenerate?: () => void
  onFork?: () => void
  onReset?: () => void
}

/** Concatenate a message's text-block prose for the copy affordance. */
export function messageCopyText(message: ChatMessage): string {
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
  defaultOpen,
  showFooter = true,
  compactFooter = false,
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
    ...(isActive && trailingBlock ? { activeBlockId: trailingBlock.id } : {}),
    ...(message.createdAt !== undefined ? { startedAt: message.createdAt } : {}),
    ...(message.metrics?.durationMs !== undefined
      ? { durationMs: message.metrics.durationMs }
      : {}),
    ...(tokensPerSecond !== undefined ? { tokensPerSecond } : {}),
    ...(defaultOpen !== undefined ? { defaultOpen } : {}),
  }

  return (
    <div className="chat-message" data-message-id={message.id} data-role={message.role}>
      {raw ? (
        <RawJsonBlockView value={message} />
      ) : (
        <div className="chat-message-blocks">
          {flat
            ? message.blocks.map((block) => (
                <BlockView key={block.id} block={block} context={context} />
              ))
            : groupBlocks(message.blocks).map((item) =>
                item.kind === 'bare' ? (
                  <BlockView key={item.block.id} block={item.block} context={context} />
                ) : (
                  <BlockGroup
                    key={`group-${(item.blocks[0] as { id: string }).id}`}
                    blocks={item.blocks}
                    context={context}
                    {...(defaultOpen !== undefined ? { defaultOpen } : {})}
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
          compact={compactFooter}
          {...(message.metrics ? { metrics: message.metrics } : {})}
          {...(onRegenerate ? { onRegenerate } : {})}
          {...(onFork ? { onFork } : {})}
          {...(onReset ? { onReset } : {})}
        />
      ) : null}
    </div>
  )
}
