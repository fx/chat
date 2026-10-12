/**
 * `Pane` — one chat surface bound to a single registry.
 *
 * Wraps `<ChatProvider components={registry}>` around the library's
 * `MessageLog` and `ChatInput` (wired with the reference completion provider).
 * The SAME `messages` and flags flow into every pane; only the injected registry
 * differs — which is the whole point of the demo. Message-level attachments
 * (which the library leaves to the host) are surfaced here as compact chips.
 *
 * The composer is uncontrolled and inert (its `onSend` only echoes into local
 * pane state) because the demo has no backend — it exists to show the composer
 * surface, mention highlighting, and the reference completion popup.
 */
import { ChatInput, type ChatMessage, ChatProvider, MessageLog, referenceProvider } from '@fx/chat'
import { shadcnClassNames } from '@fx/chat-shadcn'
import { useMemo, useState } from 'react'
import type { RegistryEntry } from './registries'

/** Props for {@link Pane}. */
export interface PaneProps {
  registry: RegistryEntry
  messages: ChatMessage[]
  isStreaming: boolean
  streamingMessageId?: string
  flat: boolean
  verbose: boolean
  /** Minimal / density mode (fold turn aux to one line, compact footer). */
  minimal: boolean
  /** Theme to apply to this pane (`light` | `dark`). */
  theme: 'light' | 'dark'
  /** Show the pane header label (hidden in single-pane mode). */
  showHeader?: boolean
}

/** Collect the message-level attachments to surface, in order. */
function useAttachments(messages: ChatMessage[]) {
  return useMemo(
    () =>
      messages.flatMap((m) => (m.attachments ?? []).map((a, i) => ({ ...a, key: `${m.id}-${i}` }))),
    [messages],
  )
}

/** A single registry-bound chat surface. */
export function Pane({
  registry,
  messages,
  isStreaming,
  streamingMessageId,
  flat,
  verbose,
  minimal,
  theme,
  showHeader = true,
}: PaneProps) {
  const [sent, setSent] = useState<string[]>([])
  const attachments = useAttachments(messages)

  // Every pane is styled by the shared Tailwind `classNames` theme, so the
  // pane's scheme is a `.light`/`.dark` class (`@fx/chat-shadcn`'s tokens and
  // `dark:` variant follow it for the whole subtree).
  return (
    <section className={`demo-pane ${theme}`} data-registry={registry.id} data-theme={theme}>
      {showHeader ? (
        <header className="demo-pane-header">
          <span>{registry.label}</span>
        </header>
      ) : null}

      <div className="demo-pane-surface">
        <ChatProvider components={registry.components} classNames={shadcnClassNames}>
          <div className="demo-pane-log">
            <MessageLog
              messages={messages}
              isStreaming={isStreaming}
              {...(streamingMessageId ? { streamingMessageId } : {})}
              flat={flat}
              minimal={minimal}
              defaultOpen={verbose}
              showFooter
            />
            {attachments.length > 0 ? (
              <ul className="demo-user-attachments" aria-label="Attachments">
                {attachments.map((a) => (
                  <li key={a.key} className="demo-user-attachment">
                    {a.name ?? a.url}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="demo-pane-input">
            <ChatInput
              onSend={(text) => setSent((prev) => [...prev, text])}
              providers={[referenceProvider]}
              placeholder="Message (type ~ for references, @ to mention)"
            />
          </div>
        </ChatProvider>
      </div>

      {sent.length > 0 ? (
        <output className="demo-pane-input" aria-label="Last sent">
          Sent: {sent[sent.length - 1]}
        </output>
      ) : null}
    </section>
  )
}
