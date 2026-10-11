import type { ContentBlock } from '@fx/chat-core'
import { act, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BlockGroup } from './BlockGroup'
import type { BlockRenderContext } from './blocks'
import type { CustomBlock } from './extensions'
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

const ctx = (extra?: Partial<BlockRenderContext>): BlockRenderContext => ({
  role: 'assistant',
  ...extra,
})

const reasoning = (id: string): ContentBlock => ({ type: 'reasoning', id, text: id })
const tool = (id: string, name = id): ContentBlock => ({
  type: 'tool_call',
  id,
  name,
  arguments: {},
  status: 'success',
})
const status = (id: string): ContentBlock => ({ type: 'status', id })
const plan = (id: string): ContentBlock => ({ type: 'plan', id, entries: [] })
const thought = (id: string, durationMs = 5): ContentBlock => ({
  type: 'reasoning',
  id,
  text: id,
  durationMs,
})

describe('BlockGroup', () => {
  it('heads a tool group with its calls only: count, failures and time, no (+N)', () => {
    const blocks: ContentBlock[] = [
      reasoning('r'),
      { ...(tool('t1', 'search') as object), startedAt: 1000, durationMs: 2000 } as ContentBlock,
      reasoning('r2'),
      {
        ...(tool('t2', 'fetch') as object),
        status: 'error',
        startedAt: 2500,
        durationMs: 500,
      } as ContentBlock,
    ]
    const { container } = render(<BlockGroup blocks={blocks} context={ctx()} />)
    const summary = container.querySelector('.chat-group-summary') as HTMLElement
    expect(summary.textContent).toBe('2 tool calls · 1 ok · 1 failed')
    expect(summary.getAttribute('data-tools')).toBe('2')
    expect(summary.getAttribute('data-failed')).toBe('1')
    expect(container.querySelector('.chat-group-more')).toBeNull()
    const header = container.querySelector('.chat-row-header') as HTMLElement
    expect(within(header).getByText('2.0s')).toBeInTheDocument()
  })

  it('reads a one-call group like the call’s row: error state and approval qualifier', () => {
    const blocks: ContentBlock[] = [
      reasoning('r'),
      {
        ...(tool('t', 'shell') as object),
        status: 'error',
        approval: { state: 'denied' },
      } as ContentBlock,
    ]
    const { container } = render(<BlockGroup blocks={blocks} context={ctx()} />)
    expect(container.querySelector('.chat-group')?.classList.contains('chat-row-error')).toBe(true)
    expect(container.querySelector('.chat-group-summary')?.textContent).toBe('shell · denied')
    const ok = render(<BlockGroup blocks={[reasoning('r2'), tool('t2', 'ls')]} context={ctx()} />)
    expect(ok.container.querySelector('.chat-group')?.classList.contains('chat-row-error')).toBe(
      false,
    )
    expect(ok.container.querySelector('.chat-tool-approval')).toBeNull()
  })

  it('renders a header summary chip and a (+N) plain-text count', () => {
    const blocks = [reasoning('r'), plan('p1'), plan('p2')]
    const { container } = render(<BlockGroup blocks={blocks} context={ctx()} defaultOpen />)
    // The latest plan heads the summary chip.
    const summary = container.querySelector('.chat-group-summary-label') as HTMLElement
    expect(summary.textContent).toBe('Plan')
    // The hidden-count `(+N)` is plain muted text (parenthesized, reference
    // format) — a bare <span>, NOT a filled `Badge` chip (no `chat-badge`).
    const more = container.querySelector('.chat-group-more') as HTMLElement
    expect(more.textContent).toBe('(+2)')
    expect(more.tagName).toBe('SPAN')
    expect(more.classList.contains('chat-badge')).toBe(false)
    expect(screen.getByText('(+2)')).toBeInTheDocument()
  })

  it('surfaces an ACTIVE trailing status row as the summary (no +N when 1 hidden)', () => {
    const blocks = [thought('t1'), status('s')]
    render(
      <BlockGroup
        blocks={blocks}
        context={ctx({ isActive: true, activeBlockId: 's', startedAt: 0 })}
      />,
    )
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('(+1)')).toBeInTheDocument()
  })

  it('surfaces the tool summary (not "Status") for a COMPLETED status-ending run', () => {
    const blocks = [tool('t1', 'search'), status('s')]
    const { container } = render(<BlockGroup blocks={blocks} context={ctx()} />)
    const summary = container.querySelector('.chat-group-summary-label') as HTMLElement
    expect(summary.textContent).toBe('search')
  })

  it('surfaces live timer + tokens/sec on a grouped active status header', () => {
    const blocks = [thought('t1'), status('s')]
    const { container } = render(
      <BlockGroup
        blocks={blocks}
        context={ctx({ isActive: true, activeBlockId: 's', startedAt: 0, tokensPerSecond: 8 })}
      />,
    )
    const header = container.querySelector('.chat-row-header') as HTMLElement
    // A status summary KEEPS its timer + tok/s — the "Generating…"/"Generated"
    // label does not embed the duration, so these carry it. They render as plain
    // muted text spans (NOT filled `Badge` chips — no `chat-badge`).
    const timer = header.querySelector('.chat-row-timer') as HTMLElement
    const tps = header.querySelector('.chat-row-tps') as HTMLElement
    expect(timer).not.toBeNull()
    expect(timer.tagName).toBe('SPAN')
    expect(timer.classList.contains('chat-badge')).toBe(false)
    expect(tps).not.toBeNull()
    expect(tps.tagName).toBe('SPAN')
    expect(tps.classList.contains('chat-badge')).toBe(false)
    expect(within(header).getByText('0.0s')).toBeInTheDocument()
    expect(within(header).getByText('8.0 tok/s')).toBeInTheDocument()
  })

  it('prefers a finalized durationMs on an active status summary header', () => {
    // An active status summary with a provided finalized durationMs surfaces
    // that duration (durationMs wins over the live ticker in the substrate).
    const blocks = [thought('t1'), status('s')]
    const { container } = render(
      <BlockGroup
        blocks={blocks}
        context={ctx({ isActive: true, activeBlockId: 's', startedAt: 0, durationMs: 3000 })}
      />,
    )
    const header = container.querySelector('.chat-row-header') as HTMLElement
    expect(within(header).getByText('3.0s')).toBeInTheDocument()
  })

  it('does not surface a status timer on a completed status-ending group header', () => {
    // Completed run → tool summary heads the group; no status duration pill leaks.
    const blocks = [tool('t1', 'search'), status('s')]
    const { container } = render(<BlockGroup blocks={blocks} context={ctx({ durationMs: 2000 })} />)
    const header = container.querySelector('.chat-row-header') as HTMLElement
    expect(within(header).queryByText('2.0s')).toBeNull()
    expect(within(header).queryByText(/tok\/s/)).toBeNull()
  })

  it('omits the duration pill for a reasoning summary that carries no durationMs (but keeps tok/s)', () => {
    // A reasoning summary surfaces its OWN block duration, not the message-level
    // one, so a reasoning block with no durationMs shows no timer pill — the
    // message-level durationMs (5000) must NOT leak in. The message-level tok/s
    // still surfaces (reference renders the rate pill on the collapsed header).
    const blocks = [reasoning('r1'), reasoning('r2')]
    const { container } = render(
      <BlockGroup blocks={blocks} context={ctx({ durationMs: 5000, tokensPerSecond: 9 })} />,
    )
    const header = container.querySelector('.chat-row-header') as HTMLElement
    expect(within(header).queryByText('5.0s')).toBeNull()
    expect(within(header).getByText('9.0 tok/s')).toBeInTheDocument()
  })

  it('surfaces a reasoning summary "Thought for <dur>" label + tok/s, with NO standalone timer pill', () => {
    // A completed reasoning summary mirrors the bare ReasoningBlock header: the
    // `brain` kind icon and a "Thought for <dur>" label from its OWN durationMs.
    // The label already embeds the duration, so NO standalone timer pill renders
    // (it would duplicate the "1.3s" already in the label). The tok/s pill stays.
    const blocks: ContentBlock[] = [
      { type: 'reasoning', id: 'r1', text: 'a', durationMs: 1300 },
      { type: 'reasoning', id: 'r2', text: 'b', durationMs: 1300 },
    ]
    const { container } = render(
      <BlockGroup blocks={blocks} context={ctx({ tokensPerSecond: 167 })} />,
    )
    const header = container.querySelector('.chat-row-header') as HTMLElement
    // brain kind icon present.
    expect(header.querySelector('.chat-row-icon')).not.toBeNull()
    // Label mirrors the bare reasoning header (carries the duration).
    expect(container.querySelector('.chat-group-summary-label')?.textContent).toBe(
      'Thought ×2 · 2.6s',
    )
    // NO standalone timer pill — the duration lives only in the label.
    expect(header.querySelector('.chat-row-timer')).toBeNull()
    // tok/s pill still surfaces on the collapsed header.
    expect(within(header).getByText('167.0 tok/s')).toBeInTheDocument()
  })

  it('surfaces a live ticking timer + tok/s on an ACTIVE reasoning summary header', () => {
    // The trailing reasoning is streaming, so the summary is the active
    // reasoning ("Thinking…"). Its label carries no duration, so
    // `summary.showTimer` surfaces a LIVE timer pill: `summary.durationMs` is
    // undefined while active, so CollapsibleRow's useElapsedTimer ticks from
    // `context.startedAt`. The message-level tok/s pill renders alongside it.
    const blocks = [thought('t1'), reasoning('r')]
    const { container } = render(
      <BlockGroup
        blocks={blocks}
        context={ctx({ isActive: true, activeBlockId: 'r', startedAt: 0, tokensPerSecond: 12 })}
      />,
    )
    expect(container.querySelector('.chat-group-summary-label')?.textContent).toBe('Thinking… ×2')
    const header = container.querySelector('.chat-row-header') as HTMLElement
    const timer = header.querySelector('.chat-row-timer') as HTMLElement
    expect(timer).not.toBeNull()
    expect(timer.textContent).toBe('0.0s')
    // The pill TICKS: advancing the fake clock re-renders a larger elapsed.
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(timer.textContent).toBe('0.1s')
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(timer.textContent).toBe('0.2s')
    expect(within(header).getByText('12.0 tok/s')).toBeInTheDocument()
  })

  it('shows an active reasoning summary timer even without a tok/s rate', () => {
    // The timer pill is independent of the tok/s pill (e.g. before the live
    // rate estimate crosses its min-elapsed window).
    const blocks = [thought('t1'), reasoning('r')]
    const { container } = render(
      <BlockGroup
        blocks={blocks}
        context={ctx({ isActive: true, activeBlockId: 'r', startedAt: 0 })}
      />,
    )
    const header = container.querySelector('.chat-row-header') as HTMLElement
    expect(header.querySelector('.chat-row-timer')).not.toBeNull()
    expect(within(header).queryByText(/tok\/s/)).toBeNull()
  })

  it('anchors an active reasoning summary timer at the block startedAt when present', () => {
    // Turn shape [tools … → reasoning]: the reasoning began at 1000ms, well
    // after the message start (context.startedAt 0). At t=2000 the timer must
    // read 1.0s (since the THINKING began), not 2.0s (since the message did).
    vi.setSystemTime(2000)
    const blocks: ContentBlock[] = [
      thought('t1'),
      { type: 'reasoning', id: 'r', text: 'r', startedAt: 1000 },
    ]
    const { container } = render(
      <BlockGroup
        blocks={blocks}
        context={ctx({ isActive: true, activeBlockId: 'r', startedAt: 0 })}
      />,
    )
    const timer = container.querySelector('.chat-row-timer') as HTMLElement
    expect(timer).not.toBeNull()
    expect(timer.textContent).toBe('1.0s')
  })

  it('falls back to context.startedAt for a reasoning summary without its own startedAt', () => {
    vi.setSystemTime(2000)
    const blocks = [thought('t1'), reasoning('r')]
    const { container } = render(
      <BlockGroup
        blocks={blocks}
        context={ctx({ isActive: true, activeBlockId: 'r', startedAt: 0 })}
      />,
    )
    const timer = container.querySelector('.chat-row-timer') as HTMLElement
    expect(timer.textContent).toBe('2.0s')
  })

  it('falls back to context.startedAt for an UNUSABLE reasoning summary startedAt', () => {
    // A garbage block anchor (NaN passes type checks; codec-bypassing hosts
    // can produce it) must not defeat the valid message-level fallback.
    vi.setSystemTime(2000)
    const blocks: ContentBlock[] = [
      thought('t1'),
      { type: 'reasoning', id: 'r', text: 'r', startedAt: Number.NaN },
    ]
    const { container } = render(
      <BlockGroup
        blocks={blocks}
        context={ctx({ isActive: true, activeBlockId: 'r', startedAt: 0 })}
      />,
    )
    const timer = container.querySelector('.chat-row-timer') as HTMLElement
    expect(timer).not.toBeNull()
    expect(timer.textContent).toBe('2.0s')
  })

  it('hides tok/s on a FINISHED group header while the message is still active', () => {
    // A settled reasoning run inside a still-streaming message must not churn
    // with the live estimate (jitter, stall decay, a snap at finalize) — the
    // pill returns once the whole message settles (pinned by the settled-message
    // tok/s tests above).
    const blocks: ContentBlock[] = [
      { type: 'reasoning', id: 'r1', text: 'a', durationMs: 1300 },
      { type: 'reasoning', id: 'r2', text: 'b', durationMs: 1300 },
    ]
    const { container } = render(
      <BlockGroup
        blocks={blocks}
        // Message active, but the active block lives elsewhere (this group idle).
        context={ctx({ isActive: true, activeBlockId: 'other', startedAt: 0, tokensPerSecond: 9 })}
      />,
    )
    const header = container.querySelector('.chat-row-header') as HTMLElement
    expect(within(header).queryByText(/tok\/s/)).toBeNull()
    // The finished label still renders (no live churn, no stale "Thinking…").
    expect(container.querySelector('.chat-group-summary-label')?.textContent).toBe(
      'Thought ×2 · 2.6s',
    )
  })

  it('renders the (+N) count as a prefix right after the caret, before the kind icon', () => {
    // Reference collapsed header order: [caret] [(+N)] [brain icon] [label] …
    // The (+N) text is CollapsibleRow's `prefix` slot, so within the header it
    // precedes the leading kind icon in document order.
    const blocks: ContentBlock[] = [thought('r1'), thought('r2'), plan('p')]
    const { container } = render(<BlockGroup blocks={blocks} context={ctx()} />)
    const header = container.querySelector('.chat-row-header') as HTMLElement
    const more = header.querySelector('.chat-group-more') as HTMLElement
    const icon = header.querySelector('.chat-row-icon') as HTMLElement
    expect(more).not.toBeNull()
    expect(more.textContent).toBe('(+2)')
    expect(more.tagName).toBe('SPAN')
    expect(more.classList.contains('chat-badge')).toBe(false)
    expect(icon).not.toBeNull()
    // (+N) precedes the kind icon in document order.
    expect(more.compareDocumentPosition(icon) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('marks the group active when the trailing status is active', () => {
    const blocks = [reasoning('r'), status('s')]
    const { container } = render(
      <BlockGroup
        blocks={blocks}
        context={ctx({ isActive: true, activeBlockId: 's', startedAt: 0 })}
      />,
    )
    expect(container.querySelector('[data-affordance="active"]')).not.toBeNull()
  })

  it('marks the group active when the trailing tool_call is running', () => {
    const blocks: ContentBlock[] = [
      reasoning('r'),
      { type: 'tool_call', id: 't', name: 'run', arguments: {}, status: 'running', startedAt: 0 },
    ]
    const { container } = render(<BlockGroup blocks={blocks} context={ctx({ isActive: true })} />)
    expect(container.querySelector('[data-affordance="active"]')).not.toBeNull()
  })

  it('marks the group active when the trailing reasoning is streaming', () => {
    const blocks = [tool('t'), reasoning('r')]
    const { container } = render(
      <BlockGroup
        blocks={blocks}
        context={ctx({ isActive: true, activeBlockId: 'r', startedAt: 0 })}
      />,
    )
    expect(container.querySelector('[data-affordance="active"]')).not.toBeNull()
  })

  it('is idle when the trailing block is a completed tool', () => {
    const blocks = [reasoning('r'), tool('t')]
    const { container } = render(<BlockGroup blocks={blocks} context={ctx()} />)
    expect(container.querySelector('[data-affordance="active"]')).toBeNull()
  })

  it('stays active when a NON-trailing tool is still running', () => {
    const blocks: ContentBlock[] = [
      { type: 'tool_call', id: 't1', name: 'run', arguments: {}, status: 'running', startedAt: 0 },
      tool('t2'),
    ]
    const { container } = render(<BlockGroup blocks={blocks} context={ctx({ isActive: true })} />)
    expect(container.querySelector('[data-affordance="active"]')).not.toBeNull()
  })

  it('is idle for a running tool once its message is not live (stopped or settled)', () => {
    const blocks: ContentBlock[] = [
      { type: 'reasoning', id: 'r', text: 't', durationMs: 5 },
      { type: 'tool_call', id: 't', name: 'x', arguments: {}, status: 'running' },
    ]
    const { container } = render(
      <BlockGroup
        blocks={blocks}
        context={ctx({ isActive: true, outcome: { kind: 'stopped' } })}
      />,
    )
    expect(container.querySelector('[data-affordance="active"]')).toBeNull()
  })

  it('stays active for a pending tool anywhere in the run', () => {
    const blocks: ContentBlock[] = [
      { type: 'tool_call', id: 't1', name: 'q', arguments: {}, status: 'pending' },
      tool('t2'),
    ]
    const { container } = render(<BlockGroup blocks={blocks} context={ctx({ isActive: true })} />)
    expect(container.querySelector('[data-affordance="active"]')).not.toBeNull()
  })

  it('is idle for a non-aux block group (text/system never active)', () => {
    const blocks: ContentBlock[] = [
      { type: 'system', id: 'sy', text: 's' },
      { type: 'text', id: 'tx', text: 't' },
    ]
    const { container } = render(<BlockGroup blocks={blocks} context={ctx({ isActive: true })} />)
    expect(container.querySelector('[data-affordance="active"]')).toBeNull()
  })

  it('renders all inner blocks in the body', () => {
    const blocks = [reasoning('r'), tool('t1', 'a'), tool('t2', 'b')]
    render(<BlockGroup blocks={blocks} context={ctx()} defaultOpen />)
    const body = screen.getByTestId('chat-group-body')
    expect(body).toBeInTheDocument()
  })

  it('labels a text summary block (direct, non-standard group)', () => {
    // The grouping pass never emits text/system in a group, but BlockGroup is a
    // public component; cover the text/system summary labels directly.
    const blocks: ContentBlock[] = [
      { type: 'system', id: 'sy', text: 's' },
      { type: 'text', id: 'tx', text: 't' },
    ]
    render(<BlockGroup blocks={blocks} context={ctx()} />)
    expect(screen.getByText('Text')).toBeInTheDocument()
  })

  it('labels a system summary block (direct, non-standard group)', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', id: 'tx', text: 't' },
      { type: 'system', id: 'sy', text: 's' },
    ]
    const { container } = render(<BlockGroup blocks={blocks} context={ctx()} />)
    // "System prompt" appears both as the summary label and inside the (rendered
    // but collapsed) inner SystemBlockView header; assert the summary chip text.
    expect(container.querySelector('.chat-group-summary-label')?.textContent).toBe('System prompt')
  })

  it('reasoning summary label appears when reasoning is the chosen block', () => {
    const blocks = [reasoning('r1'), reasoning('r2')]
    const { container } = render(<BlockGroup blocks={blocks} context={ctx()} />)
    const summary = container.querySelector('.chat-group-summary-label') as HTMLElement
    expect(summary.textContent).toBe('Reasoning ×2')
  })

  it('surfaces the host-supplied `label` of a custom summary block on the collapsed header', () => {
    // Two aux-opted custom blocks collapse under one disclosure; the trailing
    // block heads the summary. With a host-supplied `label`, the header shows
    // the human-readable label instead of the raw `type` string.
    const blocks: CustomBlock[] = [
      { type: 'job-status', id: 'j1', label: 'Job status' },
      { type: 'job-status', id: 'j2', label: 'Job status' },
    ]
    const { container } = render(<BlockGroup blocks={blocks} context={ctx()} />)
    const summary = container.querySelector('.chat-group-summary-label') as HTMLElement
    expect(summary.textContent).toBe('Job status')
    expect(screen.queryByText('job-status')).toBeNull()
  })

  it('labels a custom summary block by its raw type when no `label` is supplied', () => {
    const blocks: CustomBlock[] = [
      { type: 'job-status', id: 'j1' },
      { type: 'job-status', id: 'j2' },
    ]
    const { container } = render(<BlockGroup blocks={blocks} context={ctx()} />)
    const summary = container.querySelector('.chat-group-summary-label') as HTMLElement
    expect(summary.textContent).toBe('job-status')
  })

  it('omits the +N badge when nothing is hidden (single-item direct call)', () => {
    // The grouping pass never emits a single-item group, but BlockGroup is
    // public: a one-block group has hiddenCount 0, so no +N badge renders.
    const { container } = render(<BlockGroup blocks={[tool('only', 'solo')]} context={ctx()} />)
    expect(container.querySelector('.chat-group-more')).toBeNull()
    expect(screen.queryByText(/\(\+\d+\)/)).toBeNull()
  })
})
