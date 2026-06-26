import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatProvider } from '../registry'
import { CollapsibleRow } from './CollapsibleRow'
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

function row(extra: Parameters<typeof CollapsibleRow>[0]) {
  return render(<CollapsibleRow {...extra} />)
}

describe('CollapsibleRow auto-hide', () => {
  it('renders nothing when no active/flash/timer/body and not alwaysShow', () => {
    const { container } = row({ label: 'x' })
    expect(container.firstChild).toBeNull()
  })

  it('renders when alwaysShow even without content', () => {
    row({ label: 'Always', alwaysShow: true })
    expect(screen.getByText('Always')).toBeInTheDocument()
  })

  it('renders when it has a body', () => {
    row({ label: 'B', children: <span>body</span> })
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('renders when active', () => {
    row({ label: 'A', isActive: true })
    expect(screen.getByText('A')).toBeInTheDocument()
  })
})

describe('CollapsibleRow affordance precedence', () => {
  it('shows the spinner while active', () => {
    row({ label: 'A', isActive: true })
    expect(screen.getByText('A').closest('.chat-row-header')).toHaveAttribute(
      'data-affordance',
      'active',
    )
  })

  it('flashes a success check on active → inactive', () => {
    const { rerender } = row({ label: 'A', isActive: true, alwaysShow: true })
    rerender(<CollapsibleRow label="A" isActive={false} alwaysShow />)
    expect(screen.getByText('A').closest('.chat-row-header')).toHaveAttribute(
      'data-affordance',
      'success',
    )
    act(() => {
      vi.advanceTimersByTime(1200)
    })
    // After the flash clears, with no body it falls through to the muted filler.
    expect(screen.getByText('A').closest('.chat-row-header')).toHaveAttribute(
      'data-affordance',
      'filler',
    )
  })

  it('shows a caret when it has a body and is idle', () => {
    row({ label: 'B', children: <span>b</span> })
    expect(screen.getByText('B').closest('.chat-row-header')).toHaveAttribute(
      'data-affordance',
      'body',
    )
  })

  it('shows a muted filler when idle with no body but alwaysShow', () => {
    row({ label: 'F', alwaysShow: true })
    expect(screen.getByText('F').closest('.chat-row-header')).toHaveAttribute(
      'data-affordance',
      'filler',
    )
  })
})

describe('CollapsibleRow pills + icon', () => {
  it('renders a live timer pill when showTimer and active', () => {
    row({ label: 'T', isActive: true, showTimer: true, startedAt: 0 })
    expect(screen.getByText('<1s')).toBeInTheDocument()
  })

  it('renders a finalized timer pill when showTimer and durationMs', () => {
    row({ label: 'T', showTimer: true, durationMs: 2500, alwaysShow: true })
    expect(screen.getByText('2.5s')).toBeInTheDocument()
  })

  it('renders a tokens/sec pill when present', () => {
    row({ label: 'T', alwaysShow: true, tokensPerSecond: 12.3 })
    expect(screen.getByText('12.3 tok/s')).toBeInTheDocument()
  })

  it('omits the tokens/sec pill for a non-positive rate', () => {
    row({ label: 'T', alwaysShow: true, tokensPerSecond: 0 })
    expect(screen.queryByText(/tok\/s/)).toBeNull()
  })

  it('renders a leading icon when iconName is set', () => {
    const { container } = row({ label: 'I', alwaysShow: true, iconName: 'wrench' })
    expect(container.querySelector('.chat-row-icon')).not.toBeNull()
  })

  it('applies error styling', () => {
    const { container } = row({ label: 'E', children: <span>e</span>, error: true })
    expect(container.querySelector('.chat-row-error')).not.toBeNull()
  })

  it('applies error styling on a static (no-body) row', () => {
    const { container } = row({ label: 'E', alwaysShow: true, error: true })
    expect(container.querySelector('[data-tone="error"]')).not.toBeNull()
  })

  it('renders a non-color "Error" text marker on an error row, with no aria-invalid', () => {
    row({ label: 'E', children: <span>e</span>, error: true })
    const marker = screen.getByText('Error')
    expect(marker).toHaveClass('chat-row-error-marker')
    expect(marker).toHaveAttribute('data-tone', 'error')
    // The text Badge is the WCAG 1.4.1 non-color signal; aria-invalid (a
    // form-field validity attr) is semantically wrong on a disclosure header
    // and must not appear.
    expect(marker.closest('.chat-row-header')).not.toHaveAttribute('aria-invalid')
  })

  it('renders the error marker on a static (no-body) error row, with no aria-invalid', () => {
    row({ label: 'E', alwaysShow: true, error: true })
    expect(screen.getByText('Error')).toHaveClass('chat-row-error-marker')
    expect(screen.getByText('E').closest('.chat-row-header')).not.toHaveAttribute('aria-invalid')
  })

  it('omits the error marker on non-error rows, with no aria-invalid', () => {
    row({ label: 'OK', children: <span>e</span> })
    expect(screen.queryByText('Error')).toBeNull()
    expect(screen.getByText('OK').closest('.chat-row-header')).not.toHaveAttribute('aria-invalid')
  })

  it('forwards a custom className', () => {
    const { container } = row({ label: 'C', alwaysShow: true, className: 'mine' })
    expect(container.querySelector('.mine')).not.toBeNull()
  })
})

describe('CollapsibleRow controlled / uncontrolled', () => {
  it('honors uncontrolled defaultOpen and toggles', () => {
    row({ label: 'U', children: <span>body</span>, defaultOpen: true })
    const details = screen.getByText('U').closest('details') as HTMLDetailsElement
    expect(details.open).toBe(true)
  })

  it('resets a manual toggle when defaultOpen flips (verbose toggle)', () => {
    const { rerender } = render(
      <CollapsibleRow label="V" defaultOpen={false}>
        <span>body</span>
      </CollapsibleRow>,
    )
    const details = screen.getByText('V').closest('details') as HTMLDetailsElement
    // Manually open via the native toggle.
    act(() => {
      details.open = true
      fireEvent(details, new Event('toggle'))
    })
    expect(details.open).toBe(true)
    // Host flips verbose default to true — already open, stays open.
    rerender(
      <CollapsibleRow label="V" defaultOpen>
        <span>body</span>
      </CollapsibleRow>,
    )
    expect(details.open).toBe(true)
    // Manually collapse, then host flips default back to false → adopts it.
    act(() => {
      details.open = false
      fireEvent(details, new Event('toggle'))
    })
    rerender(
      <CollapsibleRow label="V" defaultOpen={false}>
        <span>body</span>
      </CollapsibleRow>,
    )
    expect(screen.getByText('V').closest('details')).toHaveProperty('open', false)
  })

  it('supports controlled open + onOpenChange', () => {
    const onOpenChange = vi.fn()
    const { rerender } = render(
      <CollapsibleRow label="C" open={false} onOpenChange={onOpenChange}>
        <span>body</span>
      </CollapsibleRow>,
    )
    const details = screen.getByText('C').closest('details') as HTMLDetailsElement
    expect(details.open).toBe(false)
    act(() => {
      details.open = true
      fireEvent(details, new Event('toggle'))
    })
    expect(onOpenChange).toHaveBeenCalledWith(true)
    rerender(
      <CollapsibleRow label="C" open onOpenChange={onOpenChange}>
        <span>body</span>
      </CollapsibleRow>,
    )
    expect(details.open).toBe(true)
  })

  it('re-seeds open state when defaultOpen flips and differs from current state', () => {
    const { rerender } = render(
      <CollapsibleRow label="RS" defaultOpen={false}>
        <span>body</span>
      </CollapsibleRow>,
    )
    const details = screen.getByText('RS').closest('details') as HTMLDetailsElement
    expect(details.open).toBe(false)
    // No manual toggle; host flips verbose default true → internal open re-seeds.
    rerender(
      <CollapsibleRow label="RS" defaultOpen>
        <span>body</span>
      </CollapsibleRow>,
    )
    expect(details.open).toBe(true)
  })

  it('skips re-seeding when defaultOpen catches up to the current open state', () => {
    const { rerender } = render(
      <CollapsibleRow label="K" defaultOpen={false}>
        <span>body</span>
      </CollapsibleRow>,
    )
    const details = screen.getByText('K').closest('details') as HTMLDetailsElement
    // User opens it (internalOpen → true).
    act(() => {
      details.open = true
      fireEvent(details, new Event('toggle'))
    })
    expect(details.open).toBe(true)
    // Host flips defaultOpen to true: it now equals internalOpen, so no reset.
    rerender(
      <CollapsibleRow label="K" defaultOpen>
        <span>body</span>
      </CollapsibleRow>,
    )
    expect(details.open).toBe(true)
  })

  it('supports controlled open without onOpenChange', () => {
    render(
      <CollapsibleRow label="C2" open>
        <span>body</span>
      </CollapsibleRow>,
    )
    expect(screen.getByText('C2').closest('details')).toHaveProperty('open', true)
  })

  it('works inside a host registry provider', () => {
    render(
      <ChatProvider>
        <CollapsibleRow label="P" alwaysShow />
      </ChatProvider>,
    )
    expect(screen.getByText('P')).toBeInTheDocument()
  })
})
