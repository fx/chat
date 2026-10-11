import { describe, expect, it } from 'vitest'
import type { PlanBlock } from '../model'
import { assertChatMessage, normalizeMessage } from '../model/codec'
import { summarizeBlock } from './blockSummary'
import { planGroupHeader, planMessage } from './plan'

const plan = (statuses: Array<'pending' | 'in_progress' | 'completed'>): PlanBlock => ({
  type: 'plan',
  id: 'p',
  entries: statuses.map((status, i) => ({ content: `step ${i}`, status })),
})

describe('plan block', () => {
  it('summarizes progress with the checklist icon and no timer', () => {
    expect(
      summarizeBlock(plan(['completed', 'completed', 'in_progress', 'pending', 'pending'])),
    ).toEqual({
      iconName: 'checklist',
      label: 'Plan 2/5',
      showTimer: false,
    })
    expect(summarizeBlock(plan([])).label).toBe('Plan')
  })

  it('is auxiliary and can head a group, but does not open the footer', () => {
    const blocks = [
      plan(['completed', 'pending']),
      { type: 'reasoning' as const, id: 'r', text: 'x', durationMs: 1 },
    ]
    const message = {
      id: 'm',
      role: 'assistant' as const,
      blocks: [blocks[1], blocks[0]] as PlanBlock[],
    }
    const rows = planMessage(message).rows
    expect(rows.map((r) => r.kind)).toEqual(['group'])
    expect(planMessage(message).showFooter).toBe(false)
    const header = planGroupHeader(message.blocks, {})
    expect(header.summary.label).toBe('Plan 1/2')
  })

  it('round-trips through the codec and validator', () => {
    const message = normalizeMessage({
      role: 'assistant',
      content: 'ok',
      plan: { entries: [{ content: 'a', status: 'in_progress', priority: 'high', id: 'e1' }] },
    })
    expect(message.blocks.at(-1)).toEqual({
      type: 'plan',
      id: 'fallback-plan',
      entries: [{ content: 'a', status: 'in_progress', priority: 'high', id: 'e1' }],
    })
    expect(() => assertChatMessage(message)).not.toThrow()
    expect(
      normalizeMessage({ role: 'assistant', plan: { id: 'x', entries: [] } }).blocks[0]?.id,
    ).toBe('x')
  })

  it.each([
    [{ entries: 'x' }, 'entries must be an array'],
    [{ entries: [null] }, 'string content'],
    [{ entries: [{ content: 1, status: 'pending' }] }, 'string content'],
    [{ entries: [{ content: 'a', status: 'doing' }] }, 'status must be'],
    [{ entries: [{ content: 'a', status: 'pending', priority: 'urgent' }] }, 'priority must be'],
    [{ entries: [{ content: 'a', status: 'pending', id: 3 }] }, 'id must be a string'],
  ])('rejects malformed plans (%#)', (payload, message) => {
    expect(() =>
      assertChatMessage({
        id: 'm',
        role: 'assistant',
        blocks: [{ type: 'plan', id: 'p', ...payload }],
      }),
    ).toThrow(message)
  })
})
