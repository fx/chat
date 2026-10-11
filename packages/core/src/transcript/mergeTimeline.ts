/**
 * Pure timeline merge: interleave messages and host-supplied custom timeline
 * items into one ordered stream by `createdAt` / `at` (epoch ms, the same axis).
 *
 * Pure: no React, no DOM — fully unit-testable. `MessageLog` walks the result and
 * renders each entry (a message wrapper, or a `data-timeline-item-id` wrapper for
 * a custom item).
 */
import type { RenderableMessage, TimelineItemBase } from './extensions'

/** A message entry in the merged timeline. */
export interface MergedMessageEntry {
  kind: 'message'
  message: RenderableMessage
  /** The position used for ordering (the message `createdAt`, or 0 when absent). */
  at: number
}

/** A custom-item entry in the merged timeline. */
export interface MergedItemEntry<TItem extends TimelineItemBase = TimelineItemBase> {
  kind: 'item'
  item: TItem
  /** The position used for ordering (the item `at`). */
  at: number
}

/** One entry in the merged, ordered timeline. */
export type MergedEntry<TItem extends TimelineItemBase = TimelineItemBase> =
  | MergedMessageEntry
  | MergedItemEntry<TItem>

/**
 * Merge `messages` and `items` into a single stream, INSERTING custom items by
 * `at` WITHOUT reordering the messages.
 *
 * `MessageLog` renders exactly the message order it is given — that contract is
 * preserved here: messages keep their given relative order even when their
 * `createdAt` values are non-monotonic (a host may pass messages in deliberate
 * display order). Each item is slotted in by `at` relative to the message
 * sequence: it is emitted just before the FIRST not-yet-emitted message whose
 * position (`createdAt`, or `0` when absent) is strictly greater than the item's
 * `at`; items past all messages land at the end. Items are ordered among
 * themselves by `at` (stable for equal `at`). With no `items`, the output is the
 * messages in their given order — the additive, default-unchanged path.
 */
export function mergeTimeline<TItem extends TimelineItemBase>(
  messages: RenderableMessage[],
  items?: TItem[],
): MergedEntry<TItem>[] {
  const messageEntries: MergedMessageEntry[] = messages.map((message) => ({
    kind: 'message',
    message,
    at: message.createdAt ?? 0,
  }))
  if (!items || items.length === 0) return messageEntries

  // Items ordered by `at` (stable for ties) so they slot in deterministically.
  const itemEntries: MergedItemEntry<TItem>[] = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.at - b.item.at || a.index - b.index)
    .map(({ item }) => ({ kind: 'item' as const, item, at: item.at }))

  const out: MergedEntry<TItem>[] = []
  let mi = 0
  for (const itemEntry of itemEntries) {
    // Emit messages (in their GIVEN order) until the next message would sort
    // after this item; the item slots in just before it.
    while (
      mi < messageEntries.length &&
      (messageEntries[mi] as MergedMessageEntry).at <= itemEntry.at
    ) {
      out.push(messageEntries[mi] as MergedMessageEntry)
      mi++
    }
    out.push(itemEntry)
  }
  // Any remaining messages keep their order at the tail.
  for (; mi < messageEntries.length; mi++) {
    out.push(messageEntries[mi] as MergedMessageEntry)
  }
  return out
}
