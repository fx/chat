/**
 * Transcript layout with a per-message cache: finished messages are laid out
 * once per signature, so a streamed delta only lays out the live message.
 */
import type { RenderableMessage } from '@fx/chat-core'
import { type LayoutContext, layoutMessage, showsSomething } from './layout'
import type { Line } from './model'

/** Memoised `layoutMessage`, keyed by message identity plus a signature. */
export interface LayoutCache {
  get(message: RenderableMessage, ctx: LayoutContext, next?: RenderableMessage): Line[]
  /** Layouts computed (not served from the cache) — for tests and diagnostics. */
  readonly misses: number
}

/** Everything a message's layout reads, as a string. */
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
    ctx.footerExtras?.(message, ctx.detail).join('\u0000') ?? '',
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
