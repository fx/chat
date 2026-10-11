/**
 * Transcript layout with a per-message cache: finished messages are laid out
 * once per signature, so a streamed delta only lays out the live message.
 */
import type { RenderableMessage } from '@fx/chat-core'
import { type LayoutContext, layoutMessage, resolveAccent, showsSomething } from './layout'
import type { Line } from './model'

/** Memoised `layoutMessage`, keyed by message identity plus a signature. */
export interface LayoutCache {
  get(message: RenderableMessage, ctx: LayoutContext, next?: RenderableMessage): Line[]
  /** Layouts computed (not served from the cache) — for tests and diagnostics. */
  readonly misses: number
}

const identities = new WeakMap<object, number>()
let nextIdentity = 0
/** A stable token per object or function: injected inputs compare by identity. */
function identity(value: object | undefined): number {
  if (value === undefined) return 0
  let id = identities.get(value)
  if (id === undefined) {
    id = ++nextIdentity
    identities.set(value, id)
  }
  return id
}

/**
 * Everything a message's layout reads, as a string. Plain values (hint labels,
 * the resolved accent, host footer facts) count by value; injected functions
 * and the glyph set count by identity, so hosts memoise them.
 */
export function layoutSignature(
  message: RenderableMessage,
  ctx: LayoutContext,
  next?: RenderableMessage,
  imagesVersion = 0,
): string {
  const live = ctx.isActive(message)
  return [
    ctx.width,
    ctx.detail,
    ctx.placement,
    ctx.frame.id,
    live ? `live:${Math.floor(ctx.now / 1000)}` : 'done',
    ctx.opened.version,
    imagesVersion,
    next !== undefined && next.role === 'assistant' && showsSomething(next) ? 'n' : '-',
    ctx.liveTail,
    ctx.liveFooter ? 'f' : '-',
    ctx.finishedActivity ?? 'row',
    ctx.activitySpacing === false ? '-' : 's',
    ctx.footerExtras?.(message, ctx.detail).join('\u0000') ?? '',
    JSON.stringify(ctx.hints),
    JSON.stringify(resolveAccent(message, ctx)),
    [ctx.glyphs, ctx.markdown, ctx.measure, ctx.image, ctx.blockLayouts].map(identity).join(','),
  ].join('|')
}

export function createLayoutCache(imagesVersion: () => number = () => 0): LayoutCache {
  const entries = new WeakMap<object, { signature: string; lines: Line[] }>()
  let misses = 0
  return {
    get(message, ctx, next) {
      const signature = layoutSignature(message, ctx, next, imagesVersion())
      const hit = entries.get(message)
      if (hit && hit.signature === signature) return hit.lines
      misses++
      const lines = layoutMessage(message, ctx, next)
      entries.set(message, { signature, lines })
      return lines
    },
    get misses() {
      return misses
    },
  }
}

/** Lay out a transcript: all lines, and where each message starts. */
export function layoutTranscript(
  messages: readonly RenderableMessage[],
  ctx: LayoutContext,
  cache: LayoutCache = createLayoutCache(),
): { lines: Line[]; messageStart: number[] } {
  const lines: Line[] = []
  const messageStart: number[] = []
  messages.forEach((message, i) => {
    messageStart.push(lines.length)
    lines.push(...cache.get(message, ctx, messages[i + 1]))
  })
  return { lines, messageStart }
}
