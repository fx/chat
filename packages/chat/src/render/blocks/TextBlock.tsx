/**
 * `TextBlockView` — renders a `text` content block.
 *
 * Assistant text renders through the registry `Markdown` slot. User text renders
 * as plain text (NEVER markdown) with mention highlighting via the shared
 * `mentions` tokenizer. The markdown decision follows the block's `markdown`
 * hint when set, otherwise the message role.
 */
import { mentionsToSegments } from '../../mentions'
import type { TextBlock } from '../../model'
import { useChatComponents } from '../../registry'

/** Props for {@link TextBlockView}. */
export interface TextBlockViewProps {
  block: TextBlock
  /** Author role of the owning message. */
  messageRole: 'system' | 'user' | 'assistant'
  /** Whether the message is actively streaming (passed to Markdown). */
  streaming?: boolean | undefined
}

/** Render plain user text with `@mention` spans highlighted. */
function PlainTextWithMentions({ text }: { text: string }) {
  const segments = mentionsToSegments(text)
  return (
    <span className="chat-text-plain">
      {segments.map((segment, index) =>
        typeof segment === 'string' ? (
          // Segments are a stable, non-reordering positional list, so the index
          // is the correct identity — repeated identical literals (e.g. the
          // spaces in `@a @b @c`) must not collide on the literal text.
          // biome-ignore lint/suspicious/noArrayIndexKey: positional, non-reordering list
          <span key={`t-${index}`}>{segment}</span>
        ) : (
          <span key={segment.key} className="chat-mention" data-agent-id={segment.mention.agentId}>
            {segment.mention.text}
          </span>
        ),
      )}
    </span>
  )
}

/**
 * Renders the text block. Markdown is used when the `markdown` hint is `true`,
 * or when unset and the role is `assistant`. Otherwise plain text with mentions.
 */
export function TextBlockView({ block, messageRole, streaming }: TextBlockViewProps) {
  const { Markdown } = useChatComponents()
  // User-authored text is ALWAYS plain text with mention highlighting — never
  // Markdown — even if the block carries a `markdown: true` hint (per the
  // rendering spec). Assistant text renders through Markdown by default; the
  // `markdown` hint may still override the assistant default.
  const asMarkdown =
    messageRole === 'user' ? false : (block.markdown ?? messageRole === 'assistant')
  if (asMarkdown) {
    return (
      <div className="chat-text">
        <Markdown content={block.text} {...(streaming !== undefined ? { streaming } : {})} />
      </div>
    )
  }
  return (
    <div className="chat-text">
      <PlainTextWithMentions text={block.text} />
    </div>
  )
}
