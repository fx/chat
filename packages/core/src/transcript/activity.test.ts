import { describe, expect, it } from 'vitest'
import type { ChatMessage, ContentBlock, ToolCallBlock } from '../model'
import {
  countActivity,
  formatCost,
  formatElapsed,
  formatTokenCount,
  livePhase,
  planFooter,
} from './activity'
import { planMessage } from './plan'

const tool = (
  id: string,
  status: ToolCallBlock['status'] = 'success',
  extra: Partial<ToolCallBlock> = {},
): ToolCallBlock => ({
  type: 'tool_call',
  id,
  name: id,
  arguments: {},
  status,
  ...extra,
})
const text = (id: string): ContentBlock => ({ type: 'text', id, text: id })
const reasoning = (id: string, chars = 10, durationMs?: number): ContentBlock => ({
  type: 'reasoning',
  id,
  text: 'x'.repeat(chars),
  ...(durationMs !== undefined ? { durationMs } : {}),
})
const msg = (blocks: ContentBlock[], extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm',
  role: 'assistant',
  blocks,
  ...extra,
})

describe('formatters', () => {
  it('formats elapsed time live and finished', () => {
    expect(formatElapsed(12_400, { live: true })).toBe('12s')
    expect(formatElapsed(12_900, { live: true })).toBe('12s')
    expect(formatElapsed(125_000, { live: true })).toBe('2m 05s')
    expect(formatElapsed(-5, { live: true })).toBe('0s')
    expect(formatElapsed(640)).toBe('640ms')
    expect(formatElapsed(16_000)).toBe('16.0s')
  })

  it('formats token counts and costs', () => {
    expect(formatTokenCount(999)).toBe('999')
    expect(formatTokenCount(2400)).toBe('2.4k')
    expect(formatTokenCount(2000)).toBe('2k')
    expect(formatTokenCount(12_345)).toBe('12k')
    expect(formatTokenCount(1_200_000)).toBe('1.2M')
    expect(formatTokenCount(1_000_000)).toBe('1M')
    expect(formatCost({ amount: 0.021 })).toBe('$0.02')
    expect(formatCost({ amount: 0.0042, currency: 'usd' })).toBe('$0.0042')
    expect(formatCost({ amount: 0 })).toBe('$0.00')
    expect(formatCost({ amount: 1.5, currency: 'eur' })).toBe('1.50 EUR')
  })
})

describe('countActivity and livePhase', () => {
  it('counts reasoning, the latest plan and tools', () => {
    const counts = countActivity([
      reasoning('r', 599),
      { type: 'plan', id: 'p', entries: [{ content: 'a', status: 'completed' }] },
      {
        type: 'plan',
        id: 'p',
        entries: [
          { content: 'a', status: 'completed' },
          { content: 'b', status: 'pending' },
        ],
      },
      tool('a', 'error', { approval: { state: 'denied' } }),
      tool('b', 'error', { approval: { state: 'unavailable' } }),
      tool('c', 'running'),
      tool('d', 'pending'),
      tool('e'),
      text('t'),
    ])
    expect(counts).toEqual({
      reasoningChars: 599,
      plan: { done: 1, total: 2 },
      tools: { total: 5, failed: 2, denied: 2, running: 2 },
    })
  })

  it('reports the live phase', () => {
    const running = tool('x', 'running')
    expect(livePhase(msg([]))).toEqual({ kind: 'waiting' })
    expect(livePhase(msg([text('a'), running]))).toEqual({ kind: 'tool', call: running })
    expect(livePhase(msg([running, text('a')]))).toEqual({ kind: 'tool', call: running })
    expect(livePhase(msg([reasoning('r')]))).toEqual({ kind: 'thinking' })
    expect(livePhase(msg([reasoning('r', 3, 5)]))).toEqual({ kind: 'waiting' })
    expect(livePhase(msg([text('a')]))).toEqual({ kind: 'writing' })
    expect(livePhase(msg([tool('done')]))).toEqual({ kind: 'waiting' })
  })
})

describe('planFooter', () => {
  const finished = msg([reasoning('r', 599), tool('a'), tool('b'), tool('c', 'error'), text('t')], {
    metrics: {
      durationMs: 16_000,
      cost: { amount: 0.021 },
      context: { used: 16_000, size: 1_000_000 },
      model: 'm',
      tokensPerSecond: 30,
    },
  })

  it('carries the collapsed activity', () => {
    expect(
      planFooter(finished, { facts: ['elapsed', 'reasoning', 'plan', 'tools', 'cost'] }),
    ).toEqual([
      { key: 'elapsed', text: '16.0s' },
      { key: 'reasoning', text: '599' },
      { key: 'tools', text: '3 tools, 1 failed' },
      { key: 'cost', text: '$0.02' },
    ])
  })

  it('shows context instead of activity in detail', () => {
    expect(planFooter(finished, { detail: 'details' }).map((f) => f.text)).toEqual([
      '16.0s',
      '$0.02',
      'ctx 16k/1M',
      'm',
      '30.0 tok/s',
    ])
    const noSize = msg([text('t')], { metrics: { context: { used: 500 } } })
    expect(planFooter(noSize, { detail: 'full' })).toEqual([{ key: 'context', text: 'ctx 500' }])
  })

  it('ticks a live footer by the second and shows outcome, plan and a single tool', () => {
    const live = msg([tool('a'), { type: 'plan', id: 'p', entries: [] }], {
      createdAt: 1000,
      metrics: { tokensPerSecond: 5 },
    })
    expect(planFooter(live, { isActive: true, now: 13_400 }).map((f) => f.text)).toEqual([
      '12s',
      '0/0',
      '1 tool',
    ])
    expect(planFooter(live, { isActive: true, now: 13_900 })[0]?.text).toBe('12s')
    expect(planFooter(live, { isActive: true })[0]?.key).toBe('plan')
    expect(planFooter(msg([], { outcome: { kind: 'stopped' } }))).toEqual([
      { key: 'outcome', text: 'stopped' },
    ])
    expect(planFooter(msg([], { outcome: { kind: 'error', message: 'x' } }))[0]?.text).toBe(
      'failed',
    )
    expect(
      planFooter({ ...live, createdAt: undefined as never }, { isActive: true, now: 5 })[0]?.key,
    ).toBe('plan')
  })
})

describe('planMessage placement and live tail', () => {
  const blocks: ContentBlock[] = [
    reasoning('r'),
    text('a'),
    tool('t1'),
    text('b'),
    tool('t2'),
    tool('t3'),
  ]

  it('puts activity after content as one group, with the outcome before it', () => {
    const plan = planMessage(msg(blocks, { outcome: { kind: 'error', message: 'x' } }), {
      activityPlacement: 'after-content',
    })
    expect(
      plan.rows.map((r) =>
        r.kind === 'bare'
          ? r.block.id
          : r.kind === 'group'
            ? `${r.key}:${r.blocks.length}`
            : r.kind,
      ),
    ).toEqual(['a', 'b', 'outcome', 'activity-r:4'])
    expect(planMessage(msg([text('a')]), { activityPlacement: 'after-content' }).rows).toHaveLength(
      1,
    )
  })

  it('shows only the newest tool calls while live, after an earlier row', () => {
    const plan = planMessage(msg(blocks), { isActive: true, liveTail: 2 })
    expect(
      plan.rows.map((r) =>
        r.kind === 'bare' ? r.block.id : r.kind === 'earlier' ? `+${r.count}` : r.kind,
      ),
    ).toEqual(['a', 'b', '+2', 't2', 't3'])
    const after = planMessage(msg(blocks, { outcome: { kind: 'error', message: 'x' } }), {
      isActive: true,
      liveTail: 1,
      activityPlacement: 'after-content',
    })
    expect(
      after.rows.map((r) =>
        r.kind === 'bare' ? r.block.id : r.kind === 'earlier' ? `+${r.count}` : r.kind,
      ),
    ).toEqual(['a', 'b', 'outcome', '+3', 't3'])
  })

  it('keeps reasoning only while nothing else arrived, plus the latest plan and status rows', () => {
    const early = planMessage(msg([reasoning('r1', 3, 1), reasoning('r2')]), {
      isActive: true,
      liveTail: 3,
    })
    expect(
      early.rows.map((r) =>
        r.kind === 'bare' ? r.block.id : `+${(r as { count: number }).count}`,
      ),
    ).toEqual(['+1', 'r2'])
    const withPlan = planMessage(
      msg([
        { type: 'plan', id: 'p1', entries: [] },
        reasoning('r'),
        { type: 'plan', id: 'p2', entries: [] },
        { type: 'status', id: 's', phase: 'streaming' },
        text('a'),
      ]),
      { isActive: true, liveTail: 3 },
    )
    expect(
      withPlan.rows.map((r) =>
        r.kind === 'bare' ? r.block.id : `+${(r as { count: number }).count}`,
      ),
    ).toEqual(['+2', 'p2', 's', 'a'])
    const contentOnly = planMessage(
      msg([text('a')], { outcome: { kind: 'error', message: 'x' } }),
      { isActive: true, liveTail: 3 },
    )
    expect(contentOnly.rows.map((r) => r.kind)).toEqual(['bare', 'outcome'])
    expect(
      planMessage(msg(blocks), { isActive: true, liveTail: 0 }).rows.some(
        (r) => r.kind === 'earlier',
      ),
    ).toBe(false)
  })
})
