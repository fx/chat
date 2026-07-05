import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GutterRow } from './GutterRow'

describe('GutterRow', () => {
  it('renders the two-column structure with the clock label and content', () => {
    const { container } = render(
      <GutterRow clock="09:05:07">
        <span>content</span>
      </GutterRow>,
    )
    const row = container.querySelector('.chat-gutter-row') as HTMLElement
    expect(row).not.toBeNull()
    const time = row.querySelector('.chat-gutter-time') as HTMLElement
    expect(time).toHaveAttribute('data-testid', 'chat-gutter-time')
    expect(time.textContent).toBe('09:05:07')
    // A non-blank clock is NOT aria-hidden (it's meaningful content).
    expect(time).not.toHaveAttribute('aria-hidden')
    const content = row.querySelector('.chat-gutter-content') as HTMLElement
    expect(within(content).getByText('content')).toBeInTheDocument()
  })

  it('renders a blank, aria-hidden, width-reserving cell for an empty clock', () => {
    render(
      <GutterRow clock="">
        <span>content</span>
      </GutterRow>,
    )
    const time = screen.getByTestId('chat-gutter-time')
    // Blank label — still emitted so the host can reserve its width — and hidden
    // from screen readers.
    expect(time.textContent).toBe('')
    expect(time).toHaveAttribute('aria-hidden')
    // The content cell still renders its child.
    expect(screen.getByText('content')).toBeInTheDocument()
  })
})
