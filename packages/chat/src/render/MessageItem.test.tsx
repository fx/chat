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

  it('renders the footer for an assistant message', () => {
    const { container } = render(<MessageItem message={message({ role: 'assistant' })} />)
    expect(container.querySelector('.chat-footer')).not.toBeNull()
    expect(screen.getByLabelText('Copy message')).toBeInTheDocument()
  })

  it('renders NO footer for a user message (footer is assistant-only)', () => {
    // The footer affordances (regenerate/fork/reset) are inherently assistant
    // actions; the reference chat shows no footer on user messages. The whole
    // footer block — including its gutter-row wrapper — must be gated off so no
    // empty footer gutter-row is left behind.
    const { container } = render(
      <MessageItem
        message={message({
          id: 'mu',
          role: 'user',
          blocks: [{ type: 'text', id: 't', text: 'hi' }],
        })}
        timestampGutter
      />,
    )
    expect(container.querySelector('.chat-footer')).toBeNull()
    expect(screen.queryByLabelText('Copy message')).toBeNull()
    // No empty footer gutter-row left behind: the only gutter rows are the block
    // row(s), not an extra trailing footer row.
    const blocksRegion = container.querySelector('.chat-message-blocks') as HTMLElement
    const allRows = container.querySelectorAll('.chat-gutter-row')
    const blockRows = blocksRegion.querySelectorAll('.chat-gutter-row')
    expect(allRows.length).toBe(blockRows.length)
  })

  it('renders NO footer for a system message (footer is assistant-only)', () => {
    const { container } = render(
      <MessageItem
        message={message({
          id: 'ms',
          role: 'system',
          blocks: [{ type: 'text', id: 't', text: 'sys' }],
        })}
      />,
    )
    expect(container.querySelector('.chat-footer')).toBeNull()
    expect(screen.queryByLabelText('Copy message')).toBeNull()
  })

  it('renders NO footer for an assistant message with zero blocks', () => {
    // An empty assistant message (e.g. a just-created streaming placeholder) has
    // nothing to copy/regenerate yet — the footer must not render.
    const { container } = render(<MessageItem message={message({ blocks: [] })} />)
    expect(container.querySelector('.chat-footer')).toBeNull()
    expect(screen.queryByLabelText('Copy message')).toBeNull()
  })

  it('renders NO footer for a tool-call-only assistant turn with no callbacks or metrics', () => {
    // The turn has settled with blocks, but none of them is a text block, so
    // the copy payload is empty — and with no action callbacks or metrics the
    // footer has NOTHING to show, so no footer chrome renders at all.
    const msg = message({
      blocks: [{ type: 'tool_call', id: 't1', name: 'search', arguments: {}, status: 'success' }],
    })
    const { container } = render(<MessageItem message={msg} />)
    expect(container.querySelector('.chat-footer')).toBeNull()
    expect(screen.queryByLabelText('Copy message')).toBeNull()
  })

  it('renders NO footer gutter row for a tool-call-only turn with timestampGutter', () => {
    // Same zero-affordance turn as above, with the timestamp gutter ON: the
    // footer branch (including its `wrapRow` gutter wrapper) is gated on
    // `hasFooterContent`, so no empty `.chat-gutter-row` with a blank clock
    // cell trails the block rows.
    const msg = message({
      blocks: [{ type: 'tool_call', id: 't1', name: 'search', arguments: {}, status: 'success' }],
    })
    const { container } = render(<MessageItem message={msg} timestampGutter />)
    expect(container.querySelector('.chat-footer')).toBeNull()
    // The only gutter rows are the block row(s) — no trailing footer row.
    const blocksRegion = container.querySelector('.chat-message-blocks') as HTMLElement
    const allRows = container.querySelectorAll('.chat-gutter-row')
    const blockRows = blocksRegion.querySelectorAll('.chat-gutter-row')
    expect(blockRows.length).toBe(1)
    expect(allRows.length).toBe(blockRows.length)
  })

  it('renders the footer WITHOUT a Copy button for a tool-call-only turn with onRegenerate', () => {
    // With an action callback the footer renders (there is an affordance to
    // show), but the empty copy payload still omits the Copy control.
    const msg = message({
      blocks: [{ type: 'tool_call', id: 't1', name: 'search', arguments: {}, status: 'success' }],
    })
    const { container } = render(<MessageItem message={msg} onRegenerate={() => {}} />)
    expect(container.querySelector('.chat-footer')).not.toBeNull()
    expect(screen.getByLabelText('Regenerate')).toBeInTheDocument()
    expect(screen.queryByLabelText('Copy message')).toBeNull()
  })

  it('renders NO footer while the message is actively streaming (isActive)', () => {
    const { container } = render(<MessageItem message={message()} isActive />)
    expect(container.querySelector('.chat-footer')).toBeNull()
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
    // The four metadata blocks collapse: a (+3) badge counts the hidden ones.
    expect(screen.getByText('(+3)')).toBeInTheDocument()
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
    // Single reasoning renders bare (no (+N) badge).
    expect(screen.queryByText(/\(\+\d+\)/)).toBeNull()
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
    expect(screen.queryByText(/\(\+\d+\)/)).toBeNull()
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
    const { container } = render(<MessageItem message={message()} compactFooter />)
    expect(container.querySelector('.chat-footer')).toHaveAttribute('data-compact', 'true')
  })

  it('compact footer shows the reveal kebab when there is something to reveal', () => {
    // An action callback makes the kebab worthwhile, so it renders in compact mode.
    render(<MessageItem message={message()} compactFooter onRegenerate={vi.fn()} />)
    expect(screen.getByLabelText('Show actions')).toBeInTheDocument()
  })

  it('compact footer omits the reveal kebab when there is nothing to reveal', () => {
    // No action callbacks and no metrics → toggling reveals nothing, so the kebab
    // is omitted (copy still renders, needing no callback).
    render(<MessageItem message={message()} compactFooter />)
    expect(screen.queryByLabelText('Show actions')).toBeNull()
    expect(screen.getByLabelText('Copy message')).toBeInTheDocument()
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
    // The footer is forced compact. With no action callbacks or metrics there is
    // nothing to reveal, so the kebab toggle is correctly omitted.
    expect(container.querySelector('.chat-footer')).toHaveAttribute('data-compact', 'true')
    expect(screen.queryByLabelText('Show actions')).toBeNull()
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
    expect(screen.getByText('(+1)')).toBeInTheDocument()
    expect(screen.getByText('interim')).toBeInTheDocument()
  })

  it('minimal mode: user message gets minimal chrome but no aux-collapse and no footer', () => {
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
    // The footer is assistant-only — a user message renders NO footer, even in
    // minimal mode (the footer affordances are inherently assistant actions).
    expect(container.querySelector('.chat-footer')).toBeNull()
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
    // onRegenerate keeps the footer rendered (a tool-call-only turn with zero
    // affordances renders no footer at all) so the compact check stays meaningful.
    const { container } = render(<MessageItem message={msg} minimal flat onRegenerate={() => {}} />)
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

  it('renders the answer text inside a .chat-text bubble block', () => {
    // Realigned layout: the bubble is scoped to the answer TEXT block, so the
    // answer prose renders inside a `.chat-text` element on the message.
    const { container } = render(
      <MessageItem message={message({ blocks: [{ type: 'text', id: 't', text: 'answer' }] })} />,
    )
    const text = container.querySelector('.chat-text')
    expect(text).not.toBeNull()
    expect(text?.textContent).toContain('answer')
  })

  it('renders auxiliary blocks bare (NOT inside a .chat-text bubble)', () => {
    // The bubble must wrap ONLY the answer text — reasoning/tool/status rows stay
    // outside `.chat-text` so they render bare.
    const { container } = render(
      <MessageItem
        message={message({
          blocks: [{ type: 'reasoning', id: 'r', text: 'thinking' }],
        })}
        flat
      />,
    )
    expect(container.querySelector('.chat-text')).toBeNull()
    expect(container.querySelector('.chat-row')).not.toBeNull()
  })

  it('renders no timestamp gutter by default (plain column, no gutter rows)', () => {
    const { container } = render(<MessageItem message={message({ createdAt: 0 })} />)
    expect(container.querySelector('.chat-gutter-row')).toBeNull()
    expect(container.querySelector('.chat-gutter-time')).toBeNull()
    // The prior per-message timestamp chrome is gone.
    expect(screen.queryByTestId('chat-message-time')).toBeNull()
  })

  it('wraps each row in a gutter row with a clock cell when timestampGutter is set', () => {
    // A non-finite createdAt would blank the cell; use a valid local time.
    const createdAt = new Date(2024, 0, 2, 9, 5, 7).getTime()
    const { container } = render(<MessageItem message={message({ createdAt })} timestampGutter />)
    const row = container.querySelector('.chat-gutter-row')
    expect(row).not.toBeNull()
    const time = row?.querySelector('.chat-gutter-time') as HTMLElement
    expect(time).not.toBeNull()
    expect(time.textContent).toBe('09:05:07')
    // The content cell carries the rendered block.
    const content = row?.querySelector('.chat-gutter-content') as HTMLElement
    expect(content).not.toBeNull()
    expect(within(content).getByText('answer')).toBeInTheDocument()
    // The wrapper advertises the gutter via a data hook.
    expect(container.querySelector('[data-message-id="m1"]')).toHaveAttribute(
      'data-timestamp-gutter',
      'true',
    )
  })

  it('blanks consecutive same-second rows and reserves the gutter width', () => {
    // Two bare rows on the same message both fall back to the SAME createdAt, so
    // the first prints the clock and the second blanks (de-dupe within a message
    // via the message's own per-render deduper).
    const createdAt = new Date(2024, 0, 2, 9, 5, 7).getTime()
    const msg = message({
      createdAt,
      blocks: [
        { type: 'reasoning', id: 'r', text: 'think', durationMs: 1000 },
        { type: 'text', id: 'a', text: 'answer' },
      ],
    })
    const { container } = render(<MessageItem message={msg} timestampGutter />)
    // Scope to the block rows; the footer is gutter-wrapped too but with a
    // forced-blank clock cell, which is asserted separately below.
    const blocksRegion = container.querySelector('.chat-message-blocks') as HTMLElement
    const cells = Array.from(blocksRegion.querySelectorAll('.chat-gutter-time')) as HTMLElement[]
    expect(cells).toHaveLength(2)
    // First row of the same-second run shows the clock.
    expect(cells[0]?.textContent).toBe('09:05:07')
    // The next identical-second row blanks (width still reserved via CSS).
    expect(cells[1]?.textContent).toBe('')
    // The blank cell is aria-hidden so screen readers skip it.
    expect(cells[1]).toHaveAttribute('aria-hidden', 'true')
    expect(cells[0]).not.toHaveAttribute('aria-hidden')
  })

  it('blanks the clock cell for a missing/invalid message timestamp', () => {
    // No createdAt and no block timestamp → the cell is blank but width-reserved.
    const { container } = render(<MessageItem message={message()} timestampGutter />)
    const time = container.querySelector('.chat-gutter-time') as HTMLElement
    expect(time).not.toBeNull()
    expect(time.textContent).toBe('')
    expect(time).toHaveAttribute('aria-hidden', 'true')
  })

  it('prefers a block-level startedAt over the message createdAt for a row clock', () => {
    // The aux row's tool_call carries its own startedAt; the bare text row falls
    // back to createdAt. The two distinct seconds both print (no de-dupe).
    const createdAt = new Date(2024, 0, 2, 9, 5, 7).getTime()
    const toolStartedAt = new Date(2024, 0, 2, 9, 5, 9).getTime()
    const msg = message({
      createdAt,
      blocks: [
        {
          type: 'tool_call',
          id: 't',
          name: 'search',
          arguments: {},
          status: 'success',
          startedAt: toolStartedAt,
        },
        { type: 'text', id: 'a', text: 'answer' },
      ],
    })
    const { container } = render(<MessageItem message={msg} timestampGutter />)
    const blocksRegion = container.querySelector('.chat-message-blocks') as HTMLElement
    const cells = Array.from(blocksRegion.querySelectorAll('.chat-gutter-time')) as HTMLElement[]
    expect(cells).toHaveLength(2)
    // The tool row uses its own startedAt (09:05:09), not createdAt (09:05:07).
    expect(cells[0]?.textContent).toBe('09:05:09')
    // The text row falls back to createdAt.
    expect(cells[1]?.textContent).toBe('09:05:07')
  })

  it('wraps flat-mode blocks in gutter rows when timestampGutter is set', () => {
    const createdAt = new Date(2024, 0, 2, 9, 5, 7).getTime()
    const msg = message({
      createdAt,
      blocks: [
        { type: 'reasoning', id: 'r', text: 'think' },
        { type: 'tool_call', id: 't', name: 'search', arguments: {}, status: 'success' },
      ],
    })
    const { container } = render(<MessageItem message={msg} flat timestampGutter />)
    // Flat: one gutter row per block (no grouping). Scope to the block region so
    // the gutter-wrapped footer row is not counted.
    const blocksRegion = container.querySelector('.chat-message-blocks') as HTMLElement
    const rows = blocksRegion.querySelectorAll('.chat-gutter-row')
    expect(rows).toHaveLength(2)
    // The tool name renders inside a gutter content cell (flat → no group).
    expect(container.querySelector('.chat-group')).toBeNull()
    expect(screen.getByText('search')).toBeInTheDocument()
  })

  it('uses the group first block startedAt for a grouped row clock', () => {
    // A collapsed group of two tool calls: the row clock comes from the FIRST
    // block's startedAt, not the message createdAt.
    const createdAt = new Date(2024, 0, 2, 9, 5, 7).getTime()
    const firstStartedAt = new Date(2024, 0, 2, 9, 5, 12).getTime()
    const msg = message({
      createdAt,
      blocks: [
        {
          type: 'tool_call',
          id: 't1',
          name: 'search',
          arguments: {},
          status: 'success',
          startedAt: firstStartedAt,
        },
        { type: 'tool_call', id: 't2', name: 'fetch', arguments: {}, status: 'success' },
      ],
    })
    const { container } = render(<MessageItem message={msg} timestampGutter defaultOpen />)
    // The two tool calls collapse into one group → one gutter row.
    expect(container.querySelectorAll('.chat-group')).toHaveLength(1)
    const blocksRegion = container.querySelector('.chat-message-blocks') as HTMLElement
    const cells = Array.from(blocksRegion.querySelectorAll('.chat-gutter-time')) as HTMLElement[]
    expect(cells).toHaveLength(1)
    // Row clock = first block startedAt (09:05:12), not createdAt (09:05:07).
    expect(cells[0]?.textContent).toBe('09:05:12')
  })

  it('gutter-wraps the footer with a BLANK clock cell so it aligns with content', () => {
    const createdAt = new Date(2024, 0, 2, 9, 5, 7).getTime()
    const { container } = render(<MessageItem message={message({ createdAt })} timestampGutter />)
    const footer = container.querySelector('.chat-footer') as HTMLElement
    expect(footer).not.toBeNull()
    // The footer sits inside a gutter row's content cell (aligned with content).
    const footerRow = footer.closest('.chat-gutter-row') as HTMLElement
    expect(footerRow).not.toBeNull()
    expect(footerRow.querySelector('.chat-gutter-content')?.contains(footer)).toBe(true)
    // Its clock cell is forced blank (and aria-hidden) — the footer is not a
    // timestamped event, it only needs to align with the content column.
    const time = footerRow.querySelector('.chat-gutter-time') as HTMLElement
    expect(time.textContent).toBe('')
    expect(time).toHaveAttribute('aria-hidden', 'true')
  })

  it('gutter-wraps user attachments with a BLANK clock cell', () => {
    const createdAt = new Date(2024, 0, 2, 9, 5, 7).getTime()
    const msg = message({
      id: 'u1',
      role: 'user',
      createdAt,
      blocks: [{ type: 'text', id: 't', text: 'hi' }],
      attachments: [
        { kind: 'file', mediaType: 'application/pdf', name: 'doc.pdf', url: 'https://x/doc.pdf' },
      ],
    })
    const { container } = render(<MessageItem message={msg} timestampGutter />)
    const attachments = container.querySelector('.chat-attachments') as HTMLElement
    expect(attachments).not.toBeNull()
    const row = attachments.closest('.chat-gutter-row') as HTMLElement
    expect(row).not.toBeNull()
    const time = row.querySelector('.chat-gutter-time') as HTMLElement
    expect(time.textContent).toBe('')
    expect(time).toHaveAttribute('aria-hidden', 'true')
  })

  it('does NOT gutter-wrap the footer when timestampGutter is off', () => {
    const { container } = render(<MessageItem message={message()} />)
    const footer = container.querySelector('.chat-footer') as HTMLElement
    expect(footer).not.toBeNull()
    expect(footer.closest('.chat-gutter-row')).toBeNull()
  })

  it('de-dupes PER-MESSAGE: two same-second messages each print their own first-row clock', () => {
    // Each MessageItem owns its OWN per-render deduper (no shared cross-component
    // mutable state), so two messages at the same second do NOT suppress one
    // another — BOTH first rows print the clock.
    const createdAt = new Date(2024, 0, 2, 9, 5, 7).getTime()
    const { container } = render(
      <>
        <MessageItem message={message({ id: 'm1', createdAt })} timestampGutter />
        <MessageItem message={message({ id: 'm2', createdAt })} timestampGutter />
      </>,
    )
    const cells = Array.from(
      container.querySelectorAll('.chat-message-blocks .chat-gutter-time'),
    ) as HTMLElement[]
    expect(cells).toHaveLength(2)
    // No cross-message de-dupe: each message's first row prints.
    expect(cells[0]?.textContent).toBe('09:05:07')
    expect(cells[1]?.textContent).toBe('09:05:07')
    expect(cells[1]).not.toHaveAttribute('aria-hidden')
  })

  it('is render-pure: re-rendering yields the SAME committed clock cells (StrictMode-safe)', () => {
    // A shared mutable deduper desynced under React's multi-invoke render
    // (StrictMode/concurrent), blanking every committed cell. With a fresh
    // per-render deduper, re-rendering the same message must reproduce identical
    // output: the first same-second row shows the clock, the next blanks.
    const createdAt = new Date(2024, 0, 2, 9, 5, 7).getTime()
    const msg = message({
      createdAt,
      blocks: [
        { type: 'reasoning', id: 'r', text: 'think', durationMs: 1000 },
        { type: 'text', id: 'a', text: 'answer' },
      ],
    })
    const { container, rerender } = render(<MessageItem message={msg} timestampGutter />)
    const read = () =>
      (
        Array.from(
          (container.querySelector('.chat-message-blocks') as HTMLElement).querySelectorAll(
            '.chat-gutter-time',
          ),
        ) as HTMLElement[]
      ).map((c) => c.textContent)
    expect(read()).toEqual(['09:05:07', ''])
    // Re-render (simulates a subsequent render invocation) — output is identical.
    rerender(<MessageItem message={msg} timestampGutter />)
    expect(read()).toEqual(['09:05:07', ''])
  })
})
