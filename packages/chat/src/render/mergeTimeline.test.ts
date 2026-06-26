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
})
