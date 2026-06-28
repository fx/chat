import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '../model'
import { MessageLog } from './MessageLog'
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
    const cells = Array.from(container.querySelectorAll('.chat-gutter-time')) as HTMLElement[]
    expect(cells).toHaveLength(2)
    // Each message's first (and only) row prints its own clock — no cross-message
    // blanking.
    expect(cells[0]?.textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/)
    expect(cells[1]?.textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/)
    expect(cells[1]).not.toHaveAttribute('aria-hidden')
  })
})
