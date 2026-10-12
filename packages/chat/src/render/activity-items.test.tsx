import type { ChatMessage } from '@fx/chat-core'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatProvider } from '../registry'
import type { ActivitySummaryProps, MessageDetailsProps } from '../registry'
import { MessageFooter } from './MessageFooter'
import { MessageItem } from './MessageItem'
import { activityFacts, activityItem } from './activity-items'
import type { RenderableBlock } from './extensions'
import { stubMatchMedia } from './test-helpers'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  stubMatchMedia(false)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

type Block = ChatMessage['blocks'][number]
const tool = (over: Partial<Extract<Block, { type: 'tool_call' }>> = {}): Block => ({
  type: 'tool_call',
  id: 'c1',
  name: 'fetch_url',
  arguments: {},
  status: 'success',
  ...over,
})
const idle = { isActive: false }

describe('activityItem', () => {
  it('maps tool calls by status and approval', () => {
    expect(activityItem(tool({ startedAt: 5, durationMs: 7 }), idle)).toEqual({
      id: 'c1',
      kind: 'tool',
      label: 'fetch_url',
      name: 'fetch_url',
      status: 'done',
      startedAt: 5,
      durationMs: 7,
    })
    expect(activityItem(tool({ status: 'running' }), idle).status).toBe('running')
    expect(activityItem(tool({ status: 'pending' }), idle).status).toBe('running')
    expect(activityItem(tool({ status: 'error' }), idle).status).toBe('error')
    expect(activityItem(tool({ approval: { state: 'denied' } }), idle).status).toBe('error')
    expect(activityItem(tool({ approval: { state: 'unavailable' } }), idle).status).toBe('error')
    expect(
      activityItem(tool({ status: 'pending', approval: { state: 'pending' } }), idle).status,
    ).toBe('awaiting')
  })

  it('maps reasoning, live with the rate only while it is the open trailing block', () => {
    const r: Block = { type: 'reasoning', id: 'r', text: 'x', startedAt: 1 }
    expect(activityItem(r, { isActive: true, activeBlockId: 'r', tokensPerSecond: 9 })).toEqual({
      id: 'r',
      kind: 'reasoning',
      label: 'Thinking',
      status: 'running',
      startedAt: 1,
      tokensPerSecond: 9,
    })
    expect(activityItem(r, { isActive: true, activeBlockId: 'r' })).not.toHaveProperty(
      'tokensPerSecond',
    )
    expect(activityItem({ ...r, durationMs: 3 } as Block, idle)).toMatchObject({ status: 'done' })
  })

  it('maps plans, the pending placeholder, and anything else', () => {
    const plan: Block = {
      type: 'plan',
      id: 'p',
      entries: [
        { content: 'a', status: 'completed' },
        { content: 'b', status: 'in_progress' },
      ],
    }
    expect(activityItem(plan, { isActive: true })).toMatchObject({
      kind: 'plan',
      status: 'running',
      detail: '1/2',
    })
    expect(activityItem(plan, idle).status).toBe('done')
    const status: Block = { type: 'status', id: 's', phase: 'pre-stream' }
    expect(activityItem(status, { isActive: true })).toEqual({
      id: 's',
      kind: 'waiting',
      label: 'Starting',
      status: 'running',
    })
    // The message's start is the pending item's clock.
    expect(activityItem(status, { isActive: true, startedAt: 5 }).startedAt).toBe(5)
    expect(activityItem(status, idle).status).toBe('done')
    const custom = { type: 'search_hit', id: 'h' } as unknown as RenderableBlock
    expect(activityItem(custom, idle)).toEqual({
      id: 'h',
      kind: 'other',
      label: 'search_hit',
      status: 'done',
    })
    expect(activityItem(custom, { isActive: true, activeBlockId: 'h' }).status).toBe('running')
  })
})

describe('activityFacts', () => {
  it('counts tools and failures, times thinking, and tracks the plan', () => {
    expect(
      activityFacts([
        tool(),
        tool({ id: 'c2', status: 'error' }),
        { type: 'reasoning', id: 'r1', text: 'abc', durationMs: 2000 },
        { type: 'reasoning', id: 'r2', text: 'd', durationMs: 3000 },
        { type: 'plan', id: 'p', entries: [{ content: 'a', status: 'completed' }] },
      ]),
    ).toEqual([
      { key: 'tools', text: '2', label: '2 tool calls, 1 failed', failed: 1 },
      { key: 'reasoning', text: '5.0s', label: 'Thought for 5.0s' },
      { key: 'plan', text: '1/1', label: 'Plan: 1 of 1 done' },
    ])
  })

  it('sizes untimed thinking, and has nothing for no activity', () => {
    expect(activityFacts([tool(), { type: 'reasoning', id: 'r', text: 'abcd' }])).toEqual([
      { key: 'tools', text: '1', label: '1 tool call' },
      { key: 'reasoning', text: '4', label: 'Thought (4 characters)' },
    ])
    expect(activityFacts([{ type: 'text', id: 't', text: 'hi' }])).toEqual([])
  })
})

/** A registry with recording ActivitySummary / MessageDetails stubs. */
function recording(withDetails = true) {
  const summaries: ActivitySummaryProps[] = []
  const details: MessageDetailsProps[] = []
  const ActivitySummary = (props: ActivitySummaryProps) => {
    summaries.push(props)
    return (
      <div data-testid="summary">
        {props.items.map((item) => (
          <button key={item.id} type="button" onClick={() => props.onActivate?.(item.id)}>
            {item.label}:{item.status}
          </button>
        ))}
      </div>
    )
  }
  const MessageDetails = (props: MessageDetailsProps) => {
    details.push(props)
    return props.open ? <div data-testid="details">{props.activity}</div> : null
  }
  return {
    summaries,
    details,
    components: withDetails ? { ActivitySummary, MessageDetails } : { ActivitySummary },
  }
}

const answer = (blocks: Block[], over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm',
  role: 'assistant',
  blocks,
  ...over,
})

describe('MessageItem activityDisplay="summary"', () => {
  it('folds each run of activity into one summary, keeping content in place', () => {
    const rec = recording()
    render(
      <ChatProvider components={rec.components}>
        <MessageItem
          activityDisplay="summary"
          message={answer([
            { type: 'reasoning', id: 'r', text: 'x', durationMs: 1 },
            tool(),
            tool({ id: 'c2' }),
            { type: 'text', id: 't', text: 'middle' },
            tool({ id: 'c3', name: 'calculator' }),
            { type: 'text', id: 't2', text: 'end' },
          ])}
        />
      </ChatProvider>,
    )
    const runs = screen.getAllByTestId('summary')
    expect(runs).toHaveLength(2)
    expect(
      within(runs[0] as HTMLElement)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Thinking:done', 'fetch_url:done', 'fetch_url:done'])
    expect(within(runs[1] as HTMLElement).getByRole('button')).toHaveTextContent('calculator:done')
    expect(screen.getByText('middle')).toBeInTheDocument()
    // No compact footer and the registry's details presenter: tiles still open it.
    expect(rec.summaries.at(-1)?.onActivate).toBeTypeOf('function')
  })

  it('shows the pending placeholder as a waiting item, live', () => {
    const rec = recording()
    render(
      <ChatProvider components={rec.components}>
        <MessageItem activityDisplay="summary" isActive message={answer([], { createdAt: 0 })} />
      </ChatProvider>,
    )
    expect(screen.getByRole('button')).toHaveTextContent('Starting:running')
    expect(rec.summaries.at(-1)?.live).toBe(true)
  })

  it('drops the live tail\'s "earlier" row', () => {
    const rec = recording()
    render(
      <ChatProvider components={rec.components}>
        <MessageItem
          activityDisplay="summary"
          isActive
          liveTail={1}
          message={answer([tool(), tool({ id: 'c2' }), tool({ id: 'c3', status: 'running' })])}
        />
      </ChatProvider>,
    )
    expect(screen.queryByText(/earlier/)).toBeNull()
    expect(screen.getByRole('button')).toHaveTextContent('fetch_url:running')
  })

  it('opens the details at an item, with the activity as rows', () => {
    const rec = recording()
    render(
      <ChatProvider components={rec.components}>
        <MessageItem
          activityDisplay="summary"
          isActive
          onRegenerate={vi.fn()}
          message={answer([tool({ id: 'c1' }), tool({ id: 'c2', status: 'running' })], {
            createdAt: 0,
          })}
        />
      </ChatProvider>,
    )
    expect(screen.queryByTestId('details')).toBeNull()
    fireEvent.click(screen.getAllByRole('button')[0] as HTMLElement)
    const sheet = screen.getByTestId('details')
    const last = rec.details.at(-1) as MessageDetailsProps
    expect(last.focusId).toBe('c1')
    // Live: nothing to copy and no actions yet.
    expect(last.copyText).toBe('')
    expect(last.actions).toEqual([])
    const items = sheet.querySelectorAll('.chat-details-activity-item')
    expect([...items].map((i) => i.getAttribute('data-block-id'))).toEqual(['c1', 'c2'])
    expect([...items].map((i) => i.getAttribute('data-focused'))).toEqual(['true', null])
    act(() => last.onOpenChange(false))
    expect(screen.queryByTestId('details')).toBeNull()
  })

  it('renders rows without an ActivitySummary, and summaries without details', () => {
    const { rerender } = render(
      <MessageItem activityDisplay="summary" message={answer([tool(), tool({ id: 'c2' })])} />,
    )
    expect(screen.queryByTestId('summary')).toBeNull()
    expect(document.querySelector('.chat-group')).not.toBeNull()
    const rec = recording(false)
    rerender(
      <ChatProvider components={rec.components}>
        <MessageItem activityDisplay="summary" message={answer([tool()])} />
      </ChatProvider>,
    )
    expect(rec.summaries.at(-1)?.onActivate).toBeUndefined()
  })
})

describe('MessageItem summary edge paths', () => {
  it('gutters summaries, passes every action, and renders extensions in the details', () => {
    const rec = recording()
    const onFork = vi.fn()
    const onReset = vi.fn()
    const Custom = () => <span data-testid="custom-tool">custom</span>
    render(
      <ChatProvider components={rec.components}>
        <MessageItem
          activityDisplay="summary"
          compactFooter
          timestampGutter
          onFork={onFork}
          onReset={onReset}
          extensions={{ toolRenderers: { fetch_url: Custom } }}
          message={answer([tool({ startedAt: 1000 }), { type: 'text', id: 't', text: '  ' }], {
            createdAt: 0,
            metrics: { model: 'm' },
          })}
        />
      </ChatProvider>,
    )
    // The summary sits in a gutter row like any other row.
    expect(screen.getByTestId('summary').closest('.chat-gutter-row')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'fetch_url:done' }))
    const last = rec.details.at(-1) as MessageDetailsProps
    expect(last.copyText).toBe('')
    expect(last.actions.map((a) => a.id)).toEqual(['fork', 'reset'])
    expect(within(screen.getByTestId('details')).getByTestId('custom-tool')).toBeInTheDocument()
  })
})

describe('MessageItem finishedActivity="footer"', () => {
  const finished = answer(
    [
      { type: 'reasoning', id: 'r', text: 'x', durationMs: 4000 },
      tool({ status: 'error' }),
      { type: 'text', id: 't', text: 'done' },
    ],
    { metrics: { model: 'gpt-x' } },
  )

  it('drops the rows; a fact shows them again (and hides them), the info control opens details', () => {
    const rec = recording()
    render(
      <ChatProvider components={rec.components}>
        <MessageItem finishedActivity="footer" compactFooter message={finished} />
      </ChatProvider>,
    )
    expect(document.querySelector('.chat-row')).toBeNull()
    const facts = document.querySelector('.chat-footer-activity') as HTMLElement
    expect(facts).toHaveAttribute('data-expanded', 'false')
    expect(facts.querySelector('[data-fact=tools]')).toHaveAttribute('data-failed', '1')
    const tools = screen.getByRole('button', { name: 'Show activity: 1 tool call, 1 failed' })
    expect(within(tools).getByText('1')).toBeInTheDocument()
    fireEvent.click(tools)
    // The activity is back in place (as rows here: no summary display), not in a sheet.
    expect(document.querySelector('.chat-row')).not.toBeNull()
    expect(screen.queryByTestId('details')).toBeNull()
    expect(facts).toHaveAttribute('data-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Hide activity: Thought for 4.0s' }))
    expect(document.querySelector('.chat-row')).toBeNull()
    // Only the info control opens the details.
    fireEvent.click(screen.getByLabelText('Message details'))
    expect(screen.getByTestId('details')).toBeInTheDocument()
    const last = rec.details.at(-1) as MessageDetailsProps
    expect(last.focusId).toBeUndefined()
    expect(last.copyText).toBe('done')
    expect(last.details).toEqual([{ key: 'model', label: 'Model', value: 'gpt-x' }])
  })

  it('shows summarized activity inside the footer, beside the facts', () => {
    const rec = recording()
    render(
      <ChatProvider components={rec.components}>
        <MessageItem
          finishedActivity="footer"
          activityDisplay="summary"
          compactFooter
          message={finished}
        />
      </ChatProvider>,
    )
    expect(screen.queryByTestId('summary')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show activity: 1 tool call, 1 failed' }))
    const summary = screen.getByTestId('summary')
    // In the footer, right after the facts, not back among the blocks.
    expect(summary.closest('.chat-footer-activity-items')).not.toBeNull()
    expect(summary.closest('.chat-message-blocks')).toBeNull()
    expect(
      (document.querySelector('.chat-footer-activity') as Element).nextElementSibling,
    ).toHaveClass('chat-footer-activity-items')
    expect(rec.summaries.at(-1)?.live).toBe(false)
    expect(
      within(summary)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Thinking:done', 'fetch_url:error'])
    fireEvent.click(screen.getByRole('button', { name: 'Hide activity: 1 tool call, 1 failed' }))
    expect(screen.queryByTestId('summary')).toBeNull()
  })

  it('shows the facts as plain text when nothing toggles them', () => {
    render(
      <MessageFooter
        copyText="x"
        activity={[{ key: 'plan', text: '1/2', label: 'Plan: 1 of 2 done' }]}
      />,
    )
    const facts = document.querySelector('.chat-footer-activity') as HTMLElement
    expect(facts).not.toHaveAttribute('data-expanded')
    const body = facts.querySelector('.chat-footer-fact-body') as HTMLElement
    expect(body.tagName).toBe('SPAN')
    expect(body).toHaveAttribute('title', 'Plan: 1 of 2 done')
  })

  it('passes an error outcome to the presenter', () => {
    const rec = recording()
    render(
      <ChatProvider components={rec.components}>
        <MessageItem
          compactFooter
          onRegenerate={vi.fn()}
          message={answer([{ type: 'text', id: 't', text: 'x' }], {
            outcome: { kind: 'error', message: 'boom' },
          })}
        />
      </ChatProvider>,
    )
    expect(rec.details.at(-1)?.outcome).toEqual({ kind: 'error', message: 'boom' })
    expect(rec.details.at(-1)?.actions.map((a) => a.id)).toEqual(['regenerate'])
    expect(rec.details.at(-1)?.activity).toBeUndefined()
  })
})
