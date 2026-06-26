import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../model'
import type { TimelineItem } from './extensions'
import { mergeTimeline } from './mergeTimeline'

const msg = (id: string, createdAt?: number): ChatMessage => ({
  id,
  role: 'assistant',
  blocks: [],
  ...(createdAt !== undefined ? { createdAt } : {}),
})

const item = (id: string, at: number): TimelineItem => ({ id, at, render: () => null })

describe('mergeTimeline', () => {
  it('returns messages in order with no items (additive default path)', () => {
    const messages = [msg('a', 100), msg('b', 300)]
    expect(mergeTimeline(messages)).toEqual([
      { kind: 'message', message: messages[0], at: 100 },
      { kind: 'message', message: messages[1], at: 300 },
    ])
  })

  it('returns messages in order for an empty items array (no sort path)', () => {
    const messages = [msg('a', 100), msg('b', 300)]
    expect(mergeTimeline(messages, [])).toEqual([
      { kind: 'message', message: messages[0], at: 100 },
      { kind: 'message', message: messages[1], at: 300 },
    ])
  })

  it('interleaves a custom item between messages by `at`', () => {
    const messages = [msg('a', 100), msg('b', 300)]
    const items = [item('m1', 200)]
    const merged = mergeTimeline(messages, items)
    expect(merged.map((e) => (e.kind === 'message' ? e.message.id : e.item.id))).toEqual([
      'a',
      'm1',
      'b',
    ])
    expect(merged[1]).toEqual({ kind: 'item', item: items[0], at: 200 })
  })

  it('defaults a message with no createdAt to position 0', () => {
    const messages = [msg('a'), msg('b', 50)]
    const items = [item('m', 25)]
    const merged = mergeTimeline(messages, items)
    // `a` (at 0) precedes the item (at 25) which precedes `b` (at 50).
    expect(merged.map((e) => (e.kind === 'message' ? e.message.id : e.item.id))).toEqual([
      'a',
      'm',
      'b',
    ])
  })

  it('is stable: a message precedes an item at the same position', () => {
    const messages = [msg('a', 100)]
    const items = [item('same', 100)]
    const merged = mergeTimeline(messages, items)
    expect(merged.map((e) => (e.kind === 'message' ? e.message.id : e.item.id))).toEqual([
      'a',
      'same',
    ])
  })

  it('orders multiple items and messages purely by `at`', () => {
    const messages = [msg('a', 100), msg('b', 400)]
    const items = [item('i300', 300), item('i200', 200)]
    const merged = mergeTimeline(messages, items)
    expect(merged.map((e) => (e.kind === 'message' ? e.message.id : e.item.id))).toEqual([
      'a',
      'i200',
      'i300',
      'b',
    ])
  })

  it('preserves the GIVEN message order even when createdAt is non-monotonic', () => {
    // Host passes messages in deliberate display order, NOT createdAt order.
    const messages = [msg('m2', 300), msg('m1', 100)]
    const items = [item('mid', 200)]
    const merged = mergeTimeline(messages, items)
    // m2 stays first (its given position); the item slots before m1 (at <= 200
    // is false for m2 at 300, so the item lands before it) — messages never flip.
    expect(merged.map((e) => (e.kind === 'message' ? e.message.id : e.item.id))).toEqual([
      'mid',
      'm2',
      'm1',
    ])
  })

  it('keeps an item with `at` past all messages at the tail', () => {
    const messages = [msg('a', 100), msg('b', 200)]
    const items = [item('late', 999)]
    const merged = mergeTimeline(messages, items)
    expect(merged.map((e) => (e.kind === 'message' ? e.message.id : e.item.id))).toEqual([
      'a',
      'b',
      'late',
    ])
  })

  it('orders two items at the same `at` by their given order (stable)', () => {
    const messages = [msg('a', 100)]
    const items = [item('first', 50), item('second', 50)]
    const merged = mergeTimeline(messages, items)
    expect(merged.map((e) => (e.kind === 'message' ? e.message.id : e.item.id))).toEqual([
      'first',
      'second',
      'a',
    ])
  })
})
