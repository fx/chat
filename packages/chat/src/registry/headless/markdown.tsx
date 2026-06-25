/**
 * Minimal, safe headless Markdown renderer.
 *
 * The package depends on NO markdown engine. This default renders a small,
 * deliberately-limited subset safely: paragraphs, fenced code blocks, inline
 * code, and links. Everything else is emitted as escaped plain text, so no raw
 * host markup can ever reach the DOM. Hosts that want full Markdown supply
 * their own engine via the `Markdown` registry slot.
 *
 * SSR-safe: pure render, no `window`/`document` access.
 */
import type { ReactNode } from 'react'
import type { MarkdownProps } from '../contract'

/** Matches a Markdown link `[text](href)`. */
const LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g
/** Matches inline code `` `code` ``. */
const INLINE_CODE_RE = /`([^`]+)`/g

/**
 * Only `http(s):` and `mailto:` URLs are rendered as anchors; anything else
 * (e.g. `javascript:`) is treated as plain text so no unsafe scheme is emitted.
 */
function isSafeHref(href: string): boolean {
  return /^(https?:|mailto:)/i.test(href)
}

/**
 * Render a single line of inline markdown — links and inline code — into React
 * nodes. Text is rendered as-is (React escapes it); links become anchors,
 * inline code becomes `<code>`.
 */
function renderInline(line: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let cursor = 0
  let index = 0
  // Find links and inline code in document order, whichever comes first.
  while (cursor < line.length) {
    LINK_RE.lastIndex = cursor
    INLINE_CODE_RE.lastIndex = cursor
    const link = LINK_RE.exec(line)
    const code = INLINE_CODE_RE.exec(line)
    // No more matches: emit the rest as plain text.
    if (!link && !code) {
      nodes.push(line.slice(cursor))
      break
    }
    // Pick the earliest match; ties go to the link.
    const useLink = link !== null && (code === null || link.index <= code.index)
    const match = useLink ? (link as RegExpExecArray) : (code as RegExpExecArray)
    if (match.index > cursor) {
      nodes.push(line.slice(cursor, match.index))
    }
    if (useLink) {
      const text = match[1] as string
      const href = match[2] as string
      if (isSafeHref(href)) {
        nodes.push(
          <a
            key={`${keyPrefix}-${index}`}
            className="chat-md-link"
            href={href}
            rel="noopener noreferrer"
            target="_blank"
          >
            {text}
          </a>,
        )
      } else {
        // Unsafe scheme: render the original markdown text verbatim (escaped).
        nodes.push(match[0])
      }
    } else {
      nodes.push(
        <code key={`${keyPrefix}-${index}`} className="chat-md-code-inline">
          {match[1] as string}
        </code>,
      )
    }
    cursor = match.index + match[0].length
    index += 1
  }
  return nodes
}

/** A parsed markdown block: a fenced code block or a paragraph of lines. */
type Block =
  | { kind: 'code'; language?: string; code: string }
  | { kind: 'paragraph'; lines: string[] }

/**
 * Parse the source into blocks. Fenced code (```lang) is captured verbatim;
 * blank lines separate paragraphs. An unterminated fence runs to end of input.
 */
export function parseBlocks(content: string): Block[] {
  const blocks: Block[] = []
  const lines = content.split('\n')
  let paragraph: string[] = []

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', lines: paragraph })
      paragraph = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string
    const fence = /^```(.*)$/.exec(line)
    if (fence) {
      flush()
      const language = (fence[1] as string).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i] as string)) {
        codeLines.push(lines[i] as string)
        i++
      }
      blocks.push({
        kind: 'code',
        ...(language ? { language } : {}),
        code: codeLines.join('\n'),
      })
      continue
    }
    if (line.trim() === '') {
      flush()
      continue
    }
    paragraph.push(line)
  }
  flush()
  return blocks
}

/**
 * The headless Markdown component. Renders the safe subset described above and
 * sets `data-streaming` when `streaming` is true so hosts can style a caret.
 */
export function HeadlessMarkdown({ content, streaming }: MarkdownProps) {
  const blocks = parseBlocks(content)
  return (
    <div className="chat-md" data-streaming={streaming ? 'true' : undefined}>
      {blocks.map((block, blockIndex) => {
        // Parsed blocks are a stable, non-reordering positional list, so the
        // block position is the correct identity.
        const blockKey = `b-${blockIndex}`
        if (block.kind === 'code') {
          return (
            <pre
              key={blockKey}
              className="chat-md-pre"
              {...(block.language ? { 'data-language': block.language } : {})}
            >
              <code>{block.code}</code>
            </pre>
          )
        }
        return (
          <p key={blockKey} className="chat-md-p">
            {block.lines.map((line, lineIndex) => {
              // Parsed lines are positional and never reorder, so the line's
              // position within the block is its stable identity.
              const lineKey = `${blockKey}-l-${lineIndex}`
              return (
                <span key={lineKey}>
                  {lineIndex > 0 ? <br /> : null}
                  {renderInline(line, lineKey)}
                </span>
              )
            })}
          </p>
        )
      })}
    </div>
  )
}
