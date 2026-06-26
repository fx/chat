/**
 * Pure timeline merge: interleave messages and host-supplied custom timeline
 * items into one ordered stream by `createdAt` / `at` (epoch ms, the same axis).
 *
 * Pure: no React, no DOM — fully unit-testable. `MessageLog` walks the result and
 * renders each entry (a message wrapper, or a `data-timeline-item-id` wrapper for
 * a custom item).
 */
import type { ChatMessage } from '../model'
import type { TimelineItem } from './extensions'

/** A message entry in the merged timeline. */
export interface MergedMessageEntry {
  kind: 'message'
  message: ChatMessage
  /** The position used for ordering (the message `createdAt`, or 0 when absent). */
  at: number
}

/** A custom-item entry in the merged timeline. */
export interface MergedItemEntry {
  kind: 'item'
  item: TimelineItem
  /** The position used for ordering (the item `at`). */
  at: number
}

/** One entry in the merged, ordered timeline. */
export type MergedEntry = MergedMessageEntry | MergedItemEntry

/**
 * Merge `messages` and `items` into a single stream ordered by position. A
 * message's position is its `createdAt` (or `0` when absent, matching the
 * downstream timing default). Ordering is STABLE: entries that compare equal keep
 * their original relative order (messages before items at the same position,
 * preserving the messages' order). With no `items`, the output is the messages in
 * order — the additive, default-unchanged path.
 */
export function mergeTimeline(messages: ChatMessage[], items?: TimelineItem[]): MergedEntry[] {
  const entries: MergedEntry[] = messages.map((message) => ({
    kind: 'message',
    message,
    at: message.createdAt ?? 0,
  }))
  if (!items || items.length === 0) return entries

  for (const item of items) {
    entries.push({ kind: 'item', item, at: item.at })
  }
  // Stable sort by `at`. `Array.prototype.sort` is stable in modern engines, so a
  // 0-comparison preserves insertion order: all messages were pushed first (in
  // order), then items — so at an equal position a message precedes an item.
  entries.sort((a, b) => a.at - b.at)
  return entries
}
