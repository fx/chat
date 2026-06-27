/**
 * Cross-registry parity test.
 *
 * Renders the SAME fixture conversation through all three registry adapters
 * (`fx-ui`, `shadcn`, `headless`) and asserts the library-driven structure and
 * semantics are equivalent — only the injected presentation differs. This is the
 * falsifiability test for design-system agnosticism: if any registry diverged in
 * the messages/blocks/tool-calls/grouping the library renders, these shared
 * assertions would fail for that registry alone.
 */
import { ChatProvider, MessageLog } from '@fx/chat'
import { render, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolvedConversation } from '../fixtures/conversation'
import { REGISTRIES, REGISTRY_IDS } from './index'

beforeEach(() => {
  // Deterministic clock so any live-timer derivation is stable across registries.
  vi.useFakeTimers()
  vi.setSystemTime(0)
  // jsdom lacks matchMedia (used by the reduced-motion hook).
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/**
 * Structural / semantic facts the library guarantees for the resolved fixture,
 * regardless of which registry supplies the presentation.
 */
function assertResolvedStructure(root: HTMLElement) {
  // One anchor per message (user + assistant).
  const anchors = root.querySelectorAll('[data-message-id]')
  expect(anchors).toHaveLength(2)

  const user = root.querySelector('[data-message-id="u1"]') as HTMLElement
  const assistant = root.querySelector('[data-message-id="a1"]') as HTMLElement
  expect(user).not.toBeNull()
  expect(assistant).not.toBeNull()
  expect(user.getAttribute('data-role')).toBe('user')
  expect(assistant.getAttribute('data-role')).toBe('assistant')

  // The user mention renders as a highlighted token (never markdown).
  expect(within(user).getByText('@analyst')).toHaveAttribute('data-agent-id', 'analyst')

  // The assistant's grouped auxiliary run (reasoning + 2 tools + status) collapses
  // into a disclosure with a `+N` badge counting the hidden members.
  expect(within(assistant).getByText('+3')).toBeInTheDocument()

  // The markdown answer renders bare beneath the grouped metadata.
  expect(within(assistant).getByText(/Revenue rose/i)).toBeInTheDocument()

  // A per-message copy affordance is present.
  expect(within(assistant).getByLabelText('Copy message')).toBeInTheDocument()
}

describe('cross-registry parity', () => {
  for (const id of REGISTRY_IDS) {
    it(`renders the resolved fixture with equivalent structure through ${id}`, () => {
      const { container, unmount } = render(
        <ChatProvider components={REGISTRIES[id].components}>
          <MessageLog messages={resolvedConversation} defaultOpen />
        </ChatProvider>,
      )
      assertResolvedStructure(container as HTMLElement)
      unmount()
    })
  }

  it('folds each assistant turn into one collapsed group in minimal mode across all registries', () => {
    // Change 0011: minimal/density mode folds ALL of an assistant turn's aux
    // blocks (reasoning + 2 tools + status) into ONE group, with the markdown
    // answer bare beneath it — proven across all three registries.
    for (const id of REGISTRY_IDS) {
      const { container, unmount } = render(
        <ChatProvider components={REGISTRIES[id].components}>
          <MessageLog messages={resolvedConversation} minimal defaultOpen />
        </ChatProvider>,
      )
      const assistant = container.querySelector('[data-message-id="a1"]') as HTMLElement
      // Exactly one collapsed group for the assistant turn's metadata.
      expect(within(assistant).getByText('+3')).toBeInTheDocument()
      expect(assistant.querySelectorAll('.chat-group')).toHaveLength(1)
      // The markdown answer renders bare beneath the group.
      expect(within(assistant).getByText(/Revenue rose/i)).toBeInTheDocument()
      // Minimal mode marks the log + message wrappers for the density layout.
      expect(container.querySelector('.chat-log')).toHaveAttribute('data-minimal', 'true')
      expect(assistant).toHaveAttribute('data-minimal', 'true')
      unmount()
    }
  })

  it('produces the same message/block/grouping skeleton across all three registries', () => {
    const skeletons = REGISTRY_IDS.map((id) => {
      const { container, unmount } = render(
        <ChatProvider components={REGISTRIES[id].components}>
          <MessageLog messages={resolvedConversation} defaultOpen />
        </ChatProvider>,
      )
      // The registry-agnostic skeleton: every element carrying a library data
      // contract attribute, in document order. Presentation classes/markup are
      // intentionally excluded — only the library-driven semantics are compared.
      const skeleton = Array.from(
        container.querySelectorAll('[data-message-id],[data-role],[data-agent-id],[data-section]'),
      ).map((el) => ({
        tag: el.hasAttribute('data-message-id') ? 'message' : el.tagName.toLowerCase(),
        messageId: el.getAttribute('data-message-id'),
        role: el.getAttribute('data-role'),
        agentId: el.getAttribute('data-agent-id'),
        section: el.getAttribute('data-section'),
      }))
      unmount()
      return skeleton
    })

    // All three skeletons must be identical: same messages, roles, mentions, and
    // tool input/output sections in the same order.
    const [first] = skeletons
    if (!first) throw new Error('expected at least one rendered skeleton')
    for (const other of skeletons.slice(1)) {
      expect(other).toEqual(first)
    }
    // Sanity: the skeleton actually captured the contract surface.
    expect(first.some((n) => n.messageId === 'a1')).toBe(true)
    expect(first.some((n) => n.section === 'input')).toBe(true)
    expect(first.some((n) => n.agentId === 'analyst')).toBe(true)
  })
})
