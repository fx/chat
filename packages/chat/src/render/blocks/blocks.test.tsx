import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ReasoningBlock,
  StatusBlock,
  SystemBlock,
  TextBlock,
  ToolCallBlock,
} from '../../model'
import { stubMatchMedia } from '../test-helpers'
import { BlockView } from './BlockView'
import type { BlockRenderContext } from './BlockView'
import { RawJsonBlockView } from './RawJsonBlock'
import { ReasoningBlockView } from './ReasoningBlock'
import { StatusBlockView } from './StatusBlock'
import { SystemBlockView } from './SystemBlock'
import { TextBlockView } from './TextBlock'
import { ToolCallBlockView } from './ToolCallBlock'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  stubMatchMedia(false)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const ctx = (extra?: Partial<BlockRenderContext>): BlockRenderContext => ({
  role: 'assistant',
  ...extra,
})

describe('TextBlockView', () => {
  it('renders assistant text as markdown', () => {
    const block: TextBlock = { type: 'text', id: 't', text: '`code` here' }
    const { container } = render(<TextBlockView block={block} messageRole="assistant" />)
    expect(container.querySelector('.chat-md')).not.toBeNull()
  })

  it('renders user text as plain text with mention highlighting', () => {
    const block: TextBlock = { type: 'text', id: 't', text: 'hi @bob there' }
    const { container } = render(<TextBlockView block={block} messageRole="user" />)
    expect(container.querySelector('.chat-md')).toBeNull()
    const mention = container.querySelector('.chat-mention')
    expect(mention).not.toBeNull()
    expect(mention).toHaveAttribute('data-agent-id', 'bob')
  })

  it('renders plain user text with no mentions', () => {
    const block: TextBlock = { type: 'text', id: 't', text: 'plain text' }
    const { container } = render(<TextBlockView block={block} messageRole="user" />)
    expect(container.querySelector('.chat-mention')).toBeNull()
    expect(screen.getByText('plain text')).toBeInTheDocument()
  })

  it('renders repeated identical literal runs without React key collisions', () => {
    // `@a @b @c` yields two identical single-space literal segments; positional
    // keys keep them distinct (no duplicate-key warning, correct reconciliation).
    const errors: unknown[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args)
    })
    try {
      const block: TextBlock = { type: 'text', id: 't', text: '@a @b @c' }
      const { container } = render(<TextBlockView block={block} messageRole="user" />)
      expect(container.querySelectorAll('.chat-mention')).toHaveLength(3)
      expect(errors).toHaveLength(0)
    } finally {
      spy.mockRestore()
    }
  })

  it('honors an explicit markdown:false hint on an assistant block', () => {
    const block: TextBlock = { type: 'text', id: 't', text: '`x`', markdown: false }
    const { container } = render(<TextBlockView block={block} messageRole="assistant" />)
    expect(container.querySelector('.chat-md')).toBeNull()
  })

  it('keeps user text plain even with an explicit markdown:true hint', () => {
    // Per the rendering spec, user-authored text is NEVER Markdown.
    const block: TextBlock = { type: 'text', id: 't', text: '@bob `x`', markdown: true }
    const { container } = render(<TextBlockView block={block} messageRole="user" />)
    expect(container.querySelector('.chat-md')).toBeNull()
    expect(container.querySelector('.chat-mention')).not.toBeNull()
  })

  it('passes the streaming flag to Markdown when set', () => {
    const block: TextBlock = { type: 'text', id: 't', text: 'x' }
    const { container } = render(<TextBlockView block={block} messageRole="assistant" streaming />)
    expect(container.querySelector('[data-streaming="true"]')).not.toBeNull()
  })
})

describe('ReasoningBlockView', () => {
  it('labels with the formatted duration when known', () => {
    const block: ReasoningBlock = { type: 'reasoning', id: 'r', text: 'think', durationMs: 2500 }
    render(<ReasoningBlockView block={block} />)
    expect(screen.getByText('Thought for 2.5s')).toBeInTheDocument()
  })

  it('labels "Thinking…" while active without a duration', () => {
    const block: ReasoningBlock = { type: 'reasoning', id: 'r', text: 'think' }
    render(<ReasoningBlockView block={block} isActive startedAt={0} />)
    expect(screen.getByText('Thinking…')).toBeInTheDocument()
  })

  it('labels a completed durationless reasoning block "Reasoning" (not "Thinking…")', () => {
    const block: ReasoningBlock = { type: 'reasoning', id: 'r', text: 'think' }
    render(<ReasoningBlockView block={block} />)
    expect(screen.getByText('Reasoning')).toBeInTheDocument()
    expect(screen.queryByText('Thinking…')).toBeNull()
  })
})

describe('ToolCallBlockView', () => {
  it('shows the name and input, with no output when result is absent', () => {
    const block: ToolCallBlock = {
      type: 'tool_call',
      id: 'tc',
      name: 'search',
      arguments: { q: 'hi' },
      status: 'success',
    }
    const { container } = render(<ToolCallBlockView block={block} />)
    expect(screen.getByText('search')).toBeInTheDocument()
    expect(container.querySelector('[data-section="input"]')).not.toBeNull()
    expect(container.querySelector('[data-section="output"]')).toBeNull()
  })

  it('shows output when a result is present', () => {
    const block: ToolCallBlock = {
      type: 'tool_call',
      id: 'tc',
      name: 'search',
      arguments: {},
      result: { ok: true },
      status: 'success',
    }
    const { container } = render(<ToolCallBlockView block={block} />)
    expect(container.querySelector('[data-section="output"]')).not.toBeNull()
  })

  it('is error-styled and default-expanded when status is error (without inspecting result)', () => {
    const block: ToolCallBlock = {
      type: 'tool_call',
      id: 'tc',
      name: 'bad',
      arguments: {},
      status: 'error',
    }
    const { container } = render(<ToolCallBlockView block={block} defaultOpen={false} />)
    expect(container.querySelector('.chat-row-error')).not.toBeNull()
    expect(screen.getByText('bad').closest('details')).toHaveProperty('open', true)
  })

  it('renders image and audio media', () => {
    const block: ToolCallBlock = {
      type: 'tool_call',
      id: 'tc',
      name: 'gen',
      arguments: {},
      result: {},
      status: 'success',
      media: [
        { kind: 'image', url: 'http://x/i.png' },
        { kind: 'audio', url: 'http://x/a.mp3' },
      ],
    }
    const { container } = render(<ToolCallBlockView block={block} />)
    const image = container.querySelector('.chat-tool-media-image') as HTMLImageElement
    expect(image).toHaveAttribute('src', 'http://x/i.png')
    // Accessible name derived from tool name + kind + position.
    expect(image).toHaveAttribute('alt', 'gen image 1')
    const audio = container.querySelector('.chat-tool-media-audio') as HTMLAudioElement
    expect(audio).toHaveAttribute('src', 'http://x/a.mp3')
    expect(audio).toHaveAttribute('aria-label', 'gen audio 2')
  })

  it('is active (spinner) while running', () => {
    const block: ToolCallBlock = {
      type: 'tool_call',
      id: 'tc',
      name: 'run',
      arguments: {},
      status: 'running',
      startedAt: 0,
    }
    const { container } = render(<ToolCallBlockView block={block} />)
    expect(container.querySelector('[data-affordance="active"]')).not.toBeNull()
  })
})

describe('StatusBlockView', () => {
  it('shows "Generating…" with a live timer while active', () => {
    const block: StatusBlock = { type: 'status', id: 's', phase: 'streaming' }
    render(<StatusBlockView block={block} isActive startedAt={0} tokensPerSecond={5} />)
    expect(screen.getByText('Generating…')).toBeInTheDocument()
    expect(screen.getByText('5.0 tok/s')).toBeInTheDocument()
  })

  it('shows "Starting…" for the pre-stream phase while active', () => {
    const block: StatusBlock = { type: 'status', id: 's', phase: 'pre-stream' }
    render(<StatusBlockView block={block} isActive startedAt={0} />)
    expect(screen.getByText('Starting…')).toBeInTheDocument()
  })

  it('shows "Generated" when complete with the finalized duration', () => {
    const block: StatusBlock = { type: 'status', id: 's', phase: 'complete' }
    render(<StatusBlockView block={block} durationMs={3000} />)
    expect(screen.getByText('Generated')).toBeInTheDocument()
    expect(screen.getByText('3.0s')).toBeInTheDocument()
  })

  it('is non-collapsible (no details element)', () => {
    const block: StatusBlock = { type: 'status', id: 's' }
    const { container } = render(<StatusBlockView block={block} durationMs={1000} />)
    expect(container.querySelector('details')).toBeNull()
  })
})

describe('SystemBlockView', () => {
  it('renders a collapsible system prompt', () => {
    const block: SystemBlock = { type: 'system', id: 'sy', text: 'You are helpful.' }
    render(<SystemBlockView block={block} defaultOpen />)
    expect(screen.getByText('System prompt')).toBeInTheDocument()
    expect(screen.getByText('You are helpful.')).toBeInTheDocument()
  })
})

describe('RawJsonBlockView', () => {
  it('renders a value as JSON', () => {
    const { container } = render(<RawJsonBlockView value={{ a: 1 }} />)
    expect(container.querySelector('.chat-jsonview')).not.toBeNull()
  })
})

describe('BlockView dispatch', () => {
  it('dispatches text', () => {
    const block: TextBlock = { type: 'text', id: 't', text: 'hi' }
    const { container } = render(<BlockView block={block} context={ctx()} />)
    expect(container.querySelector('.chat-text')).not.toBeNull()
  })

  it('dispatches reasoning, marking active only when duration is unknown', () => {
    const block: ReasoningBlock = { type: 'reasoning', id: 'r', text: 'x' }
    render(
      <BlockView
        block={block}
        context={ctx({ isActive: true, activeBlockId: 'r', startedAt: 0 })}
      />,
    )
    expect(screen.getByText('Thinking…')).toBeInTheDocument()
  })

  it('dispatches a non-trailing durationless reasoning block as idle (Reasoning)', () => {
    const block: ReasoningBlock = { type: 'reasoning', id: 'r', text: 'x' }
    // Message active, but the active block is a DIFFERENT (later) block.
    render(
      <BlockView
        block={block}
        context={ctx({ isActive: true, activeBlockId: 'other', startedAt: 0 })}
      />,
    )
    expect(screen.getByText('Reasoning')).toBeInTheDocument()
    expect(screen.queryByText('Thinking…')).toBeNull()
  })

  it('dispatches reasoning as inactive when duration is known even if message active', () => {
    const block: ReasoningBlock = { type: 'reasoning', id: 'r', text: 'x', durationMs: 1000 }
    render(<BlockView block={block} context={ctx({ isActive: true, startedAt: 0 })} />)
    expect(screen.getByText('Thought for 1.0s')).toBeInTheDocument()
  })

  it('dispatches tool_call', () => {
    const block: ToolCallBlock = {
      type: 'tool_call',
      id: 'tc',
      name: 'n',
      arguments: {},
      status: 'success',
    }
    render(<BlockView block={block} context={ctx()} />)
    expect(screen.getByText('n')).toBeInTheDocument()
  })

  it('dispatches status', () => {
    const block: StatusBlock = { type: 'status', id: 's' }
    render(
      <BlockView
        block={block}
        context={ctx({ isActive: true, activeBlockId: 's', startedAt: 0 })}
      />,
    )
    expect(screen.getByText('Generating…')).toBeInTheDocument()
  })

  it('dispatches system', () => {
    const block: SystemBlock = { type: 'system', id: 'sy', text: 'sys' }
    render(<BlockView block={block} context={ctx()} />)
    expect(screen.getByText('System prompt')).toBeInTheDocument()
  })
})
