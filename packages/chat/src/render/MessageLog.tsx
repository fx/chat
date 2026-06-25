/**
 * `MessageLog` — renders an ordered `ChatMessage[]`.
 *
 * Each message is wrapped (via {@link MessageItem}) with the stable
 * `data-message-id` anchor. The log accepts an `isStreaming` signal plus a
 * `streamingMessageId` so the active message drives live status/timers. It
 * bundles NO virtualizer; a host may supply one via the optional `renderList`
 * slot, otherwise messages render directly.
 *
 * No data fetching, router, or store — it renders exactly what it is given.
 */
import type { ReactNode } from 'react'
import type { ChatMessage } from '../model'
import { MessageItem } from './MessageItem'

/** Per-message affordance callbacks, keyed by message id. */
export interface MessageCallbacks {
  onRegenerate?: (id: string) => void
  onFork?: (id: string) => void
  onReset?: (id: string) => void
}

/** Props for {@link MessageLog}. */
export interface MessageLogProps extends MessageCallbacks {
  messages: ChatMessage[]
  /** Whether the conversation is actively streaming. */
  isStreaming?: boolean
  /** The id of the actively-streaming message, if any. */
  streamingMessageId?: string
  /** Render blocks flat (no grouping). */
  flat?: boolean
  /** Render each message as raw JSON (debug). */
  raw?: boolean
  /** Default-open state for collapsibles (verbose/expand-all). */
  defaultOpen?: boolean
  /** Show per-message footers. */
  showFooter?: boolean
  /** Compact footer mode. */
  compactFooter?: boolean
  /**
   * Optional host-provided list renderer (e.g. a virtualizer). Receives the
   * already-built per-message nodes; defaults to rendering them directly. The
   * package bundles no windowing implementation.
   */
  renderList?: (children: ReactNode[]) => ReactNode
}

/** Renders the message log. */
export function MessageLog({
  messages,
  isStreaming = false,
  streamingMessageId,
  flat,
  raw,
  defaultOpen,
  showFooter,
  compactFooter,
  onRegenerate,
  onFork,
  onReset,
  renderList,
}: MessageLogProps) {
  const items = messages.map((message) => {
    const isActive = isStreaming && message.id === streamingMessageId
    return (
      <MessageItem
        key={message.id}
        message={message}
        isActive={isActive}
        {...(flat !== undefined ? { flat } : {})}
        {...(raw !== undefined ? { raw } : {})}
        {...(defaultOpen !== undefined ? { defaultOpen } : {})}
        {...(showFooter !== undefined ? { showFooter } : {})}
        {...(compactFooter !== undefined ? { compactFooter } : {})}
        {...(onRegenerate ? { onRegenerate: () => onRegenerate(message.id) } : {})}
        {...(onFork ? { onFork: () => onFork(message.id) } : {})}
        {...(onReset ? { onReset: () => onReset(message.id) } : {})}
      />
    )
  })

  return <div className="chat-log">{renderList ? renderList(items) : items}</div>
}
