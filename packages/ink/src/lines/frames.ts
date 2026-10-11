/**
 * Message frames — the injected look around a message. Two ship: `compact`
 * (the default) and `threaded`; hosts may supply their own. Frames draw only
 * with injected roles and glyphs.
 */
import { formatClockTime } from '@fx/chat-core'
import type { FrameInput, LineDraft, MessageFrame } from './layout'
import { truncate, wrapLines } from './measure'
import { type Span, span } from './model'

const blank = (): LineDraft => ({ spans: [], frame: true })

/**
 * Compact: a role glyph before the first row (`›` user, `•` answer), rows
 * indented under it, a dim footer line, a blank line after each message.
 */
export const compactFrame: MessageFrame = {
  id: 'compact',
  innerWidth: (_message, width) => Math.max(1, width - 2),
  layout({ message, body, footer, ctx, accent }) {
    const user = message.role === 'user'
    const glyph = user ? ctx.glyphs.user : ctx.glyphs.assistant
    const lead = span(
      `${glyph} `,
      user ? { role: 'user', chrome: true } : { style: accent, chrome: true },
    )
    const pad = span('  ', { chrome: true })
    const lines: LineDraft[] = body.map((line, i) => ({
      ...line,
      spans: [i === 0 ? lead : pad, ...line.spans],
    }))
    if (lines.length === 0 && footer) lines.push({ spans: [lead], frame: true })
    if (footer) lines.push({ spans: [pad, ...footer], frame: true })
    if (lines.length > 0) lines.push(blank())
    return lines
  },
}

/**
 * Threaded: the user's message in a round-cornered box with its time set into
 * the top edge; an answer hangs from the box on a gutter in its accent and
 * ends with a footer corner. A live answer that shows nothing yet draws
 * nothing.
 */
export const threadedFrame: MessageFrame = {
  id: 'threaded',
  innerWidth: (message, width) => Math.max(1, width - (message.role === 'user' ? 4 : 2)),
  layout(input) {
    return input.message.role === 'user' ? userBox(input) : answerGutter(input)
  },
}

function userBox({ message, ctx, nextShows }: FrameInput): LineDraft[] {
  const g = ctx.glyphs
  const max = Math.max(1, ctx.width - 4)
  const text = message.blocks
    .filter((block) => block.type === 'text')
    .map((block) => (block as { text: string }).text)
    .join('\n')
  const rows: Array<{ text: string; dim?: boolean; wrap?: 'soft' | 'hard' }> = wrapLines(
    text,
    max,
    ctx.measure,
  )
  for (const attachment of message.attachments ?? []) {
    const label = attachment.description ?? attachment.name ?? attachment.mediaType
    rows.push({ text: truncate(`${g.attachment} ${label}`, max, ctx.measure), dim: true })
  }
  const time = message.createdAt !== undefined ? formatClockTime(message.createdAt).slice(0, 5) : ''
  const timeLabel = time ? ` ${time} ` : ''
  const inner = Math.min(
    max,
    Math.max(ctx.measure(timeLabel) + 2, ...rows.map((row) => ctx.measure(row.text))),
  )
  const edge = (n: number) => g.boxHorizontal.repeat(Math.max(0, n))
  const chrome = (text: string): Span => span(text, { role: 'chrome', chrome: true })
  const topFill = inner + 2 - ctx.measure(timeLabel) - 1
  const lines: LineDraft[] = [
    {
      spans: [chrome(`${g.boxTopLeft}${edge(topFill)}${timeLabel}${edge(1)}${g.boxTopRight}`)],
      frame: true,
    },
    ...rows.map((row) => ({
      spans: [
        chrome(`${g.boxVertical} `),
        span(row.text, { role: 'user', ...(row.dim ? { dim: true, bold: false } : {}) }),
        chrome(`${' '.repeat(Math.max(0, inner - ctx.measure(row.text)))} ${g.boxVertical}`),
      ],
      ...(row.wrap ? { wrap: row.wrap } : {}),
    })),
    {
      spans: [
        chrome(
          `${nextShows ? g.boxJunction : g.boxBottomLeft}${edge(inner + 2)}${g.boxBottomRight}`,
        ),
      ],
      frame: true,
    },
  ]
  if (!nextShows) lines.push(blank())
  return lines
}

function answerGutter({ body, footer, shows, accent, ctx }: FrameInput): LineDraft[] {
  if (!shows) return []
  const g = ctx.glyphs
  const gutter = span(`${g.boxVertical} `, { style: accent, chrome: true })
  const bare = { spans: [span(g.boxVertical, { style: accent, chrome: true })], frame: true }
  const lines: LineDraft[] = [
    bare,
    ...body.map((line) => ({ ...line, spans: [gutter, ...line.spans] })),
    bare,
  ]
  lines.push({
    spans: [span(`${g.footer} `, { style: accent, chrome: true }), ...(footer ?? [])],
    frame: true,
  })
  lines.push(blank())
  return lines
}
