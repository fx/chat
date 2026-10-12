import type { MessageDetailsProps } from '@fx/chat'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { lucideIcons } from './icons'
import { COPIED_CLOSE_MS, MessageDetailsSheet } from './message-details'
import { createShadcnComponents, shadcnComponents } from './registry'

beforeAll(() => {
  // vaul reads these; jsdom has neither.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function sheet(overrides: Partial<MessageDetailsProps> = {}) {
  const props: MessageDetailsProps = {
    open: true,
    onOpenChange: vi.fn(),
    details: [
      { key: 'model', label: 'Model', value: 'gpt-x' },
      { key: 'duration', label: 'Duration', value: '1.5s' },
      { key: 'rate', label: 'Speed', value: '9.9 tok/s' },
    ],
    copyText: 'hello',
    actions: [
      { id: 'regenerate', label: 'Regenerate', icon: lucideIcons.regenerate, onSelect: vi.fn() },
    ],
    ...overrides,
  }
  render(<MessageDetailsSheet {...props} />)
  return props
}

describe('MessageDetailsSheet', () => {
  it('titles the sheet with the model and lists the other facts', () => {
    sheet()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'gpt-x' })).toBeInTheDocument()
    const facts = dialog.querySelectorAll('[data-detail]')
    expect([...facts].map((f) => f.getAttribute('data-detail'))).toEqual(['duration', 'rate'])
    expect(within(dialog).getByText('9.9 tok/s')).toBeInTheDocument()
    // No outcome: the description is for screen readers only.
    expect(within(dialog).getByText('Details and actions for this message')).toHaveClass('sr-only')
  })

  it('falls back to a generic title, and shows no list without facts', () => {
    sheet({ details: [], copyText: '' })
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Message' })).toBeInTheDocument()
    expect(dialog.querySelector('dl')).toBeNull()
    expect(within(dialog).queryByText('Copy text')).toBeNull()
  })

  it('says how the message ended', () => {
    sheet({ outcome: { kind: 'error', message: 'boom' } })
    expect(screen.getByText('Failed: boom')).toHaveClass('text-destructive')
  })

  it('says when the message was stopped', () => {
    sheet({ outcome: { kind: 'stopped' } })
    const status = screen.getByText('Stopped before it finished')
    expect(status).not.toHaveClass('sr-only')
    // Stopping is not a failure: no destructive tone.
    expect(status).not.toHaveClass('text-destructive')
  })

  it('closes and runs an action', () => {
    const props = sheet()
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))
    expect(props.onOpenChange).toHaveBeenCalledWith(false)
    expect(props.actions[0]?.onSelect).toHaveBeenCalledOnce()
  })

  it('copies, shows the check, then closes', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const props = sheet()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy text' }))
    })
    expect(writeText).toHaveBeenCalledWith('hello')
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
    expect(props.onOpenChange).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(COPIED_CLOSE_MS))
    expect(props.onOpenChange).toHaveBeenCalledWith(false)
  })

  it('still confirms (and closes) without a clipboard', () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined })
    const props = sheet()
    fireEvent.click(screen.getByRole('button', { name: 'Copy text' }))
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(COPIED_CLOSE_MS))
    expect(props.onOpenChange).toHaveBeenCalledWith(false)
  })

  it('renders nothing while closed and resets the copied state on reopen', () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined })
    const props: MessageDetailsProps = {
      open: true,
      onOpenChange: vi.fn(),
      details: [],
      copyText: 'x',
      actions: [],
    }
    const { rerender } = render(<MessageDetailsSheet {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy text' }))
    rerender(<MessageDetailsSheet {...props} open={false} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    rerender(<MessageDetailsSheet {...props} open />)
    expect(screen.getByRole('button', { name: 'Copy text' })).toBeInTheDocument()
  })
})

describe('MessageDetailsSheet close timer', () => {
  function controlled() {
    const props: MessageDetailsProps = {
      open: true,
      onOpenChange: vi.fn(),
      details: [],
      copyText: 'x',
      actions: [],
    }
    const view = render(<MessageDetailsSheet {...props} />)
    return { props, ...view }
  }

  it('drops a pending close when the sheet is closed another way, so a reopen stays open', () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined })
    const { props, rerender } = controlled()
    fireEvent.click(screen.getByRole('button', { name: 'Copy text' }))
    // Closed by the overlay/Escape/swipe before the copy's close fires…
    rerender(<MessageDetailsSheet {...props} open={false} />)
    // …and reopened within the window.
    rerender(<MessageDetailsSheet {...props} open />)
    act(() => vi.advanceTimersByTime(COPIED_CLOSE_MS))
    expect(props.onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('schedules nothing when the copy settles after the sheet closed', async () => {
    vi.useFakeTimers()
    let settle: () => void = () => {}
    const writeText = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve
        }),
    )
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const { props, rerender } = controlled()
    fireEvent.click(screen.getByRole('button', { name: 'Copy text' }))
    rerender(<MessageDetailsSheet {...props} open={false} />)
    rerender(<MessageDetailsSheet {...props} open />)
    // The copy was started by the sheet as it was; the reopened sheet is new.
    rerender(<MessageDetailsSheet {...props} open={false} />)
    await act(async () => settle())
    rerender(<MessageDetailsSheet {...props} open />)
    act(() => vi.advanceTimersByTime(COPIED_CLOSE_MS))
    expect(props.onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Copy text' })).toBeInTheDocument()
  })

  it('clears a pending close on unmount', () => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined })
    const { props, unmount } = controlled()
    fireEvent.click(screen.getByRole('button', { name: 'Copy text' }))
    unmount()
    act(() => vi.advanceTimersByTime(COPIED_CLOSE_MS))
    expect(props.onOpenChange).not.toHaveBeenCalled()
  })
})

describe('MessageDetailsSheet activity', () => {
  it('shows the activity and scrolls to the item it was opened for', () => {
    const scrolled: string[] = []
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.getAttribute('data-block-id') ?? '')
    }
    try {
      sheet({
        focusId: 'b2',
        activity: (
          <div>
            <div data-block-id="b1">one</div>
            <div data-block-id="b2">two</div>
          </div>
        ),
      })
      const section = screen.getByRole('region', { name: 'Activity' })
      expect(within(section).getByText('two')).toBeInTheDocument()
      expect(scrolled).toEqual(['b2'])
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  it('has no activity section without activity, and scrolls nowhere for an unknown focus', () => {
    sheet({ focusId: 'nope' })
    expect(screen.queryByRole('region', { name: 'Activity' })).toBeNull()
  })
})

describe('registry MessageDetails', () => {
  it('is provided for touch only', () => {
    expect(createShadcnComponents({ touch: true }).MessageDetails).toBe(MessageDetailsSheet)
    expect(shadcnComponents.MessageDetails).toBeUndefined()
  })
})
