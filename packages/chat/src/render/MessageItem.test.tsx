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

  it('renders the attachment region for a user message with attachments', () => {
    const msg = message({
      role: 'user',
      blocks: [{ type: 'text', id: 't', text: 'see this' }],
      attachments: [{ url: 'https://x/a.png', mediaType: 'image/png', kind: 'image', name: 'a' }],
    })
    render(<MessageItem message={msg} />)
    expect(screen.getByTestId('message-attachments')).toBeInTheDocument()
    expect(screen.getByAltText('a')).toBeInTheDocument()
  })

  it('does not render attachments for a non-user message even if present', () => {
    const msg = message({
      role: 'assistant',
      attachments: [{ url: 'https://x/a.png', mediaType: 'image/png', kind: 'image' }],
    })
    render(<MessageItem message={msg} />)
    expect(screen.queryByTestId('message-attachments')).toBeNull()
  })

  it('does not render attachments in raw mode', () => {
    const msg = message({
      role: 'user',
      attachments: [{ url: 'https://x/a.png', mediaType: 'image/png', kind: 'image' }],
    })
    render(<MessageItem message={msg} raw />)
    expect(screen.queryByTestId('message-attachments')).toBeNull()
  })

  it('renders identically to today for a user message with no attachments', () => {
    const msg = message({ role: 'user', blocks: [{ type: 'text', id: 't', text: 'hi' }] })
    render(<MessageItem message={msg} />)
    expect(screen.queryByTestId('message-attachments')).toBeNull()
  })

  it('treats an empty attachments array as no attachments', () => {
    const msg = message({ role: 'user', attachments: [] })
    render(<MessageItem message={msg} />)
    expect(screen.queryByTestId('message-attachments')).toBeNull()
  })

  it('minimal mode: assistant turn folds all aux into one group + bare answer, compact footer', () => {
    // Change 0011: collapseTurnAux folds ALL aux blocks into ONE group (even
    // non-adjacent), forces data-minimal + a compact footer.
    const msg = message({
      blocks: [
        { type: 'reasoning', id: 'r', text: 'think' },
        { type: 'tool_call', id: 't1', name: 'search', arguments: {}, status: 'success' },
        { type: 'status', id: 's' },
        { type: 'text', id: 'a', text: 'final answer' },
      ],
    })
    const { container } = render(<MessageItem message={msg} minimal defaultOpen />)
    const wrapper = container.querySelector('[data-message-id="m1"]') as HTMLElement
    expect(wrapper).toHaveAttribute('data-minimal', 'true')
    // Exactly one collapsed group for the turn's metadata.
    expect(container.querySelectorAll('.chat-group')).toHaveLength(1)
    // The answer renders bare.
    expect(screen.getByText('final answer')).toBeInTheDocument()
    // The footer is forced compact (reveal toggle present).
    expect(container.querySelector('.chat-footer')).toHaveAttribute('data-compact', 'true')
    expect(screen.getByLabelText('Show actions')).toBeInTheDocument()
  })

  it('minimal mode folds NON-ADJACENT aux into one group (unlike grouped mode)', () => {
    const msg = message({
      blocks: [
        { type: 'reasoning', id: 'r', text: 'think' },
        { type: 'text', id: 'mid', text: 'interim' },
        { type: 'tool_call', id: 't', name: 'search', arguments: {}, status: 'success' },
      ],
    })
    const { container } = render(<MessageItem message={msg} minimal defaultOpen />)
    // One group holds BOTH aux blocks despite the text between them.
    expect(container.querySelectorAll('.chat-group')).toHaveLength(1)
    expect(screen.getByText('+1')).toBeInTheDocument()
    expect(screen.getByText('interim')).toBeInTheDocument()
  })

  it('minimal mode: user message gets compact chrome but no aux-collapse', () => {
    const msg = message({
      id: 'mu',
      role: 'user',
      blocks: [{ type: 'text', id: 't', text: 'hello' }],
    })
    const { container } = render(<MessageItem message={msg} minimal />)
    expect(container.querySelector('[data-message-id="mu"]')).toHaveAttribute(
      'data-minimal',
      'true',
    )
    expect(screen.getByText('hello')).toBeInTheDocument()
    expect(container.querySelector('.chat-footer')).toHaveAttribute('data-compact', 'true')
  })

  it('minimal false renders identically to grouped mode (no data-minimal)', () => {
    const blocks: ChatMessage['blocks'] = [
      { type: 'reasoning', id: 'r', text: 'think' },
      { type: 'tool_call', id: 't1', name: 'search', arguments: {}, status: 'success' },
      { type: 'status', id: 's' },
      { type: 'text', id: 'a', text: 'final answer' },
    ]
    const grouped = render(<MessageItem message={message({ blocks })} defaultOpen />)
    const groupedHtml = (grouped.container.querySelector('.chat-message-blocks') as HTMLElement)
      .innerHTML
    grouped.unmount()
    const explicit = render(
      <MessageItem message={message({ blocks })} minimal={false} defaultOpen />,
    )
    expect(explicit.container.querySelector('[data-minimal]')).toBeNull()
    expect(
      (explicit.container.querySelector('.chat-message-blocks') as HTMLElement).innerHTML,
    ).toBe(groupedHtml)
  })

  it('flat wins over minimal (blocks render flat, not folded)', () => {
    const msg = message({
      blocks: [
        { type: 'reasoning', id: 'r', text: 'think' },
        { type: 'tool_call', id: 't1', name: 'search', arguments: {}, status: 'success' },
      ],
    })
    const { container } = render(<MessageItem message={msg} minimal flat />)
    // Flat: no grouping, so no collapsed group and the tool name shows directly.
    expect(container.querySelector('.chat-group')).toBeNull()
    expect(screen.getByText('search')).toBeInTheDocument()
    // data-minimal still reflects the prop, but grouping is flat.
    expect(container.querySelector('[data-minimal="true"]')).not.toBeNull()
  })

  it('raw wins over minimal (renders JSON, not folded blocks)', () => {
    const msg = message({
      blocks: [{ type: 'reasoning', id: 'r', text: 'think' }],
    })
    const { container } = render(<MessageItem message={msg} minimal raw />)
    expect(container.querySelector('.chat-jsonview')).not.toBeNull()
    expect(container.querySelector('.chat-group')).toBeNull()
  })

  it('minimal mode renders a trailing custom non-aux block bare after the group', () => {
    const msg = message({
      blocks: [
        { type: 'reasoning', id: 'r', text: 'think' },
        // A host custom block (non-aux by default) trailing the turn.
        { type: 'host_card', id: 'hc' } as unknown as ChatMessage['blocks'][number],
        { type: 'text', id: 'a', text: 'answer' },
      ],
    })
    const { container } = render(<MessageItem message={msg} minimal defaultOpen />)
    // The reasoning folds to one group; the custom + answer render bare after it.
    expect(container.querySelectorAll('.chat-group')).toHaveLength(1)
    expect(screen.getByText('answer')).toBeInTheDocument()
  })

  it('exposes data-role on the message wrapper for role-bubble styling', () => {
    // Change 0009: role-bubble CSS keys off `[data-role="user"|"assistant"]`, so
    // the wrapper must always carry the role attribute for both roles.
    const { container: userC } = render(
      <MessageItem message={message({ id: 'mu', role: 'user' })} />,
    )
    expect(userC.querySelector('[data-message-id="mu"]')).toHaveAttribute('data-role', 'user')
    const { container: asstC } = render(
      <MessageItem message={message({ id: 'ma', role: 'assistant' })} />,
    )
    expect(asstC.querySelector('[data-message-id="ma"]')).toHaveAttribute('data-role', 'assistant')
  })
})
