// @vitest-environment node
import type { ChatMessage, LivePhase } from '@fx-/chat-core'
import { renderToString } from 'ink'
import { cleanup, render } from 'ink-testing-library'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InkChatProvider } from '../registry'
import { isTerminalReport } from '../terminal'
import { asciiGlyphs } from '../theme'
import { plainTheme } from '../theme'
import { Lines, spanProps, splitRuns } from './Lines'
import { EmptyState, PendingRows, StatusLine } from './Status'
import {
  type Geometry,
  TranscriptViewport,
  firstLine,
  pageBy,
  scrollBy,
  scrollEnd,
  scrollHome,
} from './Viewport'
import { threadedFrame } from './frames'
import { span } from './model'

const actEnv = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
beforeEach(() => {
  vi.useFakeTimers()
  actEnv.IS_REACT_ACT_ENVIRONMENT = true
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  actEnv.IS_REACT_ACT_ENVIRONMENT = false
})

const str = (node: React.ReactElement, width = 40) =>
  renderToString(<InkChatProvider>{node}</InkChatProvider>, { columns: width })

const many = (n: number): ChatMessage[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    role: 'user',
    blocks: [{ type: 'text', id: `t${i}`, text: `line ${i}` }],
  }))

describe('scroll helpers', () => {
  const g: Geometry = { total: 100, first: 90, rows: 10, below: 0 }
  it('clamps, pages with context, and returns to follow at the bottom', () => {
    expect(firstLine(scrollEnd, 100, 10)).toBe(90)
    expect(firstLine({ follow: false, top: 500 }, 100, 10)).toBe(90)
    expect(firstLine({ follow: false, top: -5 }, 100, 10)).toBe(0)
    expect(scrollBy(scrollEnd, -3, g)).toEqual({ follow: false, top: 87 })
    expect(scrollBy({ follow: false, top: 88 }, 5, g)).toEqual(scrollEnd)
    expect(pageBy(scrollEnd, -1, g)).toEqual({ follow: false, top: 82 })
    expect(pageBy(scrollHome, 1, { ...g, rows: 1 })).toEqual({ follow: false, top: 1 })
    expect(isTerminalReport('\u001b[<0;10;5M')).toBe(true)
    expect(isTerminalReport('[6;18;9t')).toBe(true)
    expect(isTerminalReport('a')).toBe(false)
  })
})

describe('Lines', () => {
  it('splits runs to keep width measurement cheap', () => {
    expect(splitRuns('ab│cd')).toEqual(['ab', '│', 'cd'])
    expect(splitRuns('──────────')).toEqual(['────────', '──'])
    expect(splitRuns('日本x')).toEqual(['日本', 'x'])
    expect(splitRuns('')).toEqual([])
  })

  it('resolves span props over the role', () => {
    expect(
      spanProps(
        span('x', {
          role: 'muted',
          bold: true,
          italic: true,
          underline: true,
          strike: true,
          inverse: true,
          color: 'red',
          style: { color: 'blue' },
        }),
        plainTheme,
        { inverse: false },
      ),
    ).toEqual({
      color: 'red',
      dimColor: true,
      bold: true,
      italic: true,
      underline: true,
      strikethrough: true,
    })
  })

  it('draws lines and empty lines, with overrides', () => {
    const lines = [
      {
        spans: [span('hello ', { role: 'strong' }), span('──', { chrome: true })],
        owner: { messageId: 'm' },
      },
      { spans: [], owner: { messageId: 'm' } },
    ]
    expect(str(<Lines lines={lines} theme={plainTheme} />)).toBe('hello ──\n')
    expect(
      str(
        <Lines
          lines={lines}
          theme={plainTheme}
          override={(_l, i) => (i === 1 ? <></> : undefined)}
        />,
      ),
    ).toBe('hello ──')
  })
})

describe('TranscriptViewport', () => {
  it('follows the bottom, pins while reading, and reports geometry', () => {
    const onGeometry = vi.fn()
    const view = render(
      <InkChatProvider>
        <TranscriptViewport
          messages={many(10)}
          width={20}
          height={4}
          scroll={scrollEnd}
          onScroll={vi.fn()}
          onGeometry={onGeometry}
        />
      </InkChatProvider>,
    )
    expect(view.lastFrame()).toContain('› line 9')
    expect(onGeometry).toHaveBeenLastCalledWith({ total: 20, first: 16, rows: 4, below: 0 })
    view.rerender(
      <InkChatProvider>
        <TranscriptViewport
          messages={many(12)}
          width={20}
          height={4}
          scroll={{ follow: false, top: 0 }}
          onScroll={vi.fn()}
          onGeometry={onGeometry}
        />
      </InkChatProvider>,
    )
    expect(view.lastFrame()).toContain('› line 0')
    expect(onGeometry).toHaveBeenLastCalledWith({ total: 24, first: 0, rows: 4, below: 20 })
  })

  it('keeps its image hook while what it reads holds, so finished layouts stay cached', () => {
    const markdown = vi.fn((source: string) => [{ spans: [span(source)] }])
    const provider = {
      get: () => undefined,
      allow: vi.fn(),
      version: 0,
      subscribe: () => () => {},
    }
    const answer: ChatMessage = {
      id: 'a',
      role: 'assistant',
      blocks: [{ type: 'text', id: 't', text: 'hello' }],
    }
    const view = (height: number) => (
      <InkChatProvider>
        <TranscriptViewport
          messages={[answer]}
          width={20}
          height={height}
          scroll={scrollEnd}
          onScroll={vi.fn()}
          markdown={markdown}
          images={provider}
        />
      </InkChatProvider>
    )
    const ui = render(view(4))
    const calls = markdown.mock.calls.length
    ui.rerender(view(4))
    ui.rerender(view(4))
    expect(markdown.mock.calls.length).toBe(calls)
    // The image height cap reads the viewport height.
    ui.rerender(view(12))
    expect(markdown.mock.calls.length).toBe(calls + 1)
    expect(ui.lastFrame()).toContain('hello')
  })

  it('spins a running tool row and a live plan entry on the shared clock', async () => {
    vi.setSystemTime(0)
    const running: ChatMessage = {
      id: 'a',
      role: 'assistant',
      createdAt: 0,
      blocks: [
        {
          type: 'plan',
          id: 'p',
          entries: [{ content: 'step', status: 'in_progress' }],
        },
        { type: 'tool_call', id: 't', name: 'fetch', arguments: {}, status: 'running' },
      ],
    }
    const view = render(
      <InkChatProvider>
        <TranscriptViewport
          messages={[running]}
          streamingMessageId="a"
          width={30}
          height={6}
          scroll={scrollEnd}
          onScroll={vi.fn()}
        />
      </InkChatProvider>,
    )
    expect(view.lastFrame()).toContain('⠋ fetch')
    expect(view.lastFrame()).toContain('⠋ step')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(view.lastFrame()).toContain('⠙ fetch')
    expect(view.lastFrame()).toContain('⠙ step')
    view.rerender(
      <InkChatProvider>
        <TranscriptViewport
          messages={[{ ...running, outcome: { kind: 'stopped' } }]}
          detail="details"
          width={30}
          height={6}
          scroll={scrollEnd}
          onScroll={vi.fn()}
        />
      </InkChatProvider>,
    )
    expect(view.lastFrame()).toContain('· fetch')
    expect(view.lastFrame()).toContain('… step')
  })

  it('renders the empty state and threaded frames', () => {
    expect(
      str(
        <TranscriptViewport
          messages={[]}
          width={20}
          height={3}
          scroll={scrollEnd}
          onScroll={vi.fn()}
          empty={<EmptyState title="Hi" />}
        />,
        20,
      ),
    ).toContain('Hi')
    const out = str(
      <TranscriptViewport
        messages={many(1)}
        width={30}
        height={5}
        scroll={scrollEnd}
        onScroll={vi.fn()}
        frame={threadedFrame}
        accentFor={() => ({ color: 'cyan' })}
      />,
      30,
    )
    expect(out).toContain('│ line 0')
  })

  it('handles page, line, home/end and detail keys, ignoring terminal reports', async () => {
    const onScroll = vi.fn()
    const onDetailChange = vi.fn()
    const view = render(
      <InkChatProvider>
        <TranscriptViewport
          messages={many(20)}
          width={20}
          height={4}
          scroll={scrollEnd}
          onScroll={onScroll}
          onDetailChange={onDetailChange}
          detail="full"
          keys={{ homeEnd: true }}
        />
      </InkChatProvider>,
    )
    const press = async (k: string) => {
      await act(async () => {
        view.stdin.write(k)
        await vi.advanceTimersByTimeAsync(20)
      })
    }
    await press('\u001b[5~')
    await press('\u001b[6~')
    await press('\u001b[1;2A')
    await press('\u001b[1;2B')
    await press('\u001b[H')
    await press('\u001b[F')
    await press('\u0014')
    await press('\u001b[<0;3;4M')
    expect(onScroll.mock.calls.map((c) => c[0])).toEqual([
      { follow: false, top: 34 },
      scrollEnd,
      { follow: false, top: 33 },
      scrollEnd,
      scrollHome,
      scrollEnd,
    ])
    expect(onDetailChange).toHaveBeenCalledWith('collapsed')
    view.unmount()
    const off = render(
      <InkChatProvider>
        <TranscriptViewport
          messages={many(20)}
          width={20}
          height={4}
          scroll={scrollEnd}
          onScroll={onScroll}
          keys={false}
        />
      </InkChatProvider>,
    )
    onScroll.mockClear()
    await act(async () => {
      off.stdin.write('\u001b[5~')
      await vi.advanceTimersByTimeAsync(20)
    })
    expect(onScroll).not.toHaveBeenCalled()
  })

  it('toggles rows uncontrolled and ticks the live clock', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(10_000)
    const live: ChatMessage = {
      id: 'l',
      role: 'assistant',
      createdAt: 9_000,
      blocks: [{ type: 'text', id: 'x', text: 'hi' }],
    }
    let view = undefined as unknown as ReturnType<typeof render>
    await act(async () => {
      view = render(
        <InkChatProvider components={{ glyphs: asciiGlyphs }}>
          <TranscriptViewport
            messages={[live]}
            width={20}
            height={4}
            scroll={scrollEnd}
            onScroll={vi.fn()}
            streamingMessageId="l"
          />
        </InkChatProvider>,
      )
    })
    expect(view.lastFrame()).toContain('1s')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(view.lastFrame()).toContain('3s')
  })
})

describe('StatusLine, PendingRows, EmptyState', () => {
  const live: ChatMessage = {
    id: 'l',
    role: 'assistant',
    blocks: [
      {
        type: 'tool_call',
        id: 't',
        name: 'x',
        title: 'Read a very long file name that goes on',
        arguments: {},
        status: 'running',
      },
    ],
  }

  it('names a running tool by its label and input', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(5_000)
    const shell: ChatMessage = {
      ...live,
      blocks: [
        {
          type: 'tool_call',
          id: 't',
          name: 'shell',
          title: 'Running',
          inputSummary: 'sleep 2 && echo done && echo more',
          arguments: {},
          status: 'running',
        },
      ],
    }
    expect(str(<StatusLine width={80} live={{ message: shell, startedAt: 0 }} />, 80)).toContain(
      'running Running sleep 2 && echo done &&… · 5s',
    )
  })

  it('names a nameless running call by the row’s fallback label', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(5_000)
    const nameless = (inputSummary?: string): ChatMessage => ({
      ...live,
      blocks: [
        {
          type: 'tool_call',
          id: 't',
          name: ' ',
          title: '',
          ...(inputSummary ? { inputSummary } : {}),
          arguments: {},
          status: 'running',
        },
      ],
    })
    const line = (m: ChatMessage) =>
      str(<StatusLine width={80} live={{ message: m, startedAt: 0 }} />, 80)
    expect(line(nameless())).toContain('●·· running tool · 5s')
    expect(line(nameless('ls -la'))).toContain('●·· running tool ls -la · 5s')
  })

  it('says a call awaits approval rather than running', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(5_000)
    const blocked: ChatMessage = {
      ...live,
      blocks: [
        {
          type: 'tool_call',
          id: 't',
          name: 'shell',
          inputSummary: 'rm -rf x',
          arguments: {},
          status: 'pending',
          approval: { state: 'pending' },
        },
      ],
    }
    expect(str(<StatusLine width={80} live={{ message: blocked, startedAt: 0 }} />, 80)).toContain(
      'awaiting approval shell rm -rf x · 5s',
    )
  })

  it('shows the pulse, phase, elapsed, tools, slow hint and extras while live', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(70_000)
    const out = str(
      <StatusLine
        width={120}
        live={{ message: live, startedAt: 0 }}
        extras={['2 queued', '^X stop']}
        slowHint={{ afterMs: 60_000, text: 'still starting', phases: ['tool'] }}
      />,
      120,
    )
    expect(out).toMatch(
      /^── ●·· running Read a very long file name that… · 1m 10s · 1 tool · still starting · 2 queued · \^X stop ─+$/,
    )
    expect(out).toHaveLength(120)
    const custom = str(
      <StatusLine
        width={60}
        live={{ message: { ...live, blocks: [] }, startedAt: 69_000 }}
        phaseLabel={(p: LivePhase) => (p.kind === 'waiting' ? 'connecting' : undefined)}
      />,
      60,
    )
    expect(custom).toContain('connecting · 1s')
    expect(
      str(
        <StatusLine
          width={60}
          live={{
            message: { ...live, blocks: [{ type: 'reasoning', id: 'r', text: 'x' }] },
            startedAt: 69_000,
          }}
        />,
        60,
      ),
    ).toContain('thinking')
    expect(
      str(
        <StatusLine
          width={60}
          live={{
            message: { ...live, blocks: [{ type: 'text', id: 'x', text: 'x' }] },
            startedAt: 69_000,
          }}
        />,
        60,
      ),
    ).toContain('writing')
  })

  it('shows notices, the lines below, a plain rule, and cuts to the width', () => {
    const copied = str(<StatusLine width={30} notice={{ text: 'Copied', tone: 'positive' }} />, 30)
    expect(copied).toMatch(/^── ✓ Copied ─+$/)
    expect(copied).toHaveLength(30)
    expect(
      str(<StatusLine width={30} notice={{ text: 'Failed', tone: 'danger' }} />, 30),
    ).toContain('✗ Failed')
    expect(str(<StatusLine width={20} below={7} />, 20)).toBe('── ↓ 7 more ────────')
    expect(str(<StatusLine width={40} idle="turn done" below={3} />, 40)).toBe(
      '── turn done · ↓ 3 more ────────────────',
    )
    expect(str(<StatusLine width={20} idle="idle" />, 20)).toBe('── idle ────────────')
    expect(str(<StatusLine width={10} />, 10)).toBe('──────────')
    expect(
      str(<StatusLine width={12} notice={{ text: 'a very long notice', tone: 'positive' }} />, 12),
    ).toBe('── ✓ a very…')
  })

  it('lists queued messages and draws an empty state', () => {
    const items = [
      { text: 'one' },
      { text: 'two\nlines', attachments: 2 },
      { text: 'three' },
      { text: 'four' },
    ]
    expect(str(<PendingRows items={items} width={30} />, 30)).toBe(
      '‖ +1 · ⊕2 two lines\n‖ three\n‖ four',
    )
    expect(str(<PendingRows items={[]} width={30} />, 30)).toBe('')
    expect(str(<EmptyState title="Ready" subtitle="model" notes={['a', 'b']} />, 20)).toContain(
      'Ready',
    )
  })
})
