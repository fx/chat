/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */

import type { RenderableMessage } from '@fx-/chat-core'
import { type InkExtensions, MessageView } from './MessageView'
/**
 * The terminal transcript. Finished messages are written once through Ink's
 * static output — terminal scrollback cannot be redrawn — and only the live
 * turn (and anything after it) re-renders as it streams.
 *
 * Static output is append-only: messages removed or rewritten after they were
 * printed (e.g. a regenerated turn) stay on screen. A host that rewrites
 * history clears the screen and remounts the transcript (change its `key`).
 */
import { React, ink } from './runtime'

export interface TranscriptProps {
  messages: RenderableMessage[]
  isStreaming?: boolean
  /** The id of the live message, if any. */
  streamingMessageId?: string | undefined
  /** Expand row bodies of the live turn. */
  expanded?: boolean
  /** Expand row bodies of finished messages as they are printed. */
  expandFinished?: boolean
  minimal?: boolean
  showFooter?: boolean
  bodyLines?: number
  extensions?: InkExtensions
  /** Host label for retrying, shown on stopped or failed messages. */
  retryHint?: string
  /** Activity after content instead of in stream order. */
  activityPlacement?: 'inline' | 'after-content'
  /** While live and collapsed, show only the newest N activity blocks. */
  liveTail?: number
  /** Show the footer while live (opt-in). */
  liveFooter?: boolean
}

export function Transcript({
  messages,
  isStreaming = false,
  streamingMessageId,
  expanded = false,
  expandFinished = false,
  minimal = false,
  showFooter = true,
  bodyLines,
  extensions,
  retryHint,
  activityPlacement,
  liveTail,
  liveFooter,
}: TranscriptProps) {
  const liveIndex = isStreaming
    ? messages.findIndex((message) => message.id === streamingMessageId)
    : -1
  const finished = liveIndex === -1 ? messages : messages.slice(0, liveIndex)
  const live = liveIndex === -1 ? [] : messages.slice(liveIndex)
  const common = {
    minimal,
    showFooter,
    ...(bodyLines !== undefined ? { bodyLines } : {}),
    ...(extensions ? { extensions } : {}),
    ...(retryHint ? { retryHint } : {}),
    ...(activityPlacement ? { activityPlacement } : {}),
    ...(liveTail !== undefined ? { liveTail } : {}),
    ...(liveFooter !== undefined ? { liveFooter } : {}),
  }
  return (
    <>
      <ink.Static items={finished}>
        {(message) => (
          <MessageView key={message.id} message={message} expanded={expandFinished} {...common} />
        )}
      </ink.Static>
      {live.length > 0 ? (
        <ink.Box flexDirection="column">
          {live.map((message) => (
            <MessageView
              key={message.id}
              message={message}
              isActive={message.id === streamingMessageId}
              expanded={expanded}
              {...common}
            />
          ))}
        </ink.Box>
      ) : null}
    </>
  )
}
