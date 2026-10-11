import type { ChatMessage } from '@fx/chat-core'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MessageLog } from '../render/MessageLog'
import { ChatProvider } from './context'
import { headlessComponents } from './headless'

describe('optional icons', () => {
  it('falls back to the headless checklist icon for a host registry without it', () => {
    const { checklist: _omitted, ...icons } = headlessComponents.icons
    const message: ChatMessage = {
      id: 'm',
      role: 'assistant',
      blocks: [{ type: 'plan', id: 'p', entries: [{ content: 'x', status: 'pending' }] }],
    }
    const { container } = render(
      <ChatProvider
        components={{ ...headlessComponents, icons: icons as typeof headlessComponents.icons }}
      >
        <MessageLog messages={[message]} />
      </ChatProvider>,
    )
    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.textContent).toContain('Plan 0/1')
  })
})
