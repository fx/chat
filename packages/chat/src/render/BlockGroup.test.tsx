import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContentBlock } from '../model'
import { BlockGroup } from './BlockGroup'
import type { BlockRenderContext } from './blocks'
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

describe('BlockGroup', () => {
  it('renders a header summary chip and a +N badge', () => {
    const blocks = [reasoning('r'), tool('t1', 'search'), tool('t2', 'fetch')]
    const { container } = render(<BlockGroup blocks={blocks} context={ctx()} defaultOpen />)
    // Latest header-eligible block (fetch) heads the summary chip.
    const summary = container.querySelector('.chat-group-summary-label') as HTMLElement
    expect(summary.textContent).toBe('fetch')
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('surfaces an ACTIVE trailing status row as the summary (no +N when 1 hidden)', () => {
    const blocks = [tool('t1'), status('s')]
    render(
      <BlockGroup
        blocks={blocks}
        context={ctx({ isActive: true, activeBlockId: 's', startedAt: 0 })}
      />,
    )
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('+1')).toBeInTheDocument()
  })

  it('surfaces the tool summary (not "Status") for a COMPLETED status-ending run', () => {
    const blocks = [tool('t1', 'search'), status('s')]
    const { container } = render(<BlockGroup blocks={blocks} context={ctx()} />)
    const summary = container.querySelector('.chat-group-summary-label') as HTMLElement
    expect(summary.textContent).toBe('search')
  })

  it('surfaces live timer + tokens/sec on a grouped active status header', () => {
    const blocks = [tool('t1'), status('s')]
    const { container } = render(
      <BlockGroup
        blocks={blocks}
        context={ctx({ isActive: true, activeBlockId: 's', startedAt: 0, tokensPerSecond: 8 })}
      />,
    )
    const header = container.querySelector('.chat-row-header') as HTMLElement
    expect(within(header).getByText('<1s')).toBeInTheDocument()
    expect(within(header).getByText('8.0 tok/s')).toBeInTheDocument()
  })

  it('prefers a finalized durationMs on an active status summary header', () => {
    // An active status summary with a provided finalized durationMs surfaces
    // that duration (durationMs wins over the live ticker in the substrate).
    const blocks = [tool('t1'), status('s')]
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

  it('does not show a timer when the summary is not a status block', () => {
    const blocks = [reasoning('r1'), reasoning('r2')]
    const { container } = render(
      <BlockGroup blocks={blocks} context={ctx({ durationMs: 5000, tokensPerSecond: 9 })} />,
    )
    const header = container.querySelector('.chat-row-header') as HTMLElement
    expect(within(header).queryByText('5.0s')).toBeNull()
    expect(within(header).queryByText(/tok\/s/)).toBeNull()
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
    const { container } = render(<BlockGroup blocks={blocks} context={ctx()} />)
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
    const { container } = render(<BlockGroup blocks={blocks} context={ctx()} />)
    expect(container.querySelector('[data-affordance="active"]')).not.toBeNull()
  })

  it('stays active for a pending tool anywhere in the run', () => {
    const blocks: ContentBlock[] = [
      { type: 'tool_call', id: 't1', name: 'q', arguments: {}, status: 'pending' },
      tool('t2'),
    ]
    const { container } = render(<BlockGroup blocks={blocks} context={ctx()} />)
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
    render(<BlockGroup blocks={blocks} context={ctx()} />)
    expect(screen.getByText('System')).toBeInTheDocument()
  })

  it('reasoning summary label appears when reasoning is the chosen block', () => {
    const blocks = [reasoning('r1'), reasoning('r2')]
    const { container } = render(<BlockGroup blocks={blocks} context={ctx()} />)
    const summary = container.querySelector('.chat-group-summary-label') as HTMLElement
    expect(summary.textContent).toBe('Reasoning')
  })

  it('omits the +N badge when nothing is hidden (single-item direct call)', () => {
    // The grouping pass never emits a single-item group, but BlockGroup is
    // public: a one-block group has hiddenCount 0, so no +N badge renders.
    render(<BlockGroup blocks={[tool('only', 'solo')]} context={ctx()} />)
    expect(screen.queryByText(/^\+/)).toBeNull()
  })
})
