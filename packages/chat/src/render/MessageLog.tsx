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
import { TimelineItemView } from './TimelineItemView'
import type { ChatExtensions } from './extensions'
import { mergeTimeline } from './mergeTimeline'

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
   * Optional render-layer extensions: custom block renderers, tool-name
   * overrides, and custom timeline items. Additive — when absent, output is the
   * default behavior unchanged.
   */
  extensions?: ChatExtensions
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
  extensions,
  onRegenerate,
  onFork,
  onReset,
  renderList,
}: MessageLogProps) {
  // Interleave messages and host-supplied custom timeline items by createdAt/at.
  // With no timeline items, this is the messages in order (default path).
  const timeline = mergeTimeline(messages, extensions?.timelineItems)
  const items = timeline.map((entry) => {
    if (entry.kind === 'item') {
      // An item entry only exists when `extensions.timelineItems` was non-empty,
      // so `extensions` is guaranteed defined here.
      return (
        <TimelineItemView
          key={`item-${entry.item.id}`}
          item={entry.item}
          extensions={extensions as ChatExtensions}
        />
      )
    }
    const message = entry.message
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
        {...(extensions ? { extensions } : {})}
        {...(onRegenerate ? { onRegenerate: () => onRegenerate(message.id) } : {})}
        {...(onFork ? { onFork: () => onFork(message.id) } : {})}
        {...(onReset ? { onReset: () => onReset(message.id) } : {})}
      />
    )
  })

  return <div className="chat-log">{renderList ? renderList(items) : items}</div>
}
