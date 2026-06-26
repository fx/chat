import { fireEvent, render, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '../model'
import { ChatProvider } from '../registry'
import type {
  BadgeProps,
  ButtonProps,
  CollapsibleProps,
  CopyButtonProps,
  JsonViewProps,
  LightboxProps,
  MarkdownProps,
  PartialChatComponents,
} from '../registry'
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

/**
 * A styled-stub registry that deliberately uses DIFFERENT markup (data
 * attributes, alternate tags) than the headless defaults, while preserving the
 * same SEMANTICS the renderers rely on. If the renderers leaked any headless
 * markup assumption, the structural assertions below would diverge between the
 * two registries.
 */
const styledStub: PartialChatComponents = {
  Button: ({ onClick, children, 'aria-label': ariaLabel }: ButtonProps) => (
    <button type="button" data-stub="button" aria-label={ariaLabel} onClick={onClick}>
      {children}
    </button>
  ),
  Badge: ({ tone, children }: BadgeProps) => (
    <em data-stub="badge" data-tone={tone}>
      {children}
    </em>
  ),
  Collapsible: ({ header, children, defaultOpen }: CollapsibleProps) => (
    <section data-stub="collapsible" data-open={defaultOpen ? 'true' : 'false'}>
      <header>{header}</header>
      <div>{children}</div>
    </section>
  ),
  JsonView: ({ value }: JsonViewProps) => <pre data-stub="json">{JSON.stringify(value)}</pre>,
  CopyButton: ({ value, 'aria-label': ariaLabel }: CopyButtonProps) => (
    <button type="button" data-stub="copy" data-value={value} aria-label={ariaLabel}>
      copy
    </button>
  ),
  Markdown: ({ content }: MarkdownProps) => <article data-stub="md">{content}</article>,
  Lightbox: ({ src, alt, open, onClose }: LightboxProps) =>
    open ? (
      <div data-stub="lightbox">
        <img src={src} alt={alt} />
        <button type="button" onClick={onClose}>
          x
        </button>
      </div>
    ) : null,
}

const fixture: ChatMessage[] = [
  {
    id: 'u1',
    role: 'user',
    blocks: [{ type: 'text', id: 'ut', text: 'ask @bot' }],
    attachments: [{ url: 'https://x/a.png', mediaType: 'image/png', kind: 'image', name: 'pic' }],
  },
  {
    id: 'a1',
    role: 'assistant',
    blocks: [
      { type: 'reasoning', id: 'r', text: 'think', durationMs: 1200 },
      {
        type: 'tool_call',
        id: 'tc',
        name: 'search',
        arguments: { q: 1 },
        result: { ok: 1 },
        status: 'success',
      },
      { type: 'text', id: 'at', text: 'the answer' },
    ],
    metrics: { model: 'm', durationMs: 1000 },
  },
]

/** Structural facts the renderers guarantee regardless of the registry. */
function assertStructure(root: HTMLElement) {
  // One anchor per message.
  expect(root.querySelectorAll('[data-message-id]')).toHaveLength(2)
  const user = root.querySelector('[data-message-id="u1"]') as HTMLElement
  const assistant = root.querySelector('[data-message-id="a1"]') as HTMLElement
  // User text is plain with a highlighted mention (never markdown).
  expect(within(user).getByText('@bot')).toHaveAttribute('data-agent-id', 'bot')
  // The user message's image attachment renders a thumbnail with accessible alt
  // text in every registry.
  expect(within(user).getByAltText('pic')).toBeInTheDocument()
  // Assistant answer text renders bare beneath the grouped metadata.
  expect(within(assistant).getByText('the answer')).toBeInTheDocument()
  // Two metadata blocks (reasoning + tool) collapse: a +1 badge is shown.
  expect(within(assistant).getByText('+1')).toBeInTheDocument()
  // Copy affordance present per message.
  expect(within(assistant).getByLabelText('Copy message')).toBeInTheDocument()
}

describe('design-system agnosticism', () => {
  it('produces the same structure/semantics through headless and a styled stub', () => {
    const headless = render(
      <ChatProvider>
        <MessageLog messages={fixture} defaultOpen />
      </ChatProvider>,
    )
    assertStructure(headless.container as HTMLElement)
    headless.unmount()

    const stubbed = render(
      <ChatProvider components={styledStub}>
        <MessageLog messages={fixture} defaultOpen />
      </ChatProvider>,
    )
    assertStructure(stubbed.container as HTMLElement)
    // And the styled stub's markup is actually in use (proving injection works).
    expect(stubbed.container.querySelector('[data-stub="collapsible"]')).not.toBeNull()
    expect(stubbed.container.querySelector('[data-stub="md"]')).not.toBeNull()
    expect(stubbed.container.querySelector('[data-stub="json"]')).not.toBeNull()
    // Expanding the user's image thumbnail opens the host-overridden Lightbox.
    const user = stubbed.container.querySelector('[data-message-id="u1"]') as HTMLElement
    fireEvent.click(within(user).getByRole('button', { name: 'Expand pic' }))
    expect(stubbed.container.querySelector('[data-stub="lightbox"]')).not.toBeNull()
  })
})
