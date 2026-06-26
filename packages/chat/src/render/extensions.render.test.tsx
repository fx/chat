import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '../model'
import { ChatProvider } from '../registry'
import type { JsonViewProps, PartialChatComponents } from '../registry'
import { MessageItem } from './MessageItem'
import { MessageLog } from './MessageLog'
import { TimelineItemView } from './TimelineItemView'
import { BlockView } from './blocks'
import { InertBlockView } from './blocks'
import type { ChatExtensions, CustomRenderProps, RenderableBlock } from './extensions'
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

const baseContext = { role: 'assistant' as const }

/** A message carrying a host-defined (non-core) block, cast through the model. */
function withCustomBlock(): ChatMessage {
  return {
    id: 'a1',
    role: 'assistant',
    createdAt: 0,
    blocks: [
      { type: 'text', id: 't', text: 'hello' },
      // Host-defined block kind smuggled through the closed union via cast.
      { type: 'host_marker', id: 'hm', label: 'mark' },
    ] as unknown as ChatMessage['blocks'],
  }
}

describe('InertBlockView', () => {
  it('renders an empty inert wrapper (no JSON) by default', () => {
    const { container } = render(<InertBlockView block={{ type: 'host_marker', id: 'x' }} />)
    const el = container.querySelector('[data-inert="true"]') as HTMLElement
    expect(el).not.toBeNull()
    expect(el.getAttribute('data-block-type')).toBe('host_marker')
    expect(container.querySelector('.chat-jsonview')).toBeNull()
  })

  it('surfaces the block as JSON in raw/debug mode', () => {
    const { container } = render(<InertBlockView block={{ type: 'host_marker', id: 'x' }} raw />)
    expect(container.querySelector('.chat-jsonview')).not.toBeNull()
  })
})

describe('BlockView dispatch & inert fallback', () => {
  it('renders an unknown block type inert WITHOUT extensions and never throws', () => {
    const block = { type: 'host_marker', id: 'hm' } as unknown as RenderableBlock
    expect(() => render(<BlockView block={block} context={baseContext} />)).not.toThrow()
    const { container } = render(<BlockView block={block} context={baseContext} />)
    expect(container.querySelector('[data-inert="true"]')).not.toBeNull()
  })

  it('surfaces the unknown block as JSON when context.raw is set', () => {
    const block = { type: 'host_marker', id: 'hm', label: 'x' } as unknown as RenderableBlock
    const { container } = render(
      <BlockView block={block} context={{ ...baseContext, raw: true }} />,
    )
    expect(container.querySelector('.chat-jsonview')).not.toBeNull()
  })

  it('renders an unknown block type inert WITH extensions that do not match', () => {
    const block = { type: 'host_marker', id: 'hm' } as unknown as RenderableBlock
    const extensions: ChatExtensions = { blockRenderers: { other: () => <div /> } }
    const { container } = render(
      <BlockView
        block={block}
        context={{ ...baseContext, message: withCustomBlock() }}
        extensions={extensions}
      />,
    )
    expect(container.querySelector('[data-inert="true"]')).not.toBeNull()
  })

  it('renders a custom blockRenderer for a host type, passing block/message/isStreaming', () => {
    const message = withCustomBlock()
    const HostMarker = vi.fn(({ block, isStreaming }: CustomRenderProps) => (
      <div data-host-marker data-streaming={String(isStreaming)}>
        {(block as { label?: string }).label}
      </div>
    ))
    const extensions: ChatExtensions = { blockRenderers: { host_marker: HostMarker } }
    const block = message.blocks[1] as unknown as RenderableBlock
    render(
      <BlockView
        block={block}
        context={{ ...baseContext, message, isActive: true, activeBlockId: 'hm' }}
        extensions={extensions}
      />,
    )
    expect(screen.getByText('mark')).toBeInTheDocument()
    expect(
      screen.getByText('mark').closest('[data-host-marker]')?.getAttribute('data-streaming'),
    ).toBe('true')
    expect(HostMarker).toHaveBeenCalledTimes(1)
  })

  it('falls back to inert when a custom renderer exists but context has no message', () => {
    const block = { type: 'host_marker', id: 'hm' } as unknown as RenderableBlock
    const extensions: ChatExtensions = { blockRenderers: { host_marker: () => <div data-host /> } }
    const { container } = render(
      <BlockView block={block} context={baseContext} extensions={extensions} />,
    )
    expect(container.querySelector('[data-host]')).toBeNull()
    expect(container.querySelector('[data-inert="true"]')).not.toBeNull()
  })
})

describe('toolRenderers override by name', () => {
  const message: ChatMessage = {
    id: 'a1',
    role: 'assistant',
    createdAt: 0,
    blocks: [
      { type: 'tool_call', id: 'tc1', name: 'render_ui', arguments: { a: 1 }, status: 'success' },
      { type: 'tool_call', id: 'tc2', name: 'search', arguments: { q: 1 }, status: 'success' },
    ],
  }

  it('renders the host tool renderer for a matching name, default for the rest', () => {
    const HostToolUI = vi.fn(({ block }: CustomRenderProps) => (
      <div data-host-tool>{(block as { name: string }).name}</div>
    ))
    const extensions: ChatExtensions = { toolRenderers: { render_ui: HostToolUI } }
    const { container } = render(<MessageLog messages={[message]} flat extensions={extensions} />)
    // The override rendered for render_ui.
    expect(container.querySelector('[data-host-tool]')?.textContent).toBe('render_ui')
    // The default tool block rendered for search (its name label is present, no host-tool).
    expect(screen.getByText('search')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-host-tool]')).toHaveLength(1)
    expect(HostToolUI).toHaveBeenCalledTimes(1)
  })

  it('renders the DEFAULT tool block when no toolRenderers entry matches', () => {
    const { container } = render(<MessageLog messages={[message]} flat />)
    expect(container.querySelector('[data-host-tool]')).toBeNull()
    expect(screen.getByText('render_ui')).toBeInTheDocument()
    expect(screen.getByText('search')).toBeInTheDocument()
  })

  it('passes message context only to the tool override path when context.message is set', () => {
    // Direct BlockView call WITHOUT a message in context → override is skipped,
    // default tool block renders.
    const HostToolUI = vi.fn(() => <div data-host-tool />)
    const extensions: ChatExtensions = { toolRenderers: { render_ui: HostToolUI } }
    const block = message.blocks[0] as RenderableBlock
    const { container } = render(
      <BlockView block={block} context={baseContext} extensions={extensions} />,
    )
    expect(container.querySelector('[data-host-tool]')).toBeNull()
    expect(HostToolUI).not.toHaveBeenCalled()
  })
})

describe('TimelineItemView', () => {
  it('wraps an inline render fn with the data-timeline-item-id anchor', () => {
    const { container } = render(
      <TimelineItemView item={{ id: 'm1', at: 1, render: () => <span data-x>hi</span> }} />,
    )
    const wrap = container.querySelector('[data-timeline-item-id="m1"]') as HTMLElement
    expect(wrap).not.toBeNull()
    expect(within(wrap).getByText('hi')).toBeInTheDocument()
  })

  it('resolves a `kind` through blockRenderers (with a synthesized message)', () => {
    const Renderer = vi.fn(({ block, message }: CustomRenderProps) => (
      <div data-kind={(block as { type: string }).type} data-msg={message.id} />
    ))
    const extensions: ChatExtensions = { blockRenderers: { wake: Renderer } }
    const { container } = render(
      <TimelineItemView item={{ id: 'w1', at: 1, kind: 'wake' }} extensions={extensions} />,
    )
    const el = container.querySelector('[data-kind="wake"]') as HTMLElement
    expect(el).not.toBeNull()
    expect(el.getAttribute('data-msg')).toBe('w1')
    expect(Renderer).toHaveBeenCalledTimes(1)
  })

  it('passes an explicit block payload to the resolved renderer', () => {
    const Renderer = vi.fn(({ block }: CustomRenderProps) => (
      <div data-label={(block as { label?: string }).label} />
    ))
    const extensions: ChatExtensions = { blockRenderers: { wake: Renderer } }
    const { container } = render(
      <TimelineItemView
        item={{ id: 'w1', at: 1, kind: 'wake', block: { id: 'b', type: 'wake', label: 'L' } }}
        extensions={extensions}
      />,
    )
    expect(container.querySelector('[data-label="L"]')).not.toBeNull()
  })

  it('renders inertly (anchor only) when a kind has no matching renderer', () => {
    const { container } = render(
      <TimelineItemView item={{ id: 'w1', at: 1, kind: 'unknown' }} extensions={{}} />,
    )
    const wrap = container.querySelector('[data-timeline-item-id="w1"]') as HTMLElement
    expect(wrap).not.toBeNull()
    expect(wrap.textContent).toBe('')
  })

  it('renders inertly when an item has neither render nor kind', () => {
    const { container } = render(<TimelineItemView item={{ id: 'w1', at: 1 }} />)
    const wrap = container.querySelector('[data-timeline-item-id="w1"]') as HTMLElement
    expect(wrap).not.toBeNull()
    expect(wrap.textContent).toBe('')
  })
})

describe('MessageLog timeline interleaving', () => {
  it('interleaves a custom item between messages, wrapped with the anchor', () => {
    const messages: ChatMessage[] = [
      {
        id: 'a',
        role: 'assistant',
        blocks: [{ type: 'text', id: 'ta', text: 'first' }],
        createdAt: 100,
      },
      {
        id: 'b',
        role: 'assistant',
        blocks: [{ type: 'text', id: 'tb', text: 'second' }],
        createdAt: 300,
      },
    ]
    const extensions: ChatExtensions = {
      timelineItems: [{ id: 'm1', at: 200, render: () => <span>marker</span> }],
    }
    const { container } = render(<MessageLog messages={messages} extensions={extensions} />)
    const order = Array.from(
      container.querySelectorAll('[data-message-id], [data-timeline-item-id]'),
    ).map(
      (el) =>
        el.getAttribute('data-message-id') ?? `item:${el.getAttribute('data-timeline-item-id')}`,
    )
    expect(order).toEqual(['a', 'item:m1', 'b'])
    expect(container.querySelector('[data-timeline-item-id="m1"]')?.textContent).toBe('marker')
  })

  it('does not collide React keys when a message id matches an item id (namespaced keys)', () => {
    // A message id `item-m1` would collide with a timeline item id `m1` if message
    // keys were raw — the disjoint `msg-`/`item-` namespaces prevent that.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const messages: ChatMessage[] = [
      {
        id: 'item-m1',
        role: 'assistant',
        blocks: [{ type: 'text', id: 't', text: 'hi' }],
        createdAt: 100,
      },
    ]
    const extensions: ChatExtensions = {
      timelineItems: [{ id: 'm1', at: 200, render: () => <span>marker</span> }],
    }
    render(<MessageLog messages={messages} extensions={extensions} />)
    const dupKeyWarning = errorSpy.mock.calls.some((args) =>
      String(args[0]).includes('Encountered two children with the same key'),
    )
    expect(dupKeyWarning).toBe(false)
    errorSpy.mockRestore()
  })
})

describe('grouping interaction for custom blocks (via MessageItem)', () => {
  const message: ChatMessage = {
    id: 'a1',
    role: 'assistant',
    createdAt: 0,
    blocks: [
      { type: 'reasoning', id: 'r', text: 'think', durationMs: 10 },
      { type: 'host_marker', id: 'hm', label: 'M' },
      { type: 'tool_call', id: 'tc', name: 'search', arguments: {}, status: 'success' },
    ] as unknown as ChatMessage['blocks'],
  }
  const HostMarker = ({ block }: CustomRenderProps) => (
    <div data-host-marker>{(block as { label?: string }).label}</div>
  )

  it('renders a custom block bare by default, breaking the aux run (no group)', () => {
    const extensions: ChatExtensions = { blockRenderers: { host_marker: HostMarker } }
    const { container } = render(
      <MessageItem message={message} extensions={extensions} defaultOpen />,
    )
    // Marker renders bare (host renderer present) and is NOT inside a group body.
    const marker = container.querySelector('[data-host-marker]') as HTMLElement
    expect(marker).not.toBeNull()
    expect(marker.closest('[data-testid="chat-group-body"]')).toBeNull()
    // reasoning + tool are single-item runs split by the marker → no +N badge.
    expect(screen.queryByText('+1')).toBeNull()
  })

  it('folds an opted-in custom kind into the aux run (group with +N)', () => {
    const extensions: ChatExtensions = {
      blockRenderers: { host_marker: HostMarker },
      timelineBehavior: { host_marker: { auxEligible: true } },
    }
    const { container } = render(
      <MessageItem message={message} extensions={extensions} defaultOpen />,
    )
    // All three fold under one disclosure; the marker now sits in the group body.
    const marker = container.querySelector('[data-host-marker]') as HTMLElement
    expect(marker.closest('[data-testid="chat-group-body"]')).not.toBeNull()
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('marks the group active when the trailing custom block is the active one', () => {
    const trailingMarker: ChatMessage = {
      id: 'a3',
      role: 'assistant',
      createdAt: 0,
      blocks: [
        { type: 'reasoning', id: 'r', text: 'think', durationMs: 10 },
        { type: 'host_marker', id: 'hm', label: 'M' },
      ] as unknown as ChatMessage['blocks'],
    }
    const extensions: ChatExtensions = {
      blockRenderers: { host_marker: HostMarker },
      timelineBehavior: { host_marker: { auxEligible: true } },
    }
    // Stream this message with the custom marker (the trailing block) active.
    const { container } = render(
      <MessageLog
        messages={[trailingMarker]}
        isStreaming
        streamingMessageId="a3"
        extensions={extensions}
      />,
    )
    // The collapsed group header surfaces the active affordance (spinner), proving
    // a grouped active custom block is not silently treated as inactive.
    expect(container.querySelector('.chat-group [data-affordance="active"]')).not.toBeNull()
  })

  it('labels the group header with the custom type when an opted-in custom kind heads it', () => {
    // host_marker is the trailing, header-eligible block in the run, so it heads
    // the collapsed summary and the header label is its custom `type`.
    const trailingMarker: ChatMessage = {
      id: 'a2',
      role: 'assistant',
      createdAt: 0,
      blocks: [
        { type: 'reasoning', id: 'r', text: 'think', durationMs: 10 },
        { type: 'host_marker', id: 'hm', label: 'M' },
      ] as unknown as ChatMessage['blocks'],
    }
    const extensions: ChatExtensions = {
      blockRenderers: { host_marker: HostMarker },
      timelineBehavior: { host_marker: { auxEligible: true, eligibleForHeaderSummary: true } },
    }
    render(<MessageItem message={trailingMarker} extensions={extensions} />)
    // The collapsed header label is the custom kind's `type` string.
    expect(screen.getByText('host_marker')).toBeInTheDocument()
  })
})

describe('additivity (no extensions == default behavior)', () => {
  const fixture: ChatMessage[] = [
    { id: 'u1', role: 'user', blocks: [{ type: 'text', id: 'ut', text: 'ask @bot' }] },
    {
      id: 'a1',
      role: 'assistant',
      createdAt: 0,
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

  it('produces identical markup with no extensions vs an empty extensions object', () => {
    const a = render(<MessageLog messages={fixture} defaultOpen />)
    const noExt = a.container.innerHTML
    a.unmount()
    const b = render(<MessageLog messages={fixture} defaultOpen extensions={{}} />)
    expect(b.container.innerHTML).toBe(noExt)
  })
})

describe('design-system agnosticism through the extension path', () => {
  it('a custom renderer draws its atoms from the registry (headless and styled stub)', () => {
    const message = withCustomBlock()
    // The host renderer pulls JsonView from the registry — proving extension
    // renderers participate through useChatComponents, not a hard-coded kit.
    const HostMarker = ({ block }: CustomRenderProps) => {
      return <InertBlockView block={block as RenderableBlock} raw />
    }
    const extensions: ChatExtensions = { blockRenderers: { host_marker: HostMarker } }

    const headless = render(
      <ChatProvider>
        <MessageLog messages={[message]} flat extensions={extensions} />
      </ChatProvider>,
    )
    expect(headless.container.querySelector('.chat-jsonview')).not.toBeNull()
    headless.unmount()

    const styledStub: PartialChatComponents = {
      JsonView: ({ value }: JsonViewProps) => <pre data-stub="json">{JSON.stringify(value)}</pre>,
    }
    const stubbed = render(
      <ChatProvider components={styledStub}>
        <MessageLog messages={[message]} flat extensions={extensions} />
      </ChatProvider>,
    )
    // The styled stub's JsonView is what the extension renderer drew — proving
    // the registry (not a hard-coded primitive) backs the extension path.
    expect(stubbed.container.querySelector('[data-stub="json"]')).not.toBeNull()
  })
})
