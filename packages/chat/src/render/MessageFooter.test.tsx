import type { MessageMetrics } from '@fx-/chat-core'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatProvider } from '../registry'
import type { MessageDetailsProps, PartialChatComponents } from '../registry'
import { MessageFooter, hasFooterContent, messageDetails } from './MessageFooter'

const none = {
  copyText: '',
  onRegenerate: undefined,
  onFork: undefined,
  onReset: undefined,
  metrics: undefined,
}

describe('hasFooterContent', () => {
  it('is false with no copy text, no callbacks, and no metrics', () => {
    expect(hasFooterContent(none)).toBe(false)
  })

  it('is false for whitespace-only copy text and an empty metrics object', () => {
    expect(hasFooterContent({ ...none, copyText: '\n \t', metrics: {} })).toBe(false)
  })

  it('is true for non-whitespace copy text alone', () => {
    expect(hasFooterContent({ ...none, copyText: 'hi' })).toBe(true)
  })

  it('is true for a lone regenerate callback', () => {
    expect(hasFooterContent({ ...none, onRegenerate: () => {} })).toBe(true)
  })

  it('is true for a lone fork callback', () => {
    expect(hasFooterContent({ ...none, onFork: () => {} })).toBe(true)
  })

  it('is true for a lone reset callback', () => {
    expect(hasFooterContent({ ...none, onReset: () => {} })).toBe(true)
  })

  it('is true for renderable metrics alone', () => {
    expect(hasFooterContent({ ...none, metrics: { durationMs: 1000 } })).toBe(true)
  })
})

describe('MessageFooter affordances', () => {
  it('renders copy when copyText is non-empty (no host callback needed)', () => {
    render(<MessageFooter copyText="hi" />)
    expect(screen.getByLabelText('Copy message')).toBeInTheDocument()
  })

  it('omits copy when copyText is empty; other affordances still render', () => {
    // A tool-call-only assistant turn has an empty copy payload — a Copy button
    // that copies '' is a papercut, so the control is gated on non-empty text.
    render(<MessageFooter copyText="" onRegenerate={vi.fn()} />)
    expect(screen.queryByLabelText('Copy message')).toBeNull()
    // The footer still renders the callback-driven affordances.
    expect(screen.getByLabelText('Regenerate')).toBeInTheDocument()
  })

  it('omits copy when copyText is whitespace-only', () => {
    // Whitespace-only payloads are as uncopyable as empty ones.
    render(<MessageFooter copyText={'\n\n'} onRegenerate={vi.fn()} />)
    expect(screen.queryByLabelText('Copy message')).toBeNull()
    expect(screen.getByLabelText('Regenerate')).toBeInTheDocument()
  })

  it('renders NOTHING when there is no copy text, no callbacks, and no metrics', () => {
    // Zero affordances and zero metrics → no footer chrome at all.
    const { container } = render(<MessageFooter copyText="" metrics={{}} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the footer for a lone fork callback with no copy text', () => {
    render(<MessageFooter copyText="" onFork={vi.fn()} />)
    expect(screen.getByLabelText('Fork')).toBeInTheDocument()
    expect(screen.queryByLabelText('Copy message')).toBeNull()
  })

  it('renders the footer for a lone reset callback with no copy text', () => {
    render(<MessageFooter copyText="" onReset={vi.fn()} />)
    expect(screen.getByLabelText('Reset')).toBeInTheDocument()
    expect(screen.queryByLabelText('Copy message')).toBeNull()
  })

  it('renders the footer for metrics alone with no copy text or callbacks', () => {
    render(<MessageFooter copyText="" metrics={{ durationMs: 1000 }} />)
    expect(screen.getByTestId('chat-footer-metrics').textContent).toBe('1.0s')
    expect(screen.queryByLabelText('Copy message')).toBeNull()
  })

  it('renders regenerate only when onRegenerate is provided', () => {
    const onRegenerate = vi.fn()
    render(<MessageFooter copyText="x" onRegenerate={onRegenerate} />)
    const btn = screen.getByLabelText('Regenerate')
    fireEvent.click(btn)
    expect(onRegenerate).toHaveBeenCalledTimes(1)
    expect(screen.queryByLabelText('Fork')).toBeNull()
    expect(screen.queryByLabelText('Reset')).toBeNull()
  })

  it('renders fork and reset when their callbacks are provided', () => {
    const onFork = vi.fn()
    const onReset = vi.fn()
    render(<MessageFooter copyText="x" onFork={onFork} onReset={onReset} />)
    fireEvent.click(screen.getByLabelText('Fork'))
    fireEvent.click(screen.getByLabelText('Reset'))
    expect(onFork).toHaveBeenCalledTimes(1)
    expect(onReset).toHaveBeenCalledTimes(1)
    expect(screen.queryByLabelText('Regenerate')).toBeNull()
  })
})

describe('MessageFooter compact mode', () => {
  it('shows icon-only action buttons ALWAYS; reveals labels + metrics on toggle', () => {
    const metrics: MessageMetrics = { model: 'gpt-x', durationMs: 1500, tokensPerSecond: 9.9 }
    render(<MessageFooter copyText="x" compact onRegenerate={vi.fn()} metrics={metrics} />)
    // Action buttons are ALWAYS visible (icon-only) next to the kebab.
    expect(screen.getByLabelText('Copy message')).toBeInTheDocument()
    expect(screen.getByLabelText('Regenerate')).toBeInTheDocument()
    // But their text labels and the metrics line are hidden until revealed.
    expect(screen.queryByText('Regenerate', { selector: '.chat-footer-label' })).toBeNull()
    expect(screen.queryByTestId('chat-footer-metrics')).toBeNull()
    // Reveal → labels + metrics appear; buttons stay.
    fireEvent.click(screen.getByLabelText('Show actions'))
    expect(screen.getByText('Regenerate', { selector: '.chat-footer-label' })).toBeInTheDocument()
    expect(screen.getByTestId('chat-footer-metrics')).toBeInTheDocument()
    expect(screen.getByLabelText('Copy message')).toBeInTheDocument()
    // Toggle again hides labels + metrics again; buttons stay.
    fireEvent.click(screen.getByLabelText('Hide actions'))
    expect(screen.queryByText('Regenerate', { selector: '.chat-footer-label' })).toBeNull()
    expect(screen.queryByTestId('chat-footer-metrics')).toBeNull()
    expect(screen.getByLabelText('Copy message')).toBeInTheDocument()
  })

  it('shows action labels inline (no toggle) in the default non-compact layout', () => {
    render(<MessageFooter copyText="x" onRegenerate={vi.fn()} />)
    expect(screen.getByText('Regenerate', { selector: '.chat-footer-label' })).toBeInTheDocument()
  })

  it('uses the dotsThree (kebab) icon for the reveal toggle', () => {
    // The reveal toggle must reference the `dotsThree` semantic icon so a host
    // registry can map it to its own kebab/"more" icon.
    const stub: PartialChatComponents = {
      icons: {
        dotsThree: () => <span data-testid="kebab-icon">⋯</span>,
      },
    }
    render(
      <ChatProvider components={stub}>
        <MessageFooter copyText="x" compact onRegenerate={vi.fn()} />
      </ChatProvider>,
    )
    const toggle = screen.getByLabelText('Show actions')
    expect(within(toggle).getByTestId('kebab-icon')).toBeInTheDocument()
  })

  it('does not render the reveal toggle when not compact', () => {
    render(<MessageFooter copyText="x" onRegenerate={vi.fn()} />)
    expect(screen.queryByLabelText('Show actions')).toBeNull()
    expect(screen.queryByLabelText('Hide actions')).toBeNull()
  })

  it('renders the kebab in compact mode when there is something to reveal', () => {
    // An action callback alone is enough to make the kebab worthwhile.
    render(<MessageFooter copyText="x" compact onFork={vi.fn()} />)
    expect(screen.getByLabelText('Show actions')).toBeInTheDocument()
  })

  it('renders the kebab in compact mode when only metrics are present', () => {
    const metrics: MessageMetrics = { durationMs: 1000 }
    render(<MessageFooter copyText="x" compact metrics={metrics} />)
    expect(screen.getByLabelText('Show actions')).toBeInTheDocument()
  })

  it('omits the kebab in compact mode when there is nothing to reveal', () => {
    // No action callbacks and no metrics → toggling would reveal nothing, so the
    // kebab is not rendered (copy remains, since it needs no callback).
    render(<MessageFooter copyText="x" compact />)
    expect(screen.queryByLabelText('Show actions')).toBeNull()
    expect(screen.queryByLabelText('Hide actions')).toBeNull()
    expect(screen.getByLabelText('Copy message')).toBeInTheDocument()
  })

  it('omits the kebab in compact mode for an empty metrics object', () => {
    // An empty metrics object renders no metrics line, so it is NOT revealable —
    // the kebab must not appear (it would open nothing).
    render(<MessageFooter copyText="x" compact metrics={{}} />)
    expect(screen.queryByLabelText('Show actions')).toBeNull()
    expect(screen.queryByTestId('chat-footer-metrics')).toBeNull()
  })

  it('omits the kebab in compact mode for metrics with all-undefined fields', () => {
    const metrics: MessageMetrics = { tokensPerSecond: 0 }
    render(<MessageFooter copyText="x" compact metrics={metrics} />)
    expect(screen.queryByLabelText('Show actions')).toBeNull()
    expect(screen.queryByTestId('chat-footer-metrics')).toBeNull()
  })
})

describe('MessageFooter with a MessageDetails presenter', () => {
  function withPresenter(ui: React.ReactElement) {
    const seen: MessageDetailsProps[] = []
    const MessageDetails = (props: MessageDetailsProps) => {
      seen.push(props)
      return props.open ? (
        <div data-testid="details">
          {props.actions.map((a) => (
            <button key={a.id} type="button" onClick={a.onSelect}>
              <a.icon />
              {a.label}
            </button>
          ))}
          <button type="button" onClick={() => props.onOpenChange(false)}>
            close
          </button>
        </div>
      ) : null
    }
    render(<ChatProvider components={{ MessageDetails }}>{ui}</ChatProvider>)
    return seen
  }

  it('opens the presenter from the compact kebab instead of revealing inline', () => {
    const metrics: MessageMetrics = { model: 'gpt-x', durationMs: 1500 }
    const onRegenerate = vi.fn()
    const onFork = vi.fn()
    const onReset = vi.fn()
    const seen = withPresenter(
      <MessageFooter
        copyText="hello"
        compact
        metrics={metrics}
        outcome={{ kind: 'stopped' }}
        onRegenerate={onRegenerate}
        onFork={onFork}
        onReset={onReset}
      />,
    )
    expect(screen.queryByTestId('details')).toBeNull()
    fireEvent.click(screen.getByLabelText('Message details'))
    expect(screen.getByTestId('details')).toBeInTheDocument()
    // Nothing is revealed inline.
    expect(screen.queryByTestId('chat-footer-metrics')).toBeNull()
    expect(screen.queryByText('Regenerate', { selector: '.chat-footer-label' })).toBeNull()
    const last = seen.at(-1) as MessageDetailsProps
    expect(last).toMatchObject({
      open: true,
      details: [
        { key: 'model', label: 'Model', value: 'gpt-x' },
        { key: 'duration', label: 'Duration', value: '1.5s' },
      ],
      outcome: { kind: 'stopped' },
      copyText: 'hello',
    })
    expect(last.actions.map((a) => [a.id, a.label])).toEqual([
      ['regenerate', 'Regenerate'],
      ['fork', 'Fork'],
      ['reset', 'Reset'],
    ])
    fireEvent.click(within(screen.getByTestId('details')).getByText('Fork'))
    expect(onFork).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByText('close'))
    expect(screen.queryByTestId('details')).toBeNull()
  })

  it('passes an error outcome with its message', () => {
    const seen = withPresenter(
      <MessageFooter
        copyText="x"
        compact
        onRegenerate={vi.fn()}
        outcome={{ kind: 'error', message: 'boom', retryable: true }}
      />,
    )
    expect(seen.at(-1)?.outcome).toEqual({ kind: 'error', message: 'boom' })
  })

  it('opens for metrics alone, with no actions', () => {
    const seen = withPresenter(<MessageFooter copyText="x" compact metrics={{ model: 'm' }} />)
    expect(seen.at(-1)?.actions).toEqual([])
    expect(seen.at(-1)?.details).toEqual([{ key: 'model', label: 'Model', value: 'm' }])
  })

  it('passes no copy text when there is nothing to copy', () => {
    const seen = withPresenter(<MessageFooter copyText="  " compact onRegenerate={vi.fn()} />)
    expect(seen.at(-1)?.copyText).toBe('')
    expect(seen.at(-1)?.actions.map((a) => a.id)).toEqual(['regenerate'])
  })

  it('is not used outside compact mode, nor without anything to reveal', () => {
    const seen = withPresenter(<MessageFooter copyText="x" onRegenerate={vi.fn()} />)
    expect(seen).toHaveLength(0)
    expect(screen.getByText('Regenerate', { selector: '.chat-footer-label' })).toBeInTheDocument()
    const none = withPresenter(<MessageFooter copyText="x" compact />)
    expect(none).toHaveLength(0)
  })
})

describe('messageDetails', () => {
  it('labels and formats every present metric, in order', () => {
    expect(
      messageDetails({
        model: 'm',
        durationMs: 61_000,
        tokensPerSecond: 12.34,
        usage: { prompt: 1200, completion: 340, total: 1540 },
        cost: { amount: 0.0123 },
        context: { used: 5400, size: 200_000 },
      }),
    ).toEqual([
      { key: 'model', label: 'Model', value: 'm' },
      { key: 'duration', label: 'Duration', value: expect.any(String) },
      { key: 'rate', label: 'Speed', value: '12.3 tok/s' },
      { key: 'tokens', label: 'Tokens', value: '1.2k in · 340 out' },
      { key: 'cost', label: 'Cost', value: '$0.01' },
      { key: 'context', label: 'Context', value: '5.4k of 200k' },
    ])
  })

  it('falls back to the total, omits absent fields, and handles no metrics', () => {
    expect(messageDetails(undefined)).toEqual([])
    expect(messageDetails({ usage: { total: 99 }, context: { used: 10 } })).toEqual([
      { key: 'tokens', label: 'Tokens', value: '99' },
      { key: 'context', label: 'Context', value: '10' },
    ])
    expect(messageDetails({ usage: { completion: 5 } })).toEqual([
      { key: 'tokens', label: 'Tokens', value: '5 out' },
    ])
    expect(messageDetails({ usage: {} })).toEqual([])
  })
})

describe('MessageFooter metrics', () => {
  it('renders model, duration, and tokens/sec when present', () => {
    const metrics: MessageMetrics = { model: 'gpt-x', durationMs: 1500, tokensPerSecond: 9.9 }
    render(<MessageFooter copyText="x" metrics={metrics} />)
    expect(screen.getByTestId('chat-footer-metrics').textContent).toBe('gpt-x · 1.5s · 9.9 tok/s')
  })

  it('renders only the present metric fields', () => {
    const metrics: MessageMetrics = { durationMs: 1000 }
    render(<MessageFooter copyText="x" metrics={metrics} />)
    expect(screen.getByTestId('chat-footer-metrics').textContent).toBe('1.0s')
  })

  it('renders no metrics line when metrics is absent', () => {
    render(<MessageFooter copyText="x" />)
    expect(screen.queryByTestId('chat-footer-metrics')).toBeNull()
  })

  it('renders no metrics line when metrics has no presentable fields', () => {
    render(<MessageFooter copyText="x" metrics={{ tokensPerSecond: 0 }} />)
    expect(screen.queryByTestId('chat-footer-metrics')).toBeNull()
  })
})
