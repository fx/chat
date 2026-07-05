import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '../model'
import { MessageLog } from './MessageLog'
import type { ChatExtensions } from './extensions'
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

const messages: ChatMessage[] = [
  { id: 'u1', role: 'user', blocks: [{ type: 'text', id: 't', text: 'hi @bot' }] },
  { id: 'a1', role: 'assistant', blocks: [{ type: 'status', id: 's' }], createdAt: 0 },
]

describe('MessageLog', () => {
  it('renders one data-message-id wrapper per message (anchor contract)', () => {
    const { container } = render(<MessageLog messages={messages} />)
    expect(container.querySelectorAll('[data-message-id]')).toHaveLength(2)
    expect(container.querySelector('[data-message-id="u1"]')).not.toBeNull()
    expect(container.querySelector('[data-message-id="a1"]')).not.toBeNull()
  })

  it('marks the streaming message active', () => {
    render(<MessageLog messages={messages} isStreaming streamingMessageId="a1" />)
    expect(screen.getByText('Generating…')).toBeInTheDocument()
  })

  it('does not mark a message active when not streaming', () => {
    render(<MessageLog messages={messages} streamingMessageId="a1" />)
    expect(screen.getByText('Generated')).toBeInTheDocument()
  })

  it('shows a pending "Starting…" row for an empty streaming assistant message', () => {
    // The host's optimistic placeholder: an assistant message with ZERO blocks
    // whose id is the streaming one. Before the first token it must render the
    // synthetic pre-stream status row; once the run terminalizes
    // (isStreaming=false) the settled-empty message renders nothing again.
    const withPlaceholder: ChatMessage[] = [
      messages[0] as ChatMessage,
      { id: 'a2', role: 'assistant', blocks: [], createdAt: 0 },
    ]
    const { rerender } = render(
      <MessageLog messages={withPlaceholder} isStreaming streamingMessageId="a2" />,
    )
    expect(screen.getByText('Starting…')).toBeInTheDocument()
    rerender(<MessageLog messages={withPlaceholder} isStreaming={false} streamingMessageId="a2" />)
    expect(screen.queryByText('Starting…')).toBeNull()
  })

  it('passes per-message affordance callbacks scoped to the message id', () => {
    const onRegenerate = vi.fn()
    const onFork = vi.fn()
    const onReset = vi.fn()
    render(
      <MessageLog
        messages={[messages[1] as ChatMessage]}
        onRegenerate={onRegenerate}
        onFork={onFork}
        onReset={onReset}
      />,
    )
    fireEvent.click(screen.getByLabelText('Regenerate'))
    fireEvent.click(screen.getByLabelText('Fork'))
    fireEvent.click(screen.getByLabelText('Reset'))
    expect(onRegenerate).toHaveBeenCalledWith('a1')
    expect(onFork).toHaveBeenCalledWith('a1')
    expect(onReset).toHaveBeenCalledWith('a1')
  })

  it('honors flat, raw, defaultOpen, showFooter, and compactFooter passthroughs', () => {
    const { container } = render(
      <MessageLog
        messages={[messages[0] as ChatMessage]}
        flat
        raw
        defaultOpen
        showFooter={false}
        compactFooter
      />,
    )
    // raw mode → JSON view, no footer.
    expect(container.querySelector('.chat-jsonview')).not.toBeNull()
  })

  it('uses a host-provided renderList slot when given', () => {
    const renderList = vi.fn((children) => <section data-testid="virt">{children}</section>)
    render(<MessageLog messages={messages} renderList={renderList} />)
    expect(screen.getByTestId('virt')).toBeInTheDocument()
    expect(renderList).toHaveBeenCalledTimes(1)
  })

  it('renders the list directly with no renderList', () => {
    const { container } = render(<MessageLog messages={messages} />)
    expect(container.querySelector('.chat-log')).not.toBeNull()
  })

  it('threads minimal to each message and marks the log data-minimal', () => {
    const { container } = render(<MessageLog messages={messages} minimal defaultOpen />)
    expect(container.querySelector('.chat-log')).toHaveAttribute('data-minimal', 'true')
    // Every message wrapper carries data-minimal too (threaded to MessageItem).
    const wrappers = container.querySelectorAll('[data-message-id]')
    expect(wrappers).toHaveLength(2)
    for (const w of wrappers) {
      expect(w).toHaveAttribute('data-minimal', 'true')
    }
  })

  it('omits data-minimal when minimal is absent', () => {
    const { container } = render(<MessageLog messages={messages} />)
    expect(container.querySelector('.chat-log')).not.toHaveAttribute('data-minimal')
    expect(container.querySelector('[data-minimal]')).toBeNull()
  })

  it('drops the log data-minimal hook when flat overrides minimal', () => {
    const { container } = render(<MessageLog messages={messages} minimal flat />)
    expect(container.querySelector('.chat-log')).not.toHaveAttribute('data-minimal')
    expect(container.querySelector('[data-minimal]')).toBeNull()
  })

  it('drops the log data-minimal hook when raw overrides minimal', () => {
    const { container } = render(<MessageLog messages={messages} minimal raw />)
    expect(container.querySelector('.chat-log')).not.toHaveAttribute('data-minimal')
    expect(container.querySelector('[data-minimal]')).toBeNull()
  })

  it('renders no timestamp gutter by default', () => {
    const { container } = render(<MessageLog messages={messages} />)
    expect(container.querySelector('.chat-gutter-row')).toBeNull()
    expect(container.querySelector('[data-timestamp-gutter]')).toBeNull()
  })

  it('threads timestampGutter to each message and wraps rows in gutter rows', () => {
    const { container } = render(<MessageLog messages={messages} timestampGutter />)
    // Every message wrapper advertises the gutter hook.
    const wrappers = container.querySelectorAll('[data-message-id]')
    for (const w of wrappers) {
      expect(w).toHaveAttribute('data-timestamp-gutter', 'true')
    }
    // Rows are wrapped in the two-column gutter layout.
    expect(container.querySelector('.chat-gutter-row')).not.toBeNull()
    expect(container.querySelector('.chat-gutter-time')).not.toBeNull()
    expect(container.querySelector('.chat-gutter-content')).not.toBeNull()
  })

  it('renders the footer ONLY on the completed assistant message while another streams', () => {
    // Change 0014: the actively-streaming message (id === streamingMessageId with
    // isStreaming) must render NO footer; the completed one keeps it.
    const twoAssistants: ChatMessage[] = [
      {
        id: 'done',
        role: 'assistant',
        blocks: [{ type: 'text', id: 't1', text: 'finished answer' }],
      },
      {
        id: 'live',
        role: 'assistant',
        blocks: [{ type: 'status', id: 's' }],
        createdAt: 0,
      },
    ]
    const { container } = render(
      <MessageLog messages={twoAssistants} isStreaming streamingMessageId="live" />,
    )
    const footers = container.querySelectorAll('.chat-footer')
    expect(footers).toHaveLength(1)
    // The single footer lives inside the COMPLETED message's wrapper.
    const done = container.querySelector('[data-message-id="done"]') as HTMLElement
    expect(done.contains(footers[0] as Node)).toBe(true)
    const live = container.querySelector('[data-message-id="live"]') as HTMLElement
    expect(live.querySelector('.chat-footer')).toBeNull()
  })

  it('does NOT de-dupe across messages: each message prints its own first-row clock', () => {
    // Both messages share createdAt 0 (faked system time). De-dupe is PER-MESSAGE
    // (each MessageItem owns its own per-render deduper for render purity), so
    // there is no cross-message suppression — BOTH first rows print the clock.
    const sameSecond: ChatMessage[] = [
      {
        id: 'm1',
        role: 'assistant',
        blocks: [{ type: 'text', id: 't1', text: 'a' }],
        createdAt: 0,
      },
      {
        id: 'm2',
        role: 'assistant',
        blocks: [{ type: 'text', id: 't2', text: 'b' }],
        createdAt: 0,
      },
    ]
    const { container } = render(<MessageLog messages={sameSecond} timestampGutter />)
    // Scope to the block rows; each message also gutter-wraps its footer with a
    // forced-blank clock cell, which is not part of this per-message-clock check.
    const cells = Array.from(
      container.querySelectorAll('.chat-message-blocks .chat-gutter-time'),
    ) as HTMLElement[]
    expect(cells).toHaveLength(2)
    // Each message's first (and only) row prints its own clock — no cross-message
    // blanking.
    expect(cells[0]?.textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/)
    expect(cells[1]?.textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/)
    expect(cells[1]).not.toHaveAttribute('aria-hidden')
  })
})

describe('MessageLog timeline-item gutter', () => {
  const itemMessages: ChatMessage[] = [
    { id: 'u1', role: 'user', blocks: [{ type: 'text', id: 't', text: 'hi' }], createdAt: 0 },
  ]

  it('gutter-wraps a standalone timeline item with a clock derived from its `at`', () => {
    // A fixed local time so the derived clock is deterministic regardless of TZ.
    const at = new Date(2024, 0, 2, 9, 5, 7).getTime()
    const extensions: ChatExtensions = {
      timelineItems: [{ id: 'ti', at, render: () => <span>marker</span> }],
    }
    const { container } = render(
      <MessageLog messages={itemMessages} extensions={extensions} timestampGutter />,
    )
    const anchor = container.querySelector('[data-timeline-item-id="ti"]') as HTMLElement
    expect(anchor).not.toBeNull()
    // The item is wrapped in the SAME two-column gutter row as message rows.
    const row = anchor.closest('.chat-gutter-row') as HTMLElement
    expect(row).not.toBeNull()
    const time = row.querySelector('[data-testid="chat-gutter-time"]') as HTMLElement
    expect(time.textContent).toBe('09:05:07')
    expect(time).not.toHaveAttribute('aria-hidden')
    // The content cell holds the rendered item.
    expect(within(row).getByText('marker')).toBeInTheDocument()
  })

  it('renders a timeline item BARE (no gutter row) when timestampGutter is off', () => {
    const extensions: ChatExtensions = {
      timelineItems: [{ id: 'ti', at: 100, render: () => <span>marker</span> }],
    }
    const { container } = render(<MessageLog messages={itemMessages} extensions={extensions} />)
    const anchor = container.querySelector('[data-timeline-item-id="ti"]') as HTMLElement
    expect(anchor).not.toBeNull()
    expect(anchor.closest('.chat-gutter-row')).toBeNull()
    expect(container.querySelector('.chat-gutter-row')).toBeNull()
    expect(container.querySelector('[data-testid="chat-gutter-time"]')).toBeNull()
  })

  it('renders a blank, aria-hidden clock cell for a timeline item with a non-finite `at`', () => {
    const extensions: ChatExtensions = {
      timelineItems: [{ id: 'ti', at: Number.NaN, render: () => <span>marker</span> }],
    }
    const { container } = render(
      <MessageLog messages={itemMessages} extensions={extensions} timestampGutter />,
    )
    const anchor = container.querySelector('[data-timeline-item-id="ti"]') as HTMLElement
    // The item still renders, wrapped in a gutter row with a blank (width-reserved) cell.
    expect(within(anchor).getByText('marker')).toBeInTheDocument()
    const row = anchor.closest('.chat-gutter-row') as HTMLElement
    const time = row.querySelector('[data-testid="chat-gutter-time"]') as HTMLElement
    expect(time.textContent).toBe('')
    expect(time).toHaveAttribute('aria-hidden')
  })

  it('shows its own clock on both a message row and a timeline item (no cross-entry dedupe)', () => {
    // Message and item resolve to the same second; each entry prints its own clock
    // (mirroring MessageItem's per-message rule — there is no cross-entry dedupe).
    const at = new Date(2024, 0, 2, 9, 5, 7).getTime()
    const messages: ChatMessage[] = [
      { id: 'a', role: 'assistant', blocks: [{ type: 'text', id: 't', text: 'x' }], createdAt: at },
    ]
    const extensions: ChatExtensions = {
      timelineItems: [{ id: 'ti', at: at + 1, render: () => <span>marker</span> }],
    }
    const { container } = render(
      <MessageLog messages={messages} extensions={extensions} timestampGutter />,
    )
    const messageCell = container.querySelector(
      '.chat-message-blocks [data-testid="chat-gutter-time"]',
    ) as HTMLElement
    const itemCell = container
      .querySelector('[data-timeline-item-id="ti"]')
      ?.closest('.chat-gutter-row')
      ?.querySelector('[data-testid="chat-gutter-time"]') as HTMLElement
    // Both print '09:05:07' — the message from its createdAt, the item from its `at`
    // (a+1ms, same second) — with no suppression between the two entries.
    expect(messageCell.textContent).toBe('09:05:07')
    expect(itemCell.textContent).toBe('09:05:07')
    expect(itemCell).not.toHaveAttribute('aria-hidden')
  })
})
