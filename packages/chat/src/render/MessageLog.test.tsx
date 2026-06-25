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
})
