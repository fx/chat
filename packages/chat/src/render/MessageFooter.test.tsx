import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MessageMetrics } from '../model'
import { ChatProvider } from '../registry'
import type { PartialChatComponents } from '../registry'
import { MessageFooter } from './MessageFooter'

describe('MessageFooter affordances', () => {
  it('renders copy when copyText is non-empty (no host callback needed)', () => {
    render(<MessageFooter copyText="hi" />)
    expect(screen.getByLabelText('Copy message')).toBeInTheDocument()
  })

  it('omits copy when copyText is empty; other affordances still render', () => {
    // A tool-call-only assistant turn has an empty copy payload — a Copy button
    // that copies '' is a papercut, so the control is gated on non-empty text.
    const onRegenerate = vi.fn()
    render(<MessageFooter copyText="" onRegenerate={onRegenerate} />)
    expect(screen.queryByLabelText('Copy message')).toBeNull()
    // The footer still renders the callback-driven affordances.
    fireEvent.click(screen.getByLabelText('Regenerate'))
    expect(onRegenerate).toHaveBeenCalledTimes(1)
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
