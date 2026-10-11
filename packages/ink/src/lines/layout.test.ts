// @vitest-environment node
import type { ChatMessage, ContentBlock, CustomBlock, RenderableMessage } from '@fx/chat-core'
import { describe, expect, it } from 'vitest'
import { plainGlyphs, plainTheme } from '../theme'
import { compactFrame, threadedFrame } from './frames'
import {
  type LayoutContext,
  NOTHING_OPEN,
  ROW_PATH,
  footerSpans,
  layoutBody,
  layoutMessage,
  plainMarkdownLayout,
  resolveAccent,
  showsSomething,
} from './layout'
import { defaultMeasure } from './measure'
import { type Line, lineText } from './model'
import { createLayoutCache, layoutSignature, layoutTranscript } from './transcript'

const ctx = (extra: Partial<LayoutContext> = {}): LayoutContext => ({
  width: 60,
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

const text = (lines: Array<Pick<Line, 'spans'>>) =>
  lines.map((l) => l.spans.map((s) => s.text).join(''))

const tool = (
  id: string,
  extra: Partial<Extract<ContentBlock, { type: 'tool_call' }>> = {},
): ContentBlock => ({
  type: 'tool_call',
  id,
  name: id,
  arguments: {},
  status: 'success',
  ...extra,
})
const answer = (blocks: ContentBlock[], extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'a',
  role: 'assistant',
  createdAt: 10_000,
  blocks,
  ...extra,
})

describe('layoutBody', () => {
  it('lays out text, groups, tool rows with input and approval, and attachments', () => {
    const body = layoutBody(
      answer([
        { type: 'reasoning', id: 'r', text: 'plan', durationMs: 1200 },
        tool('t', {
          title: 'Run tests',
          arguments: { command: 'npm test' },
          status: 'error',
          approval: { state: 'denied' },
        }),
        { type: 'text', id: 'x', text: 'Done.' },
      ]),
      40,
      ctx(),
    )
    expect(text(body)).toEqual(['▸ (+1) ⚒ Run tests', '', 'Done.'])
    expect(body[1]?.frame).toBe(true)
    const opened = {
      version: 1,
      isOpen: (b: string, p: string) => b === 'group-r' && p === ROW_PATH,
    }
    const open = text(
      layoutBody(
        answer([
          { type: 'reasoning', id: 'r', text: 'plan', durationMs: 1200 },
          tool('t', { status: 'error', approval: { state: 'denied' } }),
        ]),
        40,
        ctx({ opened }),
      ),
    )
    expect(open).toEqual(['▾ (+1) ⚒ t', '  ▸ ∴ Thought for 1.2s', '  ✗ t · denied'])
  })

  it('shows tool output in details: plain text wrapped, JSON folded, open in full', () => {
    const message = answer([
      tool('a', { result: 'line one\nline two' }),
      tool('b', {
        result: { items: [{ id: 'x', v: 'y'.repeat(100) }, 2] },
        approval: { state: 'pending' },
      }),
    ])
    const details = text(layoutBody(message, 40, ctx({ detail: 'details' })))
    expect(details.some((l) => l.endsWith('┊ line one'))).toBe(true)
    expect(details.some((l) => l.includes('▸ {"id": "x"'))).toBe(true)
    expect(details.some((l) => l.includes('· 2 keys'))).toBe(true)
    expect(details.some((l) => l.includes('awaiting approval'))).toBe(true)
    const full = text(layoutBody(message, 40, ctx({ detail: 'full' })))
    expect(full.some((l) => l.includes('▾ {'))).toBe(true)
    const opened = { version: 2, isOpen: (b: string, p: string) => b === 'b' && p === '$.items[0]' }
    expect(
      text(layoutBody(message, 40, ctx({ detail: 'details', opened }))).some((l) =>
        l.includes('▾ {'),
      ),
    ).toBe(true)
    const rest = text(
      layoutBody(
        answer([tool('c', { result: '{"a":1} and more' })]),
        40,
        ctx({ detail: 'details' }),
      ),
    )
    expect(rest.at(-1)).toBe('  ┊ and more')
  })

  it('targets tool output and toggles', () => {
    const body = layoutBody(
      answer([tool('c', { result: '[{"a":1}]' })]),
      40,
      ctx({ detail: 'details' }),
    )
    expect(body[0]?.target).toEqual({ kind: 'row-toggle', rowKey: 'c' })
    expect(body.some((l) => l.target?.kind === 'json-toggle')).toBe(true)
    expect(body.at(-1)?.target).toEqual({ kind: 'tool-output', blockId: 'c' })
    const toggled = { version: 3, isOpen: (b: string, p: string) => b === 'c' && p === ROW_PATH }
    expect(
      text(layoutBody(answer([tool('c', { result: 'out' })]), 40, ctx({ opened: toggled }))),
    ).toEqual(['✓ c', '  ┊ out'])
  })

  it('lays out live rows with the whole-second clock and a live tail', () => {
    const live = answer([
      { type: 'reasoning', id: 'r1', text: 'a\nb\nc\nd', durationMs: 5 },
      tool('t1'),
      tool('t2'),
      tool('t3'),
      tool('t4', { status: 'running', startedAt: 15_000 }),
    ])
    const out = text(layoutBody(live, 50, ctx({ isActive: () => true })))
    expect(out[0]).toBe('⋮ +2 earlier steps (1 tool call)')
    expect(out.at(-1)).toBe('… t4')
    const thinking = text(
      layoutBody(
        answer([{ type: 'reasoning', id: 'r', text: 'one\ntwo\nthree\nfour', startedAt: 12_000 }]),
        50,
        ctx({ isActive: () => true }),
      ),
    )
    expect(thinking[0]).toMatch(/^. ∴ Thinking… 8s$/)
    expect(thinking.slice(1)).toEqual(['  two', '  three', '  four'])
    const pending = text(layoutBody(answer([]), 50, ctx({ isActive: () => true })))
    expect(pending[0]).toMatch(/Starting… 10s$/)
  })

  it('lays out plans, outcomes, status, system, custom blocks and user text', () => {
    const blocks: Array<ContentBlock | CustomBlock> = [
      {
        type: 'plan',
        id: 'p',
        entries: [
          { content: 'Read the code', status: 'completed' },
          { content: 'Write', status: 'in_progress' },
          { content: 'Test', status: 'pending' },
        ],
      },
      { type: 'system', id: 's', text: 'Be brief.' },
      { type: 'status', id: 'st', phase: 'complete' },
      { type: 'chart', id: 'c', label: 'Sales' } as CustomBlock,
      { type: 'note', id: 'n' } as CustomBlock,
    ]
    const message = {
      ...answer([]),
      blocks,
      outcome: { kind: 'error' as const, message: 'boom' },
    } as RenderableMessage
    const out = text(
      layoutBody(
        message,
        40,
        ctx({
          detail: 'details',
          blockLayouts: { note: (b, c) => [{ spans: [{ text: `note ${b.id} ${c.width}` }] }] },
        }),
      ),
    )
    expect(out).toEqual([
      '  ☑ Plan 1/3',
      '  ✓ Read the code',
      '  … Write',
      '  · Test',
      '',
      '  ⚙ System prompt',
      '  Be brief.',
      '',
      '  Generated',
      '',
      'Sales',
      'note n 40',
      '✗ boom',
    ])
    const user = layoutBody(
      {
        id: 'u',
        role: 'user',
        blocks: [{ type: 'text', id: 't', text: 'hi there' }],
        attachments: [{ url: 'u', mediaType: 'image/png', kind: 'image', name: 'x.png' }],
      },
      40,
      ctx(),
    )
    expect(text(user)).toEqual(['hi there', '📎 x.png'])
    expect(user[0]?.spans[0]?.role).toBe('user')
    const plan = layoutBody(
      {
        ...answer([]),
        blocks: [
          {
            type: 'plan',
            id: 'p',
            entries: [{ content: 'a long entry that wraps', status: 'pending' }],
          },
        ],
      },
      12,
      ctx({ isActive: () => true }),
    )
    expect(text(plan)).toEqual(['  ☑ Plan 0/1', '  · a long', '    entry', '    that', '    wraps'])
  })

  it('separates paragraphs split by activity when placed after content', () => {
    const out = text(
      layoutBody(
        answer([
          { type: 'text', id: 'a', text: 'one' },
          tool('t'),
          { type: 'text', id: 'b', text: 'two' },
        ]),
        40,
        ctx({ placement: 'after-content' }),
      ),
    )
    expect(out).toEqual(['one', '', 'two', '', '✓ t'])
  })
})

describe('footer and frames', () => {
  it('plans footer facts with glyphs and hints', () => {
    const done = answer(
      [
        { type: 'reasoning', id: 'r', text: 'xx', durationMs: 1 },
        tool('t', { result: 'x' }),
        { type: 'text', id: 'x', text: 'y' },
      ],
      { metrics: { durationMs: 2000 }, outcome: { kind: 'stopped' } },
    )
    const hints = {
      retry: '^R again',
      details: '^T details',
      openAll: '^T open all',
      close: 'Esc close',
    }
    expect(footerSpans(done, ctx({ hints }))?.[0]?.text).toBe(
      '2.0s · stopped · ∴ 2 · ⚒ 1 tool · ^R again · ^T details',
    )
    expect(footerSpans(done, ctx({ hints, detail: 'details' }))?.[0]?.text).toBe(
      '2.0s · stopped · ^R again · ^T open all · Esc close',
    )
    expect(footerSpans(done, ctx({ hints, detail: 'full' }))?.[0]?.text).toBe(
      '2.0s · stopped · ^R again · Esc close',
    )
    expect(footerSpans(answer([tool('t')]), ctx())).toBeUndefined()
    const live = answer([{ type: 'text', id: 'x', text: 'y' }])
    expect(footerSpans(live, ctx({ isActive: () => true }))?.[0]?.text).toBe('10s')
    expect(footerSpans(live, ctx({ isActive: () => true, liveFooter: false }))).toBeUndefined()
    expect(footerSpans(answer([{ type: 'text', id: 'x', text: 'y' }]), ctx())).toBeUndefined()
  })

  it('frames compactly', () => {
    const lines = layoutMessage(
      answer([{ type: 'text', id: 'x', text: 'hello' }], { metrics: { model: 'm' } }),
      ctx(),
    )
    expect(text(lines)).toEqual(['• hello', '  m', ''])
    expect(lines.every((l) => l.owner.messageId === 'a')).toBe(true)
    expect(lines[0]?.owner.blockId).toBe('x')
    expect(text(layoutMessage(answer([], { outcome: { kind: 'stopped' } }), ctx()))).toEqual([
      '• ',
      '  stopped',
      '',
    ])
    expect(layoutMessage(answer([]), ctx())).toEqual([])
    expect(
      text(
        layoutMessage(
          { id: 'u', role: 'user', blocks: [{ type: 'text', id: 't', text: 'q' }] },
          ctx(),
        ),
      ),
    ).toEqual(['› q', ''])
  })

  it('frames threaded: user box with time and junction, answer gutter and footer corner', () => {
    const user: ChatMessage = {
      id: 'u',
      role: 'user',
      createdAt: new Date(2026, 0, 1, 14, 2).getTime(),
      blocks: [{ type: 'text', id: 't', text: 'how big?' }],
      attachments: [{ url: 'x', mediaType: 'image/png', kind: 'image' }],
    }
    const reply = answer([{ type: 'text', id: 'x', text: 'About 2.4 GB.' }], {
      metrics: { durationMs: 1000 },
    })
    const t = ctx({ frame: threadedFrame, width: 40 })
    expect(text(layoutMessage(user, t, reply))).toEqual([
      '╭────── 14:02 ─╮',
      '│ how big?     │',
      '│ 📎 image/png │',
      '├──────────────╯',
    ])
    expect(text(layoutMessage(user, t))).toEqual([
      '╭────── 14:02 ─╮',
      '│ how big?     │',
      '│ 📎 image/png │',
      '╰──────────────╯',
      '',
    ])
    expect(text(layoutMessage(reply, t))).toEqual(['│', '│ About 2.4 GB.', '│', '╰ 1.0s', ''])
    expect(layoutMessage(answer([]), ctx({ frame: threadedFrame, isActive: () => true }))).toEqual(
      [],
    )
    expect(text(layoutMessage({ id: 'u2', role: 'user', blocks: [] }, t))[0]).toBe('╭────╮')
  })

  it('resolves accents and knows what shows', () => {
    expect(resolveAccent(answer([]), { theme: plainTheme })).toEqual(plainTheme.assistant)
    expect(resolveAccent(answer([]), { theme: plainTheme, accentFor: () => 'danger' })).toEqual(
      plainTheme.danger,
    )
    expect(
      resolveAccent(answer([]), { theme: plainTheme, accentFor: () => ({ color: 'cyan' }) }),
    ).toEqual({ color: 'cyan' })
    expect(showsSomething(answer([{ type: 'status', id: 's' }]))).toBe(false)
    expect(showsSomething(answer([], { outcome: { kind: 'stopped' } }))).toBe(true)
  })
})

describe('transcript cache', () => {
  it('lays out finished messages once and only the live one again', () => {
    const cache = createLayoutCache()
    const done = answer([{ type: 'text', id: 'x', text: 'done' }])
    const live = { ...answer([{ type: 'text', id: 'y', text: 'live' }]), id: 'b' }
    const t1 = ctx({ isActive: (m) => m.id === 'b', now: 20_000 })
    const first = layoutTranscript([done, live], t1, cache)
    expect(first.messageStart).toEqual([0, 2])
    expect(cache.misses).toBe(2)
    layoutTranscript([done, live], { ...t1, now: 20_500 }, cache)
    expect(cache.misses).toBe(2)
    layoutTranscript([done, live], { ...t1, now: 21_000 }, cache)
    expect(cache.misses).toBe(3)
    layoutTranscript([done, live], { ...t1, width: 50 }, cache)
    expect(cache.misses).toBe(5)
    expect(layoutSignature(done, ctx(), live, 7)).toContain('|7|')
    expect(layoutTranscript([done], ctx()).lines.length).toBeGreaterThan(0)
  })
})

describe('transcript cache keys', () => {
  const done = answer([{ type: 'text', id: 'x', text: '**done**' }])
  const glyphs = { ...plainGlyphs, bullet: '*' }
  const markdown: LayoutContext['markdown'] = (source) => [{ spans: [{ text: `md ${source}` }] }]
  const measure: LayoutContext['measure'] = (s) => defaultMeasure(s)
  const image: LayoutContext['image'] = () => undefined
  const blockLayouts: LayoutContext['blockLayouts'] = {}
  const changes: Array<[string, Partial<LayoutContext>]> = [
    ['glyphs', { glyphs }],
    ['hints', { hints: { details: '^T details' } }],
    ['markdown', { markdown }],
    ['measure', { measure }],
    ['image', { image }],
    ['blockLayouts', { blockLayouts }],
    ['accentFor', { accentFor: () => 'danger' }],
    ['theme', { theme: { ...plainTheme, assistant: { color: 'cyan' } } }],
  ]

  it.each(changes)('lays out again when %s changes', (_, change) => {
    const cache = createLayoutCache()
    cache.get(done, ctx())
    expect(cache.misses).toBe(1)
    cache.get(done, ctx())
    expect(cache.misses).toBe(1)
    cache.get(done, ctx(change))
    expect(cache.misses).toBe(2)
    cache.get(done, ctx(change))
    expect(cache.misses).toBe(2)
  })

  it('serves new lines for a new markdown layout', () => {
    const cache = createLayoutCache()
    const before = text(cache.get(done, ctx()))
    expect(text(cache.get(done, ctx({ markdown })))).not.toEqual(before)
    expect(text(cache.get(done, ctx({ markdown })))).toContain('• md **done**')
  })

  it('counts plain values by value, not identity', () => {
    const cache = createLayoutCache()
    cache.get(done, ctx({ hints: { close: 'Esc' }, accentFor: () => 'danger' }))
    cache.get(done, ctx({ hints: { close: 'Esc' }, accentFor: () => 'danger' }))
    expect(cache.misses).toBe(1)
  })
})

describe('copy scenario', () => {
  it('copies a threaded answer with code and a table without decoration', async () => {
    const { copyText } = await import('./mouse')
    const { terminalMarkdown } = await import('./markdown')
    const source =
      'Intro text.\n\n```py\ndef f():\n    return 1\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |'
    const message: ChatMessage = {
      id: 'm',
      role: 'assistant',
      blocks: [{ type: 'text', id: 't', text: source }],
      metrics: { durationMs: 1200 },
    }
    const { lines } = layoutTranscript(
      [message],
      ctx({ frame: threadedFrame, markdown: terminalMarkdown }),
    )
    const copied = copyText(
      lines,
      { line: 0, col: 0 },
      { line: lines.length - 1, col: 99 },
      defaultMeasure,
    )
    expect(copied).toBe('Intro text.\n\ndef f():\n    return 1\n\na\tb\n1\t2')
    expect(copied).not.toMatch(/[│─┼╰]/)
  })
})

describe('footer extras', () => {
  it('appends host facts after the message facts, before hints, and keys the cache on them', () => {
    const message: ChatMessage = {
      id: 'm',
      role: 'assistant',
      blocks: [{ type: 'text', id: 't', text: 'hi' }],
      metrics: { durationMs: 1200 },
    }
    const footerExtras = (m: RenderableMessage, detail: string) =>
      detail === 'details' ? [`turn ${m.id}`] : []
    const footer = (detail: 'collapsed' | 'details') =>
      footerSpans(message, ctx({ detail, footerExtras, hints: { close: 'Esc close' } }))
        ?.map((s) => s.text)
        .join('')
    expect(footer('details')).toBe('1.2s · turn m · Esc close')
    expect(footer('collapsed')).toBe('1.2s')
    expect(layoutSignature(message, ctx({ detail: 'details', footerExtras }))).toContain('turn m')
    expect(layoutSignature(message, ctx())).toContain('|row|s||')
    expect(layoutSignature(message, ctx({ activitySpacing: false }))).toContain('|row|-||')
  })
})

describe('finished activity', () => {
  const message: ChatMessage = {
    id: 'm',
    role: 'assistant',
    blocks: [
      { type: 'reasoning', id: 'r', text: 'hmm', durationMs: 5 },
      { type: 'text', id: 't', text: 'answer' },
      { type: 'tool_call', id: 'x', name: 'search', arguments: {}, status: 'success', result: 'r' },
      { type: 'tool_call', id: 'y', name: 'fetch', arguments: {}, status: 'success' },
    ],
    metrics: { durationMs: 1000 },
  }
  const lines = (extra: Partial<LayoutContext>) => text(layoutBody(message, 40, ctx(extra)))

  it('leaves a finished, collapsed answer’s activity to the footer when asked', () => {
    expect(lines({})).toEqual(['▸ ∴ Thought for 0.0s', '', 'answer', '', '▸ (+1) ⚒ fetch'])
    expect(lines({ finishedActivity: 'footer' })).toEqual(['answer'])
    expect(lines({ finishedActivity: 'footer', placement: 'after-content' })).toEqual(['answer'])
    expect(lines({ finishedActivity: 'footer', detail: 'details' }).join('\n')).toContain('search')
    expect(lines({ finishedActivity: 'footer', isActive: () => true }).join('\n')).toContain(
      'fetch',
    )
    expect(footerSpans(message, ctx({ finishedActivity: 'footer' }))?.[0]?.text).toBe(
      '1.0s · ∴ 3 · ⚒ 2 tools',
    )
  })

  it('draws one header for a single activity block after content', () => {
    const one: ChatMessage = { ...message, blocks: (message.blocks as ContentBlock[]).slice(0, 2) }
    expect(text(layoutBody(one, 40, ctx({ placement: 'after-content' })))).toEqual([
      'answer',
      '',
      '▸ ∴ Thought for 0.0s',
    ])
  })
})

describe('activity spacing', () => {
  const message = answer([
    { type: 'text', id: 'a', text: 'one' },
    tool('t1'),
    tool('t2', { status: 'error' }),
    { type: 'reasoning', id: 'r', text: 'x', durationMs: 1 },
    { type: 'text', id: 'b', text: 'two' },
  ])

  it('sets content and activity apart on both sides', () => {
    expect(text(layoutBody(message, 40, ctx({ detail: 'details' })))).toEqual([
      'one',
      '',
      '▾ (+2) ∴ Thought for 0.0s',
      '  ✓ t1',
      '  ✗ t2',
      '  ▾ ∴ Thought for 0.0s',
      '    x',
      '',
      'two',
    ])
    expect(text(layoutBody(message, 40, ctx({ activitySpacing: false })))).toEqual([
      'one',
      '▸ (+2) ∴ Thought for 0.0s',
      'two',
    ])
  })

  it('draws the blank line as decoration inside either frame', () => {
    const compact = layoutMessage(message, ctx())
    expect(text(compact).slice(0, 4)).toEqual(['• one', '  ', '  ▸ (+2) ∴ Thought for 0.0s', '  '])
    expect(compact[1]?.frame).toBe(true)
    const threaded = layoutMessage(message, ctx({ frame: threadedFrame }))
    expect(text(threaded).slice(0, 6)).toEqual([
      '│',
      '│ one',
      '│ ',
      '│ ▸ (+2) ∴ Thought for 0.0s',
      '│ ',
      '│ two',
    ])
    expect(threaded[2]?.frame).toBe(true)
  })

  it('keeps consecutive activity rows together, the earlier row with or without its marker', () => {
    const live = answer([
      { type: 'text', id: 'a', text: 'one' },
      tool('t1'),
      tool('t2'),
      tool('t3', { status: 'running' }),
    ])
    const body = (extra: Partial<LayoutContext>) =>
      text(layoutBody(live, 40, ctx({ isActive: () => true, liveTail: 1, ...extra })))
    expect(body({})).toEqual(['one', '', '⋮ +2 earlier tool calls', '… t3'])
    expect(body({ glyphs: { ...plainGlyphs, earlier: '' } })[2]).toBe('+2 earlier tool calls')
  })
})

describe('threaded footer corner', () => {
  it('closes the gutter with a bare corner when there are no footer facts', () => {
    const hi = answer([{ type: 'text', id: 'x', text: 'hi' }])
    expect(text(layoutMessage(hi, ctx({ frame: threadedFrame })))).toEqual(['│', '│ hi', '╰', ''])
    expect(
      text(layoutMessage({ ...hi, metrics: { model: 'm' } }, ctx({ frame: threadedFrame }))),
    ).toEqual(['│', '│ hi', '│', '╰ m', ''])
  })
})
