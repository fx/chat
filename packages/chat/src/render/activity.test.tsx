import type { ChatMessage, ToolCallBlock } from '@fx/chat-core'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatProvider } from '../registry'
import { MessageFooter, hasFooterContent } from './MessageFooter'
import { MessageLog } from './MessageLog'
import { ToolCallBlockView } from './blocks'

const tool = (extra: Partial<ToolCallBlock> = {}): ToolCallBlock => ({
  type: 'tool_call',
  id: 't',
  name: 'shell',
  arguments: { command: 'npm test' },
  status: 'success',
  ...extra,
})

const wrap = (node: React.ReactNode) =>
  render(
    <ChatProvider
      classNames={{ toolInput: 'ti', toolApproval: 'ta', outcome: 'oc', footerOutcome: 'fo' }}
    >
      {node}
    </ChatProvider>,
  )

describe('tool rows', () => {
  it('labels by title and shows the input when it adds something', () => {
    const { container, rerender } = wrap(<ToolCallBlockView block={tool({ title: 'Run tests' })} />)
    expect(container.textContent).toContain('Run tests npm test')
    expect(container.querySelector('.chat-tool-input.ti')?.textContent).toBe(' npm test')
    rerender(
      <ChatProvider>
        <ToolCallBlockView block={tool({ title: 'Run npm test' })} />
      </ChatProvider>,
    )
    expect(container.querySelector('.chat-tool-input')).toBeNull()
  })

  it.each([
    ['denied', 'denied'],
    ['unavailable', 'refused'],
    ['pending', 'awaiting approval'],
  ] as const)('shows the %s approval qualifier', (state, text) => {
    const { container } = wrap(
      <ToolCallBlockView block={tool({ status: 'error', approval: { state } })} />,
    )
    const qualifier = container.querySelector('.chat-tool-approval.ta')
    expect(qualifier?.getAttribute('data-approval')).toBe(state)
    expect(qualifier?.textContent).toBe(` · ${text}`)
  })

  it('shows no qualifier for an approved call, and spins by status when standalone', () => {
    const { container } = wrap(
      <ToolCallBlockView block={tool({ status: 'running', approval: { state: 'approved' } })} />,
    )
    expect(container.querySelector('.chat-tool-approval')).toBeNull()
    expect(container.querySelector('[data-affordance="active"]')).not.toBeNull()
  })
})

describe('message outcomes', () => {
  const failed: ChatMessage = {
    id: 'a',
    role: 'assistant',
    blocks: [{ type: 'tool_call', id: 't', name: 'x', arguments: {}, status: 'running' }],
    outcome: { kind: 'error', message: 'HTTP 500: down' },
  }

  it('renders an error outcome row and a Failed footer marker, with no spinner', () => {
    const { container } = wrap(<MessageLog messages={[failed]} />)
    expect(screen.getByRole('alert').textContent).toBe('HTTP 500: down')
    expect(container.querySelector('.chat-outcome.oc')).not.toBeNull()
    expect(container.querySelector('.chat-footer-outcome.fo')?.getAttribute('data-outcome')).toBe(
      'error',
    )
    expect(container.querySelector('[data-affordance="active"]')).toBeNull()
  })

  it('shows a stopped footer on an empty turn, gutter-wrapped when asked', () => {
    const stopped: ChatMessage = {
      id: 's',
      role: 'assistant',
      blocks: [],
      outcome: { kind: 'stopped' },
    }
    const { container } = wrap(<MessageLog messages={[stopped, failed]} timestampGutter />)
    expect(container.querySelector('[data-outcome="stopped"]')?.textContent).toBe('Stopped')
    expect(container.querySelector('.chat-gutter-row .chat-outcome')).not.toBeNull()
  })

  it('omits the outcome row in raw mode', () => {
    const { container } = wrap(<MessageLog messages={[failed]} raw />)
    expect(container.querySelector('.chat-outcome')).toBeNull()
  })

  it('counts an outcome as footer content', () => {
    expect(hasFooterContent({ copyText: '', outcome: { kind: 'stopped' } } as never)).toBe(true)
    const { container } = wrap(<MessageFooter copyText="" outcome={{ kind: 'stopped' }} />)
    expect(container.textContent).toBe('Stopped')
  })
})

describe('attachment labels', () => {
  it('prefers a non-blank description over the name', async () => {
    const { deriveAttachmentLabel } = await import('./MessageAttachments')
    expect(
      deriveAttachmentLabel({
        url: 'u/x.png',
        mediaType: 'image/png',
        kind: 'image',
        name: 'x.png',
        description: 'x · 2 KB',
      }),
    ).toBe('x · 2 KB')
    expect(
      deriveAttachmentLabel({
        url: 'u/x.png',
        mediaType: 'image/png',
        kind: 'image',
        name: 'x.png',
        description: '  ',
      }),
    ).toBe('x.png')
  })
})

describe('activity planning in the DOM', () => {
  const live: ChatMessage = {
    id: 'l',
    role: 'assistant',
    createdAt: 1000,
    blocks: [
      { type: 'tool_call', id: 't1', name: 'a', arguments: {}, status: 'success' },
      { type: 'text', id: 'x', text: 'hi' },
      { type: 'tool_call', id: 't2', name: 'b', arguments: {}, status: 'success' },
      { type: 'tool_call', id: 't3', name: 'c', arguments: {}, status: 'running' },
    ],
  }

  it('shows a live tail with an earlier row, and the live footer when opted in', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(13_400)
    const { container } = wrap(
      <MessageLog
        messages={[live]}
        isStreaming
        streamingMessageId="l"
        liveTail={1}
        liveFooter
        timestampGutter
      />,
    )
    expect(container.querySelector('.chat-earlier')?.getAttribute('data-count')).toBe('2')
    expect(container.querySelector('.chat-earlier')?.textContent).toBe('+2 earlier')
    expect(container.querySelector('[data-live="true"] .chat-footer-elapsed')?.textContent).toBe(
      '12s',
    )
    vi.useRealTimers()
  })

  it('omits the live footer by default and without a start time', () => {
    const { container, rerender } = wrap(
      <MessageLog messages={[live]} isStreaming streamingMessageId="l" />,
    )
    expect(container.querySelector('[data-live]')).toBeNull()
    rerender(
      <ChatProvider>
        <MessageLog
          messages={[{ ...live, createdAt: undefined as never }]}
          isStreaming
          streamingMessageId="l"
          liveFooter
        />
      </ChatProvider>,
    )
    expect(container.querySelector('[data-live]')).toBeNull()
  })

  it('places activity after content and the outcome before it', () => {
    const done: ChatMessage = { ...live, outcome: { kind: 'error', message: 'x' } }
    const { container } = wrap(<MessageLog messages={[done]} activityPlacement="after-content" />)
    const order = [...container.querySelectorAll('.chat-text, .chat-outcome, .chat-group')].map(
      (el) =>
        el.classList.contains('chat-outcome')
          ? 'outcome'
          : el.classList.contains('chat-group')
            ? 'group'
            : 'text',
    )
    expect(order).toEqual(['text', 'outcome', 'group'])
  })

  it('appends the cost to the metrics line', () => {
    const { container } = wrap(
      <MessageFooter copyText="x" metrics={{ model: 'm', cost: { amount: 0.021 } }} />,
    )
    expect(container.textContent).toContain('m · $0.02')
    const costOnly = wrap(<MessageFooter copyText="" metrics={{ cost: { amount: 1 } }} />)
    expect(costOnly.container.textContent).toContain('$1.00')
  })
})

describe('flat mode outcomes', () => {
  it('trails the blocks with the outcome row, gutter-wrapped when asked', () => {
    const failed: ChatMessage = {
      id: 'f',
      role: 'assistant',
      blocks: [{ type: 'text', id: 'x', text: 'partial' }],
      outcome: { kind: 'error', message: 'boom' },
    }
    const plain = wrap(<MessageLog messages={[failed]} flat />)
    expect(plain.container.querySelector('.chat-outcome')?.textContent).toBe('boom')
    const gutter = wrap(<MessageLog messages={[failed]} flat timestampGutter />)
    expect(gutter.container.querySelector('.chat-gutter-row .chat-outcome')).not.toBeNull()
  })
})
