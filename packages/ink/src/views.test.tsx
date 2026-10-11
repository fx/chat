// @vitest-environment node
import type { ChatMessage, ContentBlock, CustomBlock, RenderableMessage } from '@fx/chat-core'
import { Text, renderToString } from 'ink'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageView } from './MessageView'
import { Row, clipLines, toJson } from './Row'
import { Transcript } from './Transcript'
import {
  InkChatProvider,
  PlainMarkdown,
  Styled,
  appearanceProps,
  mergeInkComponents,
  plainComponents,
} from './registry'
import { renderInk, tick } from './test-helpers'

const str = (node: ReactElement, components = {}) =>
  renderToString(<InkChatProvider components={components}>{node}</InkChatProvider>, {
    columns: 80,
  }).trimEnd()

const finished: ChatMessage = {
  id: 'a',
  role: 'assistant',
  createdAt: 1000,
  metrics: { model: 'm-1', durationMs: 2400, tokensPerSecond: 42 },
  blocks: [
    { type: 'reasoning', id: 'r', text: 'step one\nstep two', startedAt: 1000, durationMs: 1200 },
    {
      type: 'tool_call',
      id: 't',
      name: 'calc',
      arguments: { x: 1 },
      result: { y: 2 },
      status: 'success',
      durationMs: 5,
    },
    { type: 'text', id: 'x', text: 'Answer' },
  ],
}

afterEach(() => vi.useRealTimers())

describe('registry', () => {
  it('merges partial registries and maps appearances', () => {
    const merged = mergeInkComponents(plainComponents, {
      theme: { user: { color: 'cyan' } },
      glyphs: { user: '>' },
      spinnerIntervalMs: 10,
    })
    expect(merged.theme.user).toEqual({ color: 'cyan' })
    expect(merged.theme.muted).toEqual({ dim: true })
    expect(merged.glyphs.user).toBe('>')
    expect(merged.Markdown).toBe(PlainMarkdown)
    expect(mergeInkComponents(plainComponents)).toEqual(plainComponents)
    expect(
      appearanceProps({ color: 'red', dim: true, bold: true, italic: true, inverse: true }),
    ).toEqual({
      color: 'red',
      dimColor: true,
      bold: true,
      italic: true,
      inverse: true,
    })
    expect(appearanceProps({})).toEqual({})
  })

  it('renders styled text without a provider using the plain theme', () => {
    expect(renderToString(<Styled tone="content">hi</Styled>)).toBe('hi')
    expect(
      renderToString(
        <Styled tone="content" wrap="truncate-end">
          hi
        </Styled>,
      ),
    ).toBe('hi')
  })
})

describe('Row helpers', () => {
  it('clips long text and serializes values', () => {
    expect(clipLines('a\nb\nc', 2)).toBe('a\nb\n… 1 more lines')
    expect(clipLines('a', 2)).toBe('a')
    expect(toJson('s')).toBe('s')
    expect(toJson({ a: 1 })).toBe('{\n  "a": 1\n}')
    expect(toJson(undefined)).toBe('undefined')
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(toJson(circular)).toBe('[object Object]')
  })

  it('shows a caret for a bodied row and an error marker', () => {
    expect(
      str(
        <Row label="x">
          <Text>body</Text>
        </Row>,
      ),
    ).toBe('▸ x')
    expect(
      str(
        <Row label="x" expanded>
          <Text>body</Text>
        </Row>,
      ),
    ).toBe('▾ x\n  body')
    expect(str(<Row label="x" error />)).toBe('  x ✗ Error')
  })

  it('animates a spinner and timer while active, then flashes a check', async () => {
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'],
    })
    vi.setSystemTime(10_000)
    const view = renderInk(
      <Row label="run" isActive showTimer startedAt={9_000} tokensPerSecond={12} />,
    )
    expect(view.lastFrame()).toBe('⠋ run 1.0s 12.0 tok/s')
    await vi.advanceTimersByTimeAsync(250)
    expect(view.lastFrame()).toMatch(/^⠸ run 1\.2s/)
    view.rerender(
      <InkChatProvider>
        <Row label="run" showTimer durationMs={1300} />
      </InkChatProvider>,
    )
    await vi.advanceTimersByTimeAsync(10)
    expect(view.lastFrame()).toBe('✓ run 1.3s')
    await vi.advanceTimersByTimeAsync(2000)
    view.rerender(
      <InkChatProvider>
        <Row label="run" showTimer durationMs={1300} />
      </InkChatProvider>,
    )
    await vi.advanceTimersByTimeAsync(100)
    expect(view.lastFrame()).toBe('  run 1.3s')
    view.unmount()
  })
})

describe('MessageView', () => {
  it('renders a finished turn collapsed with footer metrics', () => {
    expect(str(<MessageView message={finished} />)).toBe(
      '• ▸ (+1) ⚒ calc 42.0 tok/s\n  Answer\n  2.4s · ∴ 17 · ⚒ 1 tool · m-1 · 42.0 tok/s',
    )
  })

  it('expands group bodies, clipping to bodyLines', () => {
    const out = str(<MessageView message={finished} expanded bodyLines={1} />)
    expect(out).toContain('▾ ∴ Thought for 1.2s')
    expect(out).toContain('step one\n      … 1 more lines')
    expect(out).toContain('input')
    expect(out).toContain('output')
  })

  it('renders user text and attachments, without a footer', () => {
    const user: ChatMessage = {
      id: 'u',
      role: 'user',
      blocks: [{ type: 'text', id: 't', text: 'hello' }],
      attachments: [
        { url: 'data:x', mediaType: 'image/png', kind: 'image', name: 'cat.png' },
        { url: 'u2', mediaType: 'application/pdf', kind: 'file' },
      ],
    }
    expect(str(<MessageView message={user} />)).toBe(
      '› hello\n  [image] cat.png\n  [file] application/pdf',
    )
  })

  it('shows the pending row for an active empty turn', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(5000)
    const pending: ChatMessage = { id: 'p', role: 'assistant', blocks: [], createdAt: 4000 }
    expect(str(<MessageView message={pending} isActive />)).toMatch(/^• ⠋ Starting… 1\.0s/)
  })

  it('renders a live trailing status with the rate, and errors in tool output', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(3000)
    const live: ChatMessage = {
      id: 'l',
      role: 'assistant',
      createdAt: 1000,
      blocks: [
        { type: 'text', id: 'x', text: 'abcdefghijklmnopqrstuvwxyz'.repeat(4) },
        {
          type: 'tool_call',
          id: 't',
          name: '',
          arguments: {},
          status: 'error',
          result: { error: 'no' },
        },
        { type: 'status', id: 's', phase: 'streaming' },
      ],
    }
    const out = str(<MessageView message={live} isActive expanded />)
    expect(out).toContain('⠋ Generating… 2.0s')
    expect(out).toContain('tool ✗ Error')
    expect(out).toContain('"error": "no"')
    const done = str(<MessageView message={{ ...live, blocks: live.blocks.slice(0, 2) }} />)
    expect(done).toContain('▸ ⚒ tool ✗ Error')
    expect(
      str(
        <MessageView
          message={{ ...live, blocks: [{ type: 'status', id: 's', phase: 'complete' }] }}
        />,
      ),
    ).toBe('•   Generated')
  })

  it('renders reasoning with no text, system prompts and minimal mode', () => {
    const m: ChatMessage = {
      id: 's',
      role: 'assistant',
      blocks: [
        { type: 'system', id: 'sys', text: 'Be brief.' },
        { type: 'reasoning', id: 'r', text: '' },
        { type: 'text', id: 'x', text: 'ok' },
        { type: 'reasoning', id: 'r2', text: 'more', durationMs: 100 },
      ],
    }
    const out = str(<MessageView message={m} minimal expanded showFooter={false} />)
    expect(out).toContain('▾ ⚙ System prompt\n    Be brief.')
    expect(out).toContain('(+1)')
    expect(out).not.toContain('·')
  })

  it('renders custom blocks through host renderers or as an inert label', () => {
    const custom: RenderableMessage = {
      id: 'c',
      role: 'assistant',
      blocks: [
        { type: 'chart', id: 'c1', label: 'Sales chart' } as CustomBlock,
        { type: 'note', id: 'c2' } as CustomBlock,
        { type: 'constructor', id: 'c3' } as CustomBlock,
      ],
    }
    const Note = ({ block, isStreaming }: { block: CustomBlock; isStreaming: boolean }) => (
      <Text>
        note:{block.id}:{String(isStreaming)}
      </Text>
    )
    const out = str(
      <MessageView message={custom} extensions={{ blockRenderers: { note: Note } }} />,
    )
    expect(out).toContain('Sales chart')
    expect(out).toContain('note:c2:false')
    expect(out).toContain('constructor')
    expect(str(<MessageView message={custom} />)).toContain('note')
  })
})

describe('Transcript', () => {
  const user: ChatMessage = {
    id: 'u',
    role: 'user',
    blocks: [{ type: 'text', id: 't', text: 'q' }],
  }

  it('prints finished messages statically and the live turn below', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(2000)
    const live: ChatMessage = {
      ...finished,
      id: 'live',
      metrics: undefined as never,
      blocks: [{ type: 'text', id: 'x', text: 'part' }],
    }
    const out = str(
      <Transcript
        messages={[user, live]}
        isStreaming
        streamingMessageId="live"
        bodyLines={3}
        extensions={{}}
        expanded
      />,
    )
    expect(out).toContain('› q')
    expect(out).toContain('• part')
    expect(out).not.toContain('·')
  })

  it('treats everything as finished when not streaming or the id is unknown', () => {
    expect(
      str(<Transcript messages={[user, finished]} expandFinished minimal showFooter={false} />),
    ).toContain('› q')
    expect(str(<Transcript messages={[user]} isStreaming streamingMessageId="nope" />)).toBe('› q')
  })

  it('appends to static output as messages finish', async () => {
    const view = renderInk(<Transcript messages={[user]} />)
    await tick()
    view.rerender(
      <InkChatProvider>
        <Transcript messages={[user, finished]} />
      </InkChatProvider>,
    )
    await tick()
    expect(view.frames.join('')).toContain('Answer')
    view.unmount()
  })
})

describe('MessageView edge cases', () => {
  it('renders a pending tool expanded with no output, single-item groups, and idle groups in a live turn', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(2000)
    const live: ChatMessage = {
      id: 'l',
      role: 'assistant',
      createdAt: 1000,
      blocks: [
        { type: 'reasoning', id: 'r', text: 'x', durationMs: 10 },
        { type: 'tool_call', id: 't', name: 'calc', arguments: {}, status: 'success' },
        { type: 'text', id: 'x', text: 'mid' },
        { type: 'tool_call', id: 't2', name: 'slow', arguments: { q: 1 }, status: 'running' },
      ],
    }
    const out = str(<MessageView message={live} isActive expanded />)
    expect(out).toContain('▾ (+1) ⚒ calc')
    expect(out).not.toContain('tok/s')
    expect(out).toContain('⠋ ⚒ slow')
    expect(out).not.toContain('output')
    const minimal = str(
      <MessageView
        message={{
          ...live,
          blocks: [live.blocks[0] as ContentBlock, live.blocks[2] as ContentBlock],
        }}
        minimal
      />,
    )
    expect(minimal).toContain('▸ ∴ Thought for 0.0s')
    expect(minimal).not.toContain('(+')
  })

  it('tolerates an empty spinner frame list', () => {
    expect(str(<Row label="x" isActive />, { glyphs: { spinner: [] } })).toBe(' x')
  })

  it('exposes the public entry point', async () => {
    const entry = await import('./index')
    expect(Object.keys(entry)).toEqual(
      expect.arrayContaining(['Transcript', 'Composer', 'InkChatProvider', 'MessageView']),
    )
  })
})

describe('injection', () => {
  it('uses injected glyphs, theme and markdown', () => {
    const Markdown = ({ content, streaming }: { content: string; streaming?: boolean }) => (
      <Text>
        md[{content}]{streaming ? '…' : ''}
      </Text>
    )
    const blocks: ContentBlock[] = [{ type: 'text', id: 'x', text: 'hi' }]
    const out = str(<MessageView message={{ id: 'a', role: 'assistant', blocks }} isActive />, {
      Markdown,
      glyphs: { assistant: 'A:' },
    })
    expect(out).toBe('A: md[hi]…')
  })
})
