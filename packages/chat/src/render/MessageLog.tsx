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
import { cx } from '../cx'
import { useChatClassNames } from '../registry'
import { MessageItem } from './MessageItem'
import { TimelineItemView } from './TimelineItemView'
import type { ChatExtensions, RenderableMessage } from './extensions'
import { mergeTimeline } from './mergeTimeline'

/** Per-message affordance callbacks, keyed by message id. */
export interface MessageCallbacks {
  onRegenerate?: (id: string) => void
  onFork?: (id: string) => void
  onReset?: (id: string) => void
}

/** Props for {@link MessageLog}. */
export interface MessageLogProps extends MessageCallbacks {
  messages: RenderableMessage[]
  /** Whether the conversation is actively streaming. */
  isStreaming?: boolean
  /** The id of the actively-streaming message, if any. */
  streamingMessageId?: string
  /** Render blocks flat (no grouping). */
  flat?: boolean
  /** Render each message as raw JSON (debug). */
  raw?: boolean
  /**
   * Minimal / density mode: fold each assistant turn's auxiliary blocks into one
   * group and force compact footers (threaded to every `MessageItem`).
   */
  minimal?: boolean
  /** Default-open state for collapsibles (verbose/expand-all). */
  defaultOpen?: boolean
  /** Show per-message footers. */
  showFooter?: boolean
  /**
   * Render each top-level row in a two-column TIMESTAMP GUTTER layout (a fixed
   * left clock cell + the row content). Each `MessageItem` owns its OWN
   * per-render clock de-duper (render-pure — no shared cross-component mutable
   * state), so consecutive same-second rows WITHIN a message show the time once
   * and blank the rest; each message's first row shows its own clock (no
   * cross-message de-dupe). OPTIONAL; off by default (plain column, no
   * timestamps).
   */
  timestampGutter?: boolean
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
  minimal,
  defaultOpen,
  showFooter,
  compactFooter,
  timestampGutter,
  extensions,
  onRegenerate,
  onFork,
  onReset,
  renderList,
}: MessageLogProps) {
  const cn = useChatClassNames()
  // Interleave messages and host-supplied custom timeline items by createdAt/at.
  // With no timeline items, this is the messages in order (default path).
  const timeline = mergeTimeline(messages, extensions?.timelineItems)
  // No log-wide clock de-duper is created here: a shared mutable de-duper
  // threaded across components is render-impure (StrictMode/concurrent
  // re-renders desync the closure). Each `MessageItem` instead owns its own
  // per-render de-duper, so de-dupe is deterministic per message.
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
      // Namespace message keys (`msg-`) disjointly from item keys (`item-`) so a
      // host message id can never collide with a timeline item id among siblings.
      <MessageItem
        key={`msg-${message.id}`}
        message={message}
        isActive={isActive}
        {...(flat !== undefined ? { flat } : {})}
        {...(raw !== undefined ? { raw } : {})}
        {...(minimal !== undefined ? { minimal } : {})}
        {...(defaultOpen !== undefined ? { defaultOpen } : {})}
        {...(showFooter !== undefined ? { showFooter } : {})}
        {...(compactFooter !== undefined ? { compactFooter } : {})}
        {...(timestampGutter !== undefined ? { timestampGutter } : {})}
        {...(extensions ? { extensions } : {})}
        {...(onRegenerate ? { onRegenerate: () => onRegenerate(message.id) } : {})}
        {...(onFork ? { onFork: () => onFork(message.id) } : {})}
        {...(onReset ? { onReset: () => onReset(message.id) } : {})}
      />
    )
  })

  // Mirror MessageItem's gate: minimal density only engages when neither flat
  // nor raw is active, so `<MessageLog minimal flat>` / `<MessageLog minimal raw>`
  // add NO `data-minimal` hook on `.chat-log`.
  const minimalActive = minimal && !flat && !raw

  return (
    <div className={cx('chat-log', cn.log)} {...(minimalActive ? { 'data-minimal': 'true' } : {})}>
      {renderList ? renderList(items) : items}
    </div>
  )
}
