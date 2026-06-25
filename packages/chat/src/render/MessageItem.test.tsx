import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '../model'
import { MessageItem, messageCopyText } from './MessageItem'
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

const message = (overrides?: Partial<ChatMessage>): ChatMessage => ({
  id: 'm1',
  role: 'assistant',
  blocks: [{ type: 'text', id: 't', text: 'answer' }],
  ...overrides,
})

describe('messageCopyText', () => {
  it('concatenates text-block prose, skipping non-text blocks', () => {
    const msg = message({
      blocks: [
        { type: 'text', id: 'a', text: 'one' },
        { type: 'reasoning', id: 'r', text: 'ignored' },
        { type: 'text', id: 'b', text: 'two' },
      ],
    })
    expect(messageCopyText(msg)).toBe('one\n\ntwo')
  })
})

describe('MessageItem', () => {
  it('wraps the message with a data-message-id anchor', () => {
    const { container } = render(<MessageItem message={message({ id: 'abc' })} />)
    expect(container.querySelector('[data-message-id="abc"]')).not.toBeNull()
  })

  it('renders the footer by default', () => {
    render(<MessageItem message={message()} />)
    expect(screen.getByLabelText('Copy message')).toBeInTheDocument()
  })

  it('hides the footer when showFooter is false', () => {
    render(<MessageItem message={message()} showFooter={false} />)
    expect(screen.queryByLabelText('Copy message')).toBeNull()
  })

  it('groups consecutive aux blocks and renders the answer bare', () => {
    const msg = message({
      blocks: [
        { type: 'reasoning', id: 'r', text: 'think' },
        { type: 'tool_call', id: 't1', name: 'search', arguments: {}, status: 'success' },
        { type: 'tool_call', id: 't2', name: 'fetch', arguments: {}, status: 'success' },
        { type: 'status', id: 's' },
        { type: 'text', id: 'a', text: 'final answer' },
      ],
    })
    render(<MessageItem message={msg} defaultOpen />)
    // The four metadata blocks collapse: a +3 badge counts the hidden ones.
    expect(screen.getByText('+3')).toBeInTheDocument()
    // The answer renders bare.
    expect(screen.getByText('final answer')).toBeInTheDocument()
  })

  it('groups without an explicit defaultOpen passthrough', () => {
    const msg = message({
      blocks: [
        { type: 'reasoning', id: 'r', text: 'think' },
        { type: 'tool_call', id: 't1', name: 'search', arguments: {}, status: 'success' },
      ],
    })
    const { container } = render(<MessageItem message={msg} />)
    // A two-item aux run still collapses into a group disclosure.
    expect(container.querySelector('.chat-group')).not.toBeNull()
  })

  it('renders bare blocks when a single aux block stands alone', () => {
    const msg = message({
      blocks: [
        { type: 'reasoning', id: 'r', text: 'think', durationMs: 1000 },
        { type: 'text', id: 'a', text: 'answer' },
      ],
    })
    render(<MessageItem message={msg} />)
    // Single reasoning renders bare (no +N badge).
    expect(screen.queryByText(/^\+/)).toBeNull()
    expect(screen.getByText('Thought for 1.0s')).toBeInTheDocument()
  })

  it('renders flat when flat is set (no grouping)', () => {
    const msg = message({
      blocks: [
        { type: 'reasoning', id: 'r', text: 'think' },
        { type: 'tool_call', id: 't1', name: 'search', arguments: {}, status: 'success' },
      ],
    })
    render(<MessageItem message={msg} flat />)
    expect(screen.queryByText(/^\+/)).toBeNull()
    expect(screen.getByText('search')).toBeInTheDocument()
  })

  it('renders the whole message as JSON in raw mode (and hides the footer)', () => {
    const { container } = render(<MessageItem message={message()} raw />)
    expect(container.querySelector('.chat-jsonview')).not.toBeNull()
    expect(screen.queryByLabelText('Copy message')).toBeNull()
  })

  it('threads metrics and active state through to live status', () => {
    const msg = message({
      blocks: [{ type: 'status', id: 's' }],
      createdAt: 0,
      metrics: { tokensPerSecond: 7 },
    })
    const { container } = render(<MessageItem message={msg} isActive />)
    const blocks = container.querySelector('.chat-message-blocks') as HTMLElement
    expect(within(blocks).getByText('Generating…')).toBeInTheDocument()
    expect(within(blocks).getByText('7.0 tok/s')).toBeInTheDocument()
  })

  it('wires footer affordance callbacks', () => {
    const onRegenerate = vi.fn()
    render(<MessageItem message={message()} onRegenerate={onRegenerate} />)
    expect(screen.getByLabelText('Regenerate')).toBeInTheDocument()
  })

  it('supports compact footer mode', () => {
    render(<MessageItem message={message()} compactFooter />)
    expect(screen.getByLabelText('Show actions')).toBeInTheDocument()
  })

  it('only the trailing block streams in an active message (earlier reasoning idle)', () => {
    const msg = message({
      blocks: [
        // A completed durationless reasoning earlier in the turn.
        { type: 'reasoning', id: 'r', text: 'older thought' },
        // The trailing status is the actively-streaming block.
        { type: 'status', id: 's' },
      ],
      createdAt: 0,
    })
    render(<MessageItem message={msg} isActive flat defaultOpen />)
    // The earlier reasoning is NOT "Thinking…" — it reads as completed.
    expect(screen.getByText('Reasoning')).toBeInTheDocument()
    expect(screen.queryByText('Thinking…')).toBeNull()
    // The trailing status IS active.
    expect(screen.getByText('Generating…')).toBeInTheDocument()
  })

  it('derives tokens/sec from usage metrics when no provider rate is given', () => {
    const msg = message({
      blocks: [{ type: 'status', id: 's' }],
      createdAt: 0,
      metrics: { usage: { completion: 20 }, durationMs: 2000 },
    })
    const { container } = render(<MessageItem message={msg} isActive />)
    const blocks = container.querySelector('.chat-message-blocks') as HTMLElement
    // 20 completion tokens over 2s = 10 tok/s.
    expect(within(blocks).getByText('10.0 tok/s')).toBeInTheDocument()
  })

  it('threads finalized durationMs through to a completed status row', () => {
    const msg = message({
      blocks: [{ type: 'status', id: 's' }],
      metrics: { durationMs: 2000 },
    })
    const { container } = render(<MessageItem message={msg} />)
    const blocks = container.querySelector('.chat-message-blocks') as HTMLElement
    expect(within(blocks).getByText('2.0s')).toBeInTheDocument()
  })
})
