import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ChatProvider } from '../../registry'
import { PlanBlockView } from './PlanBlock'

describe('PlanBlockView', () => {
  it('heads with the progress label and lists entries with status hooks', async () => {
    const { container } = render(
      <ChatProvider classNames={{ plan: 'pl', planEntry: 'pe' }}>
        <PlanBlockView
          defaultOpen
          block={{
            type: 'plan',
            id: 'p',
            entries: [
              { id: 'a', content: 'Read', status: 'completed', priority: 'high' },
              { content: 'Write', status: 'in_progress' },
              { content: 'Test', status: 'pending' },
            ],
          }}
        />
      </ChatProvider>,
    )
    expect(container.textContent).toContain('Plan 1/3')
    const entries = container.querySelectorAll('.chat-plan.pl .chat-plan-entry.pe')
    expect([...entries].map((e) => e.getAttribute('data-status'))).toEqual([
      'completed',
      'in_progress',
      'pending',
    ])
    expect(entries[0]?.getAttribute('data-priority')).toBe('high')
    expect(screen.getByLabelText('Write (in progress)')).toBeTruthy()
    void userEvent
  })

  it('renders an empty plan as a bare row', () => {
    const { container } = render(<PlanBlockView block={{ type: 'plan', id: 'p', entries: [] }} />)
    expect(container.textContent).toContain('Plan')
    expect(container.querySelector('.chat-plan')).toBeNull()
  })
})
