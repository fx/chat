/**
 * The `ActivitySummary` presenter: a message's activity as a wrapping run of
 * square tiles — the kind's icon (a tool's from the host's `toolIcons`), its
 * time or rate in small text inside, and a turning ring while it runs (amber
 * while it waits for approval). Tapping a tile opens the message's details at
 * it (highlighted there). Touch-first; the registry provides it with
 * `createShadcnComponents({ touch: true })`.
 */
import {
  type ActivityItem,
  type ActivitySummaryProps,
  type IconComponent,
  formatDuration,
  formatTokensPerSecond,
} from '@fx/chat'
import { useEffect, useState } from 'react'
import { cn } from './cn'
import { lucideIcons } from './icons'
import { TILE, TILE_ICON } from './tile'

/** How often a live tile's time advances, in ms. */
export const TILE_TICK_MS = 250

const KIND_ICONS: Record<Exclude<ActivityItem['kind'], 'tool'>, IconComponent> = {
  reasoning: lucideIcons.brain,
  plan: lucideIcons.checklist as IconComponent,
  waiting: lucideIcons.spinner,
  other: lucideIcons.gear,
}

/** The small text inside a tile: a live rate, the time so far or taken, a plan's progress. */
export function tileText(item: ActivityItem, now: number): string | undefined {
  if (item.detail) return item.detail
  const rate = formatTokensPerSecond(item.tokensPerSecond)
  if (rate && item.status === 'running') return rate.replace(' tok/s', '/s')
  if (item.durationMs !== undefined) return formatDuration(item.durationMs)
  if (item.status === 'running' && item.startedAt !== undefined)
    return formatDuration(Math.max(0, now - item.startedAt))
  return undefined
}

const STATUS_WORDS: Record<ActivityItem['status'], string> = {
  running: 'running',
  done: 'done',
  error: 'failed',
  awaiting: 'waiting for approval',
}

/** A clock that ticks only while `active`. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), TILE_TICK_MS)
    return () => clearInterval(timer)
  }, [active])
  return now
}

function Tile({
  item,
  now,
  Icon,
  onActivate,
}: {
  item: ActivityItem
  now: number
  Icon: IconComponent
  onActivate?: ((id: string) => void) | undefined
}) {
  const text = tileText(item, now)
  const spinning = item.status === 'running' || item.status === 'awaiting'
  const label = [item.label, STATUS_WORDS[item.status], text].filter(Boolean).join(', ')
  const className = cn(
    'chat-tile relative',
    TILE,
    item.status === 'done' && 'text-foreground/80',
    item.status === 'error' && 'bg-destructive/10 text-destructive',
    item.status === 'awaiting' && 'text-amber-600',
    onActivate && 'cursor-pointer transition-transform active:scale-95',
  )
  const body = [
    spinning ? <span key="ring" aria-hidden className="chat-tile-ring" /> : null,
    <Icon
      key="icon"
      className={cn(
        TILE_ICON,
        // The waiting kind's icon is a spinner: it turns while it waits.
        item.kind === 'waiting' && item.status === 'running' && 'motion-safe:animate-spin',
      )}
    />,
    text ? (
      <span key="text" className="max-w-full truncate px-1">
        {text}
      </span>
    ) : null,
  ]
  const data = { 'data-kind': item.kind, 'data-status': item.status, 'aria-label': label }
  return onActivate ? (
    <button type="button" className={className} {...data} onClick={() => onActivate(item.id)}>
      {body}
    </button>
  ) : (
    <span role="img" className={className} {...data}>
      {body}
    </span>
  )
}

export function createActivityTiles(toolIcons: Record<string, IconComponent> = {}) {
  return function ActivityTiles({ items, live, onActivate }: ActivitySummaryProps) {
    const now = useNow(live && items.some((item) => item.status === 'running'))
    return (
      <div className="chat-tiles flex flex-wrap gap-1.5" data-live={live ? 'true' : undefined}>
        {items.map((item) => (
          <Tile
            key={item.id}
            item={item}
            now={now}
            Icon={
              item.kind === 'tool'
                ? ((item.name !== undefined ? toolIcons[item.name] : undefined) ??
                  lucideIcons.wrench)
                : KIND_ICONS[item.kind]
            }
            onActivate={onActivate}
          />
        ))}
      </div>
    )
  }
}
