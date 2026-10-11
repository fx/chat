import { describe, expect, it } from 'vitest'
import type { ChatMessage, ContentBlock } from '../model'
import {
  type ToolGroupCounts,
  formatFooterMetrics,
  isBlockActive,
  planGroupHeader,
  planMessage,
  shouldShowTimer,
  statusLabel,
  toolGroupLabel,
  toolSpanMs,
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

  it('gates the footer on per-tool overrides, matching grouping', () => {
    const overrides = { 'tool-deploy': { auxEligible: false } }
    const deploy = planMessage(msg([tool('deploy'), tool('t')]), { overrides })
    expect(deploy.rows).toEqual([
      { kind: 'bare', block: tool('deploy') },
      { kind: 'bare', block: tool('t') },
    ])
    expect(planMessage(msg([tool('deploy')]), { overrides }).showFooter).toBe(true)
    const aux = planMessage(msg([tool('t'), tool('u')]), { overrides })
    expect(aux.rows).toEqual([{ kind: 'group', key: 'group-t', blocks: [tool('t'), tool('u')] }])
    expect(aux.showFooter).toBe(false)
    expect(planMessage(msg([tool('t')]), { overrides }).showFooter).toBe(false)
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
  type Tool = Extract<ContentBlock, { type: 'tool_call' }>
  const call = (id: string, extra: Partial<Tool> = {}): Tool => ({
    ...(tool(id) as Tool),
    ...extra,
  })

  it('is about the tool calls only: count and span when all succeeded', () => {
    const blocks = [
      reasoning('r0', { durationMs: 900 }),
      call('a', { startedAt: 1000, durationMs: 2000 }),
      reasoning('r1', { durationMs: 900 }),
      call('b', { startedAt: 4000, durationMs: 1200 }),
      { type: 'status', id: 's', phase: 'complete' } as ContentBlock,
    ]
    const plan = planGroupHeader(blocks, { startedAt: 100 })
    expect(plan.kind).toBe('tools')
    expect(plan.tools).toMatchObject({ total: 2, succeeded: 2, failed: 0 })
    expect(plan.summary).toMatchObject({ iconName: 'wrench', label: '2 tool calls' })
    expect(plan.hiddenCount).toBe(0)
    expect(plan.durationMs).toBe(4200)
    expect(plan.showTimer).toBe(true)
    expect(plan.startedAt).toBe(1000)
    expect(plan.showRate).toBe(false)
    expect(toolGroupLabel(plan.tools as ToolGroupCounts, plan.durationMs)).toBe(
      '2 tool calls · 4.2s',
    )
    expect(toolGroupLabel({ total: 1, succeeded: 1, failed: 0 })).toBe('1 tool call')
  })

  it('splits successes and failures, denied and unavailable counting as failed', () => {
    const plan = planGroupHeader(
      [
        call('a', { durationMs: 1000 }),
        call('b', { status: 'error', durationMs: 500 }),
        call('c', { approval: { state: 'denied' } }),
        call('d', { approval: { state: 'unavailable' }, status: 'error' }),
        call('e', { durationMs: 100 }),
      ],
      {},
    )
    expect(plan.tools).toMatchObject({ total: 5, succeeded: 2, failed: 3 })
    // No start times: the sum of the known durations.
    expect(plan.durationMs).toBe(1600)
    expect(plan.summary.label).toBe('5 tool calls · 2 ok · 3 failed')
    expect('startedAt' in plan).toBe(false)
  })

  it('reads one call as its row: headline and duration', () => {
    const plan = planGroupHeader(
      [
        reasoning('r', { durationMs: 1 }),
        call('a', { title: 'Running', inputSummary: 'ls -la', durationMs: 300, startedAt: 9 }),
      ],
      {},
    )
    expect(plan.tools?.only?.id).toBe('a')
    expect(plan.summary.label).toBe('Running ls -la')
    expect(plan.durationMs).toBe(300)
  })

  it('spans parallel calls by wall clock, falls back to the sum, omits unknown time', () => {
    const span = planGroupHeader(
      [
        call('a', { startedAt: 1000, durationMs: 3000 }),
        call('b', { startedAt: 1500, durationMs: 1000 }),
      ],
      {},
    )
    expect(span.durationMs).toBe(3000)
    expect(
      toolSpanMs([call('a', { durationMs: 3000 }), call('b', { startedAt: 5, durationMs: 1000 })]),
    ).toBe(4000)
    expect(toolSpanMs([call('a'), call('b')])).toBeUndefined()
    // Non-finite or negative durations are ignored; a bad start falls back to the sum.
    expect(
      toolSpanMs([
        call('a', { startedAt: 1000, durationMs: Number.NaN }),
        call('b', { startedAt: 1000, durationMs: -5 }),
        call('c', { startedAt: 2000, durationMs: 500 }),
      ]),
    ).toBe(500)
    expect(
      toolSpanMs([
        call('a', { startedAt: -1, durationMs: 300 }),
        call('b', { startedAt: 2000, durationMs: 200 }),
      ]),
    ).toBe(500)
    expect(toolSpanMs([call('a', { durationMs: Number.POSITIVE_INFINITY })])).toBeUndefined()
    const untimed = planGroupHeader([call('a'), call('b')], {})
    expect('durationMs' in untimed).toBe(false)
    expect('durationMs' in untimed.summary).toBe(false)
  })

  it('shows the count so far, the running call and a live timer while live', () => {
    const plan = planGroupHeader(
      [
        call('a', { startedAt: 2000, durationMs: 500 }),
        reasoning('r', { durationMs: 10 }),
        call('b', {
          status: 'running',
          title: 'Running',
          inputSummary: 'sleep 2',
          startedAt: 3000,
        }),
      ],
      { isActive: true, startedAt: 1000 },
    )
    expect(plan.isActive).toBe(true)
    expect(plan.tools?.running?.id).toBe('b')
    expect(plan.summary.label).toBe('2 tool calls · Running sleep 2')
    expect(plan.durationMs).toBeUndefined()
    expect(plan.startedAt).toBe(2000)
    expect(plan.summaryBlock.id).toBe('b')
    const one = planGroupHeader([call('x', { status: 'running' }), status('s')], {
      isActive: true,
      activeBlockId: 's',
      startedAt: 7,
    })
    expect(one.summary.label).toBe('tool-x')
    expect(one.startedAt).toBe(7)
  })

  it('ticks only while a call runs; with live reasoning after finished calls, the span is static', () => {
    const plan = planGroupHeader(
      [
        call('a', { startedAt: 1000, durationMs: 500 }),
        call('b', { startedAt: 2000, durationMs: 500 }),
        reasoning('r', { startedAt: 3000 }),
      ],
      { isActive: true, activeBlockId: 'r', startedAt: 1 },
    )
    expect(plan.isActive).toBe(true)
    expect(plan.tools?.running).toBeUndefined()
    expect(plan.durationMs).toBe(1500)
    expect(plan.showTimer).toBe(true)
    const untimed = planGroupHeader([call('a'), call('b'), reasoning('r')], {
      isActive: true,
      activeBlockId: 'r',
    })
    expect(untimed.showTimer).toBe(false)
  })

  it('reads reasoning: one thought as its row, several as a truthful count', () => {
    const one = planGroupHeader(
      [reasoning('r', { durationMs: 2400 }), { type: 'status', id: 's', phase: 'complete' }],
      {},
    )
    expect(one.kind).toBe('reasoning')
    expect(one.summary.label).toBe('Thought for 2.4s')
    expect(one.hiddenCount).toBe(0)
    expect(one.showTimer).toBe(false)
    const two = planGroupHeader(
      [reasoning('a', { durationMs: 1000 }), reasoning('b', { durationMs: 2100 })],
      {},
    )
    expect(two.reasoningCount).toBe(2)
    expect(two.summary.label).toBe('Thought ×2 · 3.1s')
    expect(two.hiddenCount).toBe(0)
    expect(planGroupHeader([reasoning('a'), reasoning('b')], {}).summary.label).toBe('Reasoning ×2')
  })

  it('ticks live reasoning from its own start', () => {
    const one = planGroupHeader([reasoning('r', { startedAt: 777 })], {
      isActive: true,
      activeBlockId: 'r',
      startedAt: 1,
    })
    expect(one.summary.label).toBe('Thinking…')
    expect(one.showTimer).toBe(true)
    expect(one.startedAt).toBe(777)
    const many = planGroupHeader(
      [reasoning('a', { durationMs: 5 }), reasoning('b', { startedAt: 888 })],
      { isActive: true, activeBlockId: 'b', startedAt: 1 },
    )
    expect(many.summary.label).toBe('Thinking… ×2')
    expect(many.showTimer).toBe(true)
    expect(many.durationMs).toBeUndefined()
    expect(many.startedAt).toBe(888)
    expect(planGroupHeader([reasoning('a'), reasoning('b')], {}).startedAt).toBeUndefined()
  })

  it('heads a plan group with the latest plan, counting the rest', () => {
    const plan = planGroupHeader(
      [
        { type: 'plan', id: 'p1', entries: [] },
        { type: 'plan', id: 'p2', entries: [{ content: 'x', status: 'completed' }] },
        reasoning('r', { durationMs: 1 }),
      ],
      {},
    )
    expect(plan.kind).toBe('block')
    expect(plan.summary.label).toBe('Plan 1/1')
    expect(plan.hiddenCount).toBe(2)
  })

  it('keeps a trailing live status as the header with the message timer', () => {
    const plan = planGroupHeader([reasoning('r', { durationMs: 1 }), status('s')], {
      isActive: true,
      activeBlockId: 's',
      startedAt: 50,
      durationMs: 900,
    })
    expect(plan.summaryBlock.id).toBe('s')
    expect(plan.showTimer).toBe(true)
    expect(plan.durationMs).toBe(900)
    expect(plan.showRate).toBe(true)
    expect(plan.hiddenCount).toBe(1)
  })

  it('omits the anchor when nothing provides one, and status rate needs activity', () => {
    const statusHead = planGroupHeader([status('s'), status('s2')], { isActive: false })
    expect(statusHead.showRate).toBe(false)
    expect('durationMs' in statusHead).toBe(false)
    expect('startedAt' in statusHead).toBe(false)
    const custom = planGroupHeader(
      [{ type: 'note', id: 'n1' } as never, { type: 'note', id: 'n2' } as never],
      { isActive: true },
    )
    expect(custom.showRate).toBe(false)
    // Reasoning beside a non-summary custom kind heads the group by the policy.
    const mixed = planGroupHeader(
      [reasoning('r', { startedAt: 5, durationMs: 1 }), { type: 'note', id: 'n' } as never],
      { overrides: { note: { auxEligible: true } } },
    )
    expect(mixed.kind).toBe('block')
    expect(mixed.summaryBlock.id).toBe('r')
    expect(mixed.startedAt).toBe(5)
    expect(mixed.hiddenCount).toBe(1)
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
