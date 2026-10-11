import { describe, expect, it } from 'vitest'
import type { ChatMessage, ContentBlock } from '../model'
import {
  formatFooterMetrics,
  isBlockActive,
  planGroupHeader,
  planMessage,
  shouldShowTimer,
  statusLabel,
} from './plan'

const text = (id: string): ContentBlock => ({ type: 'text', id, text: id })
const reasoning = (id: string, extra = {}): ContentBlock => ({
  type: 'reasoning',
  id,
  text: id,
  ...extra,
})
const tool = (
  id: string,
  status: 'pending' | 'running' | 'success' | 'error' = 'success',
): ContentBlock => ({
  type: 'tool_call',
  id,
  name: `tool-${id}`,
  arguments: {},
  status,
})
const status = (id: string): ContentBlock => ({ type: 'status', id, phase: 'streaming' })
const msg = (blocks: ContentBlock[], role: ChatMessage['role'] = 'assistant'): ChatMessage => ({
  id: 'm',
  role,
  blocks,
})

describe('isBlockActive', () => {
  const ctx = { isActive: true, activeBlockId: 'x' }
  it('treats pending/running tool calls as live anywhere in a live message without an outcome', () => {
    expect(isBlockActive(tool('t', 'running'), { isActive: true })).toBe(true)
    expect(isBlockActive(tool('t', 'pending'), { isActive: true })).toBe(true)
    expect(isBlockActive(tool('t', 'running'), {})).toBe(false)
    expect(
      isBlockActive(tool('t', 'running'), { isActive: true, outcome: { kind: 'stopped' } }),
    ).toBe(false)
    expect(isBlockActive(tool('x', 'success'), ctx)).toBe(false)
  })
  it('requires trailing position for other kinds, and unfinished reasoning', () => {
    expect(isBlockActive(status('x'), ctx)).toBe(true)
    expect(isBlockActive(status('y'), ctx)).toBe(false)
    expect(isBlockActive(text('x'), { activeBlockId: 'x' })).toBe(false)
    expect(isBlockActive(reasoning('x'), ctx)).toBe(true)
    expect(isBlockActive(reasoning('x', { durationMs: 5 }), ctx)).toBe(false)
  })
})

describe('planMessage', () => {
  it('plans a pending row for an active, empty assistant message', () => {
    expect(planMessage(msg([]), { isActive: true })).toEqual({
      rows: [{ kind: 'pending', id: 'm:pending' }],
      showFooter: false,
    })
  })

  it('groups auxiliary runs and gates the footer on content', () => {
    const plan = planMessage(msg([reasoning('r'), tool('t'), text('a')]))
    expect(plan.rows).toEqual([
      { kind: 'group', key: 'group-r', blocks: [reasoning('r'), tool('t')] },
      { kind: 'bare', block: text('a') },
    ])
    expect(plan.showFooter).toBe(true)
    expect(plan.activeBlockId).toBeUndefined()
    expect(planMessage(msg([reasoning('r'), tool('t')])).showFooter).toBe(false)
    expect(planMessage(msg([text('a')]), { showFooter: false }).showFooter).toBe(false)
    expect(planMessage(msg([text('a')], 'user')).showFooter).toBe(false)
  })

  it('marks the trailing block active and hides the footer while streaming', () => {
    const plan = planMessage(msg([text('a'), text('b')]), { isActive: true })
    expect(plan.activeBlockId).toBe('b')
    expect(plan.showFooter).toBe(false)
  })

  it('folds a whole assistant turn in minimal mode but not user messages', () => {
    const blocks = [reasoning('r'), text('a'), tool('t')]
    expect(planMessage(msg(blocks), { minimal: true }).rows.map((r) => r.kind)).toEqual([
      'group',
      'bare',
    ])
    expect(planMessage(msg(blocks, 'user'), { minimal: true }).rows.map((r) => r.kind)).toEqual([
      'bare',
      'bare',
      'bare',
    ])
  })

  it('plans every block bare when flat, honoring overrides', () => {
    expect(planMessage(msg([reasoning('r'), tool('t')]), { flat: true }).rows).toEqual([
      { kind: 'bare', block: reasoning('r') },
      { kind: 'bare', block: tool('t') },
    ])
    const overrides = { reasoning: { auxEligible: false } }
    expect(planMessage(msg([reasoning('r')]), { overrides }).showFooter).toBe(true)
  })
})

describe('planMessage outcomes', () => {
  it('adds an error outcome row and opens the footer for any outcome', () => {
    const failed = { ...msg([]), outcome: { kind: 'error' as const, message: 'boom' } }
    expect(planMessage(failed)).toEqual({
      rows: [{ kind: 'outcome', outcome: { kind: 'error', message: 'boom' } }],
      showFooter: true,
    })
    const stopped = { ...msg([tool('t', 'running')]), outcome: { kind: 'stopped' as const } }
    const plan = planMessage(stopped)
    expect(plan.rows.map((r) => r.kind)).toEqual(['bare'])
    expect(plan.showFooter).toBe(true)
    expect(
      planMessage({ ...msg([]), role: 'user', outcome: { kind: 'error', message: 'x' } }).rows,
    ).toEqual([])
  })
})

describe('planGroupHeader', () => {
  it('heads with the latest eligible block and counts the rest', () => {
    const plan = planGroupHeader([reasoning('r', { durationMs: 2400 }), tool('t')], {
      startedAt: 100,
    })
    expect(plan.summaryBlock.id).toBe('t')
    expect(plan.summary.label).toBe('tool-t')
    expect(plan.hiddenCount).toBe(1)
    expect(plan.isActive).toBe(false)
    expect(plan.showTimer).toBe(false)
    expect(plan.startedAt).toBe(100)
    expect(plan.showRate).toBe(true)
  })

  it('keeps a trailing live status as the header with the message timer', () => {
    const plan = planGroupHeader([tool('t'), status('s')], {
      isActive: true,
      activeBlockId: 's',
      startedAt: 50,
      durationMs: 900,
    })
    expect(plan.summaryBlock.id).toBe('s')
    expect(plan.showTimer).toBe(true)
    expect(plan.durationMs).toBe(900)
    expect(plan.showRate).toBe(true)
    const idle = planGroupHeader([tool('t'), status('s')], { isActive: true, activeBlockId: 'zz' })
    expect(idle.summaryBlock.id).toBe('t')
    expect(idle.showRate).toBe(false)
  })

  it('ticks live reasoning from its own start', () => {
    const plan = planGroupHeader([tool('t'), reasoning('r', { startedAt: 777 })], {
      isActive: true,
      activeBlockId: 'r',
      startedAt: 1,
    })
    expect(plan.summary.label).toBe('Thinking…')
    expect(plan.showTimer).toBe(true)
    expect(plan.durationMs).toBeUndefined()
    expect(plan.startedAt).toBe(777)
  })

  it('omits the anchor when nothing provides one, and status rate needs activity', () => {
    const plan = planGroupHeader([tool('a'), tool('b')], {})
    expect('startedAt' in plan).toBe(false)
    const statusHead = planGroupHeader([status('s'), status('s2')], { isActive: false })
    expect(statusHead.showRate).toBe(false)
    expect('durationMs' in statusHead).toBe(false)
  })
})

describe('labels and gates', () => {
  it('labels status rows', () => {
    expect(statusLabel('pre-stream', true)).toBe('Starting…')
    expect(statusLabel('streaming', true)).toBe('Generating…')
    expect(statusLabel(undefined, false)).toBe('Generated')
  })

  it('shows a timer only with a duration or a usable live clock', () => {
    expect(shouldShowTimer({ showTimer: true, isActive: false, durationMs: 0 })).toBe(true)
    expect(shouldShowTimer({ showTimer: true, isActive: true, startedAt: 5 })).toBe(true)
    expect(shouldShowTimer({ showTimer: true, isActive: true, startedAt: Number.NaN })).toBe(false)
    expect(shouldShowTimer({ showTimer: true, isActive: false, startedAt: 5 })).toBe(false)
    expect(shouldShowTimer({ showTimer: false, isActive: true, startedAt: 5, durationMs: 1 })).toBe(
      false,
    )
  })

  it('formats footer metrics', () => {
    expect(formatFooterMetrics(undefined)).toBeUndefined()
    expect(formatFooterMetrics({})).toBeUndefined()
    expect(formatFooterMetrics({ model: 'm', durationMs: 1500, tokensPerSecond: 40 })).toBe(
      'm · 1.5s · 40.0 tok/s',
    )
  })
})
