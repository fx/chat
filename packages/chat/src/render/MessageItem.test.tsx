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
      blocks: [
        // An aux-eligible block (reasoning) on a USER turn: minimal aux-collapse
        // is gated on `message.role === 'assistant'`, so this must NOT fold into a
        // group — proving the role gate (a text-only turn would pass either way).
        { type: 'reasoning', id: 'r', text: 'think' },
        { type: 'text', id: 't', text: 'hello' },
      ],
    })
    const { container } = render(<MessageItem message={msg} minimal defaultOpen />)
    expect(container.querySelector('[data-message-id="mu"]')).toHaveAttribute(
      'data-minimal',
      'true',
    )
    expect(screen.getByText('hello')).toBeInTheDocument()
    // Role gate: the aux block stays bare, never collapsed into a group.
    expect(container.querySelector('.chat-group')).toBeNull()
    // Compact chrome still applies regardless of role.
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

  it('flat FULLY overrides minimal (flat blocks, no data-minimal, no forced compact)', () => {
    // Change 0011 (parity fix): flat must win over minimal COMPLETELY — no minimal
    // grouping, no `data-minimal` attribute, and no minimal-forced compact footer.
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
    // minimal is fully overridden: NO data-minimal anywhere.
    expect(container.querySelector('[data-minimal]')).toBeNull()
    // …and the footer is NOT forced compact (no compactFooter prop was passed).
    expect(container.querySelector('.chat-footer')).not.toHaveAttribute('data-compact', 'true')
  })

  it('flat over minimal still honors an explicit compactFooter prop', () => {
    // The `compactFooter` prop is independent of minimal, so it must still apply
    // even when flat overrides minimal (covers the compactFooter branch of the
    // effectiveCompactFooter ternary while minimalActive is false).
    const msg = message({ blocks: [{ type: 'text', id: 'a', text: 'answer' }] })
    const { container } = render(<MessageItem message={msg} minimal flat compactFooter />)
    expect(container.querySelector('[data-minimal]')).toBeNull()
    expect(container.querySelector('.chat-footer')).toHaveAttribute('data-compact', 'true')
  })

  it('raw FULLY overrides minimal (renders JSON, no data-minimal)', () => {
    const msg = message({
      blocks: [{ type: 'reasoning', id: 'r', text: 'think' }],
    })
    const { container } = render(<MessageItem message={msg} minimal raw />)
    expect(container.querySelector('.chat-jsonview')).not.toBeNull()
    expect(container.querySelector('.chat-group')).toBeNull()
    // minimal is fully overridden in raw mode: NO data-minimal anywhere.
    expect(container.querySelector('[data-minimal]')).toBeNull()
  })

  it('flat and raw skip grouping entirely (timeline-behavior lookup never runs)', () => {
    // Fix 1: grouping (collapseTurnAux/groupBlocks) — and therefore the
    // timelineBehavior override lookup it performs — must not run on the flat or
    // raw render paths, which render their own way. A `timelineBehavior` override
    // is consulted via `overrides[name]`, so a throwing getter keyed by the tool
    // name fires iff grouping runs. A spy lets us also assert how often.
    const behaviorSpy = vi.fn(() => {
      throw new Error('grouping ran: timeline-behavior must not be consulted in flat/raw')
    })
    // Define the override via a getter so any grouping read throws.
    const timelineBehavior = {} as Record<string, never>
    Object.defineProperty(timelineBehavior, 'search', { enumerable: true, get: behaviorSpy })
    const msg = message({
      blocks: [
        { type: 'reasoning', id: 'r', text: 'think' },
        { type: 'tool_call', id: 't1', name: 'search', arguments: {}, status: 'success' },
      ],
    })

    // flat: renders without throwing → grouping (and the override lookup) skipped.
    const flatRender = render(<MessageItem message={msg} flat extensions={{ timelineBehavior }} />)
    expect(behaviorSpy).not.toHaveBeenCalled()
    flatRender.unmount()

    // raw: same — JSON view, no grouping.
    const rawRender = render(<MessageItem message={msg} raw extensions={{ timelineBehavior }} />)
    expect(behaviorSpy).not.toHaveBeenCalled()
    rawRender.unmount()

    // Sanity: the grouped path DOES consult the override (so the assertion above
    // is meaningful — the lookup is reachable, it is just skipped in flat/raw).
    expect(() => render(<MessageItem message={msg} extensions={{ timelineBehavior }} />)).toThrow(
      'grouping ran',
    )
    expect(behaviorSpy).toHaveBeenCalled()
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
    // Register a stub renderer for the custom kind so its output is observable in
    // the DOM (otherwise it falls through to the inert placeholder).
    const HostCard = () => <div className="host-card-stub">host card</div>
    const { container } = render(
      <MessageItem
        message={msg}
        minimal
        defaultOpen
        extensions={{ blockRenderers: { host_card: HostCard } }}
      />,
    )
    // The reasoning folds to one group; the custom + answer render bare after it.
    expect(container.querySelectorAll('.chat-group')).toHaveLength(1)
    expect(screen.getByText('answer')).toBeInTheDocument()
    // The custom block renders BARE (not inside the collapsed group) and AFTER it.
    const group = container.querySelector('.chat-group') as HTMLElement
    const card = container.querySelector('.host-card-stub') as HTMLElement
    expect(card).not.toBeNull()
    // Bare: the custom block is not nested within the group.
    expect(group.contains(card)).toBe(false)
    // DOM order: the group precedes the bare custom block.
    expect(group.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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
