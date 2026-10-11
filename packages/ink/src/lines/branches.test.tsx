// @vitest-environment node
import type { ChatMessage, ContentBlock } from '@fx/chat-core'
import { Text, renderToString } from 'ink'
import { describe, expect, it } from 'vitest'
import { InkChatProvider } from '../registry'
import { useFakeClock } from '../test-helpers'
import { plainGlyphs, plainTheme } from '../theme'
import { Lines } from './Lines'
import { StatusLine } from './Status'
import { TranscriptViewport, scrollEnd, useOpenState, viewportKeyAction } from './Viewport'
import { compactFrame, threadedFrame } from './frames'
import {
  type LayoutContext,
  NOTHING_OPEN,
  layoutBody,
  layoutMessage,
  plainMarkdownLayout,
} from './layout'
import { defaultMeasure } from './measure'
import { span } from './model'
import { createLayoutCache } from './transcript'

// A frozen clock: live rows measure elapsed time against it, not the wall clock.
useFakeClock()

const ctx = (extra: Partial<LayoutContext> = {}): LayoutContext => ({
  width: 40,
  detail: 'collapsed',
  placement: 'inline',
  liveTail: 3,
  isActive: () => false,
  now: 20_000,
  opened: NOTHING_OPEN,
  markdown: plainMarkdownLayout,
  glyphs: plainGlyphs,
  theme: plainTheme,
  hints: {},
  liveFooter: true,
  frame: compactFrame,
  measure: defaultMeasure,
  ...extra,
})
const text = (lines: Array<{ spans: Array<{ text: string }> }>) =>
  lines.map((l) => l.spans.map((s) => s.text).join(''))
const msg = (blocks: ContentBlock[], extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'a',
  role: 'assistant',
  createdAt: 10_000,
  blocks,
  ...extra,
})
const tool = (extra: Partial<Extract<ContentBlock, { type: 'tool_call' }>> = {}): ContentBlock => ({
  type: 'tool_call',
  id: 't',
  name: 'run',
  arguments: {},
  status: 'success',
  ...extra,
})

describe('viewportKeyAction', () => {
  const g = { total: 50, first: 40, rows: 10, below: 0 }
  const k = (extra: Record<string, boolean>) => ({
    pageUp: false,
    pageDown: false,
    shift: false,
    upArrow: false,
    downArrow: false,
    home: false,
    end: false,
    ctrl: false,
    ...extra,
  })
  it('maps keys to scroll and detail actions', () => {
    expect(viewportKeyAction('', k({ pageUp: true }), {}, scrollEnd, g, 'collapsed')).toEqual({
      scroll: { follow: false, top: 32 },
    })
    expect(viewportKeyAction('', k({ pageDown: true }), {}, scrollEnd, g, 'collapsed')).toEqual({
      scroll: scrollEnd,
    })
    expect(
      viewportKeyAction('', k({ shift: true, upArrow: true }), {}, scrollEnd, g, 'collapsed'),
    ).toEqual({ scroll: { follow: false, top: 37 } })
    expect(
      viewportKeyAction('', k({ shift: true, downArrow: true }), {}, scrollEnd, g, 'collapsed'),
    ).toEqual({ scroll: scrollEnd })
    expect(
      viewportKeyAction('', k({ home: true }), { homeEnd: true }, scrollEnd, g, 'collapsed'),
    ).toEqual({ scroll: { follow: false, top: 0 } })
    expect(
      viewportKeyAction('', k({ end: true }), { homeEnd: true }, scrollEnd, g, 'collapsed'),
    ).toEqual({ scroll: scrollEnd })
    expect(viewportKeyAction('t', k({ ctrl: true }), {}, scrollEnd, g, 'details')).toEqual({
      detail: 'full',
    })
    expect(
      viewportKeyAction('t', k({ ctrl: true }), { detail: false }, scrollEnd, g, 'details'),
    ).toBeUndefined()
    expect(
      viewportKeyAction('', k({ pageUp: true }), { page: false }, scrollEnd, g, 'collapsed'),
    ).toBeUndefined()
    expect(
      viewportKeyAction(
        '',
        k({ shift: true, upArrow: true }),
        { lines: false },
        scrollEnd,
        g,
        'collapsed',
      ),
    ).toBeUndefined()
    expect(viewportKeyAction('', k({ home: true }), {}, scrollEnd, g, 'collapsed')).toBeUndefined()
    expect(viewportKeyAction('[<0;1;1M', k({}), {}, scrollEnd, g, 'collapsed')).toBeUndefined()
    expect(
      viewportKeyAction('', k({ pageUp: true }), false, scrollEnd, g, 'collapsed'),
    ).toBeUndefined()
  })
})

describe('layout branches', () => {
  it('covers tool rows: running live/idle, nameless, long labels with input, no result', () => {
    const live = text(
      layoutBody(
        msg([tool({ status: 'running', name: '', arguments: { command: 'x' } })]),
        40,
        ctx({ isActive: () => true }),
      ),
    )
    expect(live[0]).toBe('⠋ tool x')
    const idle = text(layoutBody(msg([tool({ status: 'pending' })]), 40, ctx()))
    expect(idle[0]).toBe('· run')
    const long = text(
      layoutBody(
        msg([
          tool({
            title: 'A long title that is quite long',
            arguments: { command: 'and a long command' },
          }),
        ]),
        30,
        ctx(),
      ),
    )
    expect(long[0]).toBe('✓ A long title that is quite …')
    const cutInput = text(
      layoutBody(
        msg([tool({ title: 'Short', arguments: { command: 'a long command that is cut' } })]),
        24,
        ctx(),
      ),
    )
    expect(cutInput[0]).toBe('✓ Short a long command …')
    expect(text(layoutBody(msg([tool()]), 40, ctx({ detail: 'details' })))).toEqual(['✓ run'])
  })

  it('covers reasoning, status, system, plan and group details', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'reasoning',
        id: 'r',
        text: 'a long line of thinking that wraps around',
        startedAt: 15_000,
        durationMs: 900,
      },
      { type: 'status', id: 's', phase: 'complete' },
    ]
    const details = text(
      layoutBody(
        msg(blocks, { metrics: { durationMs: 4000, tokensPerSecond: 12 } }),
        20,
        ctx({ detail: 'details' }),
      ),
    )
    expect(details[0]).toBe('▾ (+1) ✻ … 12.0 tok/s')
    expect(details[1]).toMatch(/^ {2}▾ ✻ Thought/)
    const collapsed = text(
      layoutBody(msg(blocks, { metrics: { durationMs: 4000, tokensPerSecond: 12 } }), 60, ctx()),
    )
    expect(collapsed[0]).toBe('▸ (+1) ✻ Thought for 0.9s 12.0 tok/s')
    const statusOnly = text(
      layoutBody(
        msg(
          [
            { type: 'status', id: 's1' },
            { type: 'status', id: 's2' },
          ],
          { metrics: { durationMs: 2000 } },
        ),
        40,
        ctx(),
      ),
    )
    expect(statusOnly[0]).toBe('▸ (+1) Status 2.0s')
    const liveGroup = text(
      layoutBody(
        msg([
          { type: 'reasoning', id: 'r', text: 'x', durationMs: 1 },
          tool({ status: 'running', startedAt: 18_000 }),
        ]),
        40,
        ctx({ isActive: () => true, detail: 'details' }),
      ),
    )
    expect(liveGroup[0]).toMatch(/^. \(\+1\) 🔧?ƒ run$|^. \(\+1\) ƒ run$/)
    const system = text(
      layoutBody(msg([{ type: 'system', id: 'sy', text: 'Be brief.' }]), 40, ctx()),
    )
    expect(system).toEqual(['  § System prompt'])
    const plan = text(
      layoutBody(
        msg([{ type: 'plan', id: 'p', entries: [{ content: 'doing', status: 'in_progress' }] }]),
        40,
        ctx({ isActive: () => true }),
      ),
    )
    expect(plan).toEqual(['  ☐ Plan 0/1', '  ⠋ doing'])
    const spinnerless = text(
      layoutBody(
        msg([]),
        40,
        ctx({ isActive: () => true, glyphs: { ...plainGlyphs, spinner: [] } }),
      ),
    )
    expect(spinnerless[0]).toBe(' Starting… 10s')
    const thinking = text(
      layoutBody(
        msg([{ type: 'reasoning', id: 'r', text: 'x' }]),
        40,
        ctx({ isActive: () => true }),
      ),
    )
    expect(thinking[0]).toMatch(/Thinking… 10s$/)
  })

  it('wraps long paragraphs and frames multi-line bodies', () => {
    const long = msg([{ type: 'text', id: 'x', text: 'one two three four five six seven' }])
    const lines = layoutMessage(long, ctx({ width: 14 }))
    expect(text(lines)).toEqual(['• one two', '  three four', '  five six', '  seven', ''])
    expect(lines[1]?.wrap).toBe('soft')
    const user: ChatMessage = {
      id: 'u',
      role: 'user',
      blocks: [{ type: 'text', id: 't', text: 'a fairly long question here' }],
    }
    const boxed = layoutMessage(user, ctx({ width: 16, frame: threadedFrame }))
    expect(boxed.some((l) => l.wrap === 'soft')).toBe(true)
    expect(
      text(
        layoutMessage(msg([{ type: 'text', id: 'x', text: 'hi' }]), ctx({ frame: threadedFrame })),
      ),
    ).toEqual(['│', '│ hi', '╰', ''])
    expect(
      text(
        layoutBody(
          {
            id: 'u',
            role: 'user',
            blocks: [{ type: 'text', id: 't', text: 'wrap me please now' }],
          },
          8,
          ctx(),
        ),
      )[1],
    ).toBe('please')
  })

  it('keys the cache on the live footer', () => {
    const cache = createLayoutCache()
    const m = msg([{ type: 'text', id: 'x', text: 'y' }])
    cache.get(m, ctx())
    cache.get(m, ctx({ liveFooter: false }))
    expect(cache.misses).toBe(2)
  })
})

describe('component branches', () => {
  const str = (node: React.ReactElement, width = 40) =>
    renderToString(<InkChatProvider>{node}</InkChatProvider>, { columns: width })

  it('draws dim spans and status line variants', () => {
    expect(
      str(
        <Lines
          lines={[{ spans: [span('dim', { dim: true })], owner: { messageId: 'm' } }]}
          theme={plainTheme}
        />,
      ),
    ).toBe('dim')
    const live: ChatMessage = {
      id: 'l',
      role: 'assistant',
      blocks: [tool({ id: 'a' }), tool({ id: 'b' })],
    }
    expect(
      str(<StatusLine width={60} live={{ message: live, startedAt: Date.now() }} />, 60),
    ).toContain('waiting')
    expect(
      str(<StatusLine width={60} live={{ message: live, startedAt: Date.now() }} />, 60),
    ).toContain('2 tools')
    const pulseless = renderToString(
      <InkChatProvider components={{ glyphs: { pulse: [] } }}>
        <StatusLine width={40} live={{ message: { ...live, blocks: [] }, startedAt: Date.now() }} />
      </InkChatProvider>,
      { columns: 40 },
    )
    expect(pulseless).toContain('waiting')
  })

  it('passes block layouts and overrides through the viewport, and toggles open state', () => {
    const custom = { id: 'c', role: 'assistant', blocks: [{ type: 'card', id: 'k' }] } as never
    const out = str(
      <TranscriptViewport
        messages={[custom]}
        width={30}
        height={3}
        scroll={scrollEnd}
        onScroll={() => {}}
        blockLayouts={{ card: () => [{ spans: [span('custom card')] }] }}
        override={(_line, i, absolute) => (i === 0 ? <Text>{`row ${absolute}`}</Text> : undefined)}
      />,
      30,
    )
    expect(out).toContain('row 0')
    let api: ReturnType<typeof useOpenState> | undefined
    function Probe() {
      api = useOpenState()
      return null
    }
    renderToString(<Probe />)
    expect(api?.[0].isOpen('b', 'p')).toBe(false)
  })
})

describe('useOpenState', () => {
  it('toggles members open and closed, bumping the version', async () => {
    const { render } = await import('ink-testing-library')
    const { act, useEffect } = await import('react')
    const seen: Array<[number, boolean]> = []
    function Probe() {
      const [opened, toggle] = useOpenState()
      seen.push([opened.version, opened.isOpen('b', '$[0]')])
      useEffect(() => {
        if (opened.version === 0) toggle('b', '$[0]')
        else if (opened.version === 1) toggle('b', '$[0]')
      }, [opened.version, toggle])
      return null
    }
    const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    env.IS_REACT_ACT_ENVIRONMENT = true
    await act(async () => {
      render(<Probe />)
    })
    env.IS_REACT_ACT_ENVIRONMENT = false
    expect(seen.at(-1)).toEqual([2, false])
    expect(seen).toContainEqual([1, true])
  })
})
