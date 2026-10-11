// @vitest-environment node
import type { ChatMessage } from '@fx/chat-core'
import { renderToString } from 'ink'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { Composer } from './Composer'
import { MessageView } from './MessageView'
import { Row } from './Row'
import { Lines } from './lines/Lines'
import { EmptyState, PendingRows, StatusLine } from './lines/Status'
import { compactFrame, threadedFrame } from './lines/frames'
import { layoutImage } from './lines/images'
import { type LayoutContext, NOTHING_OPEN, footerSpans, plainMarkdownLayout } from './lines/layout'
import { terminalMarkdown } from './lines/markdown'
import { defaultMeasure } from './lines/measure'
import { lineText } from './lines/model'
import { layoutTranscript } from './lines/transcript'
import { InkChatProvider, PlainMarkdown, Styled } from './registry'
import { React } from './runtime'
import { stripControls, stripControlsDeep } from './sanitize'
import { renderInk, tick } from './test-helpers'
import { Text } from './text'
import { plainGlyphs, plainTheme } from './theme'

const ESC = '\u001b'
const OSC52 = `${ESC}]52;c;cHduZWQ=\u0007`
const OSC8 = `${ESC}]8;;https://evil.example${ESC}\\link${ESC}]8;;${ESC}\\`
const SGR = `${ESC}[31mred${ESC}[0m`
const CURSOR = `${ESC}[2J${ESC}[H${ESC}[3A`
const C1_CSI = '\u009b31mc1\u009b0m'
const BEL = '\u0007'
/** Every hostile form, with the visible text it leaves: `link`, `red`, `c1`. */
const HOSTILE = `a${OSC52}${OSC8}${SGR}${CURSOR}${C1_CSI}${BEL}b`
const HOSTILE_LEFT = 'alinkredc1b'

/** Any control a terminal would act on (C0 bar \n and \t, DEL, C1). */
const hasControl = (text: string) =>
  Array.from(text).some((ch) => {
    const code = ch.codePointAt(0) as number
    return (code < 0x20 && ch !== '\n' && ch !== '\t') || (code >= 0x7f && code <= 0x9f)
  })

describe('stripControls', () => {
  it('removes OSC 52, OSC 8, SGR, cursor moves, 8-bit CSI and BEL', () => {
    expect(stripControls(OSC52)).toBe('')
    expect(stripControls(`${ESC}]52;c;eA==${ESC}\\`)).toBe('')
    expect(stripControls(OSC8)).toBe('link')
    expect(stripControls(SGR)).toBe('red')
    expect(stripControls(`x${CURSOR}y`)).toBe('xy')
    expect(stripControls(C1_CSI)).toBe('c1')
    expect(stripControls(`ding${BEL}`)).toBe('ding')
    expect(stripControls(HOSTILE)).toBe(HOSTILE_LEFT)
  })

  it('removes string commands in both encodings, other escapes and stray controls', () => {
    expect(stripControls(`${ESC}P1;2qdata${ESC}\\x`)).toBe('x')
    expect(stripControls(`${ESC}_Ga=d${ESC}\\x`)).toBe('x')
    expect(stripControls(`${ESC}^pm${ESC}\\${ESC}Xsos${ESC}\\x`)).toBe('x')
    expect(stripControls('\u009d52;c;eA==\u009cx\u0090dcs\u009c')).toBe('x')
    expect(stripControls(`${ESC}c${ESC}7${ESC}(Bx${ESC}`)).toBe('x')
    expect(stripControls('a\rb\u0000c\u007fd\u0085e')).toBe('abcde')
  })

  it('keeps newlines, tabs and every printable character', () => {
    const text = 'line\n\tindented 日本 👍🏽 é \u{10eeee}̅'
    expect(stripControls(text)).toBe(text)
  })

  it('drops only the introducer of an unterminated sequence', () => {
    expect(stripControls(`${ESC}]52;c;eA== then text`)).toBe('52;c;eA== then text')
    expect(stripControls(`${ESC}[12`)).toBe('12')
    expect(stripControls(`${ESC}]8;;u${ESC}[31mx`)).toBe('8;;ux')
  })

  it('stays linear on many unterminated introducers', () => {
    const text = `${ESC}]\u009d`.repeat(50_000)
    const started = performance.now()
    expect(stripControls(text)).toBe('')
    expect(performance.now() - started).toBeLessThan(1000)
  })
})

describe('stripControlsDeep', () => {
  it('cleans strings and keys through arrays and plain objects, keeping clean parts', () => {
    const clean = { a: ['x', { b: 1 }], c: null }
    expect(stripControlsDeep(clean)).toBe(clean)
    const dirty = { a: ['x', `y${BEL}`], keep: clean, [`k${ESC}[1m`]: 2 }
    const out = stripControlsDeep(dirty)
    expect(out).toEqual({ a: ['x', 'y'], keep: clean, k: 2 })
    expect(out.keep).toBe(clean)
    expect(dirty.a[1]).toBe(`y${BEL}`)
    const date = new Date(0)
    expect(stripControlsDeep(date)).toBe(date)
    expect(stripControlsDeep(Object.assign(Object.create(null), { s: SGR }))).toEqual({ s: 'red' })
    expect(stripControlsDeep(7)).toBe(7)
  })

  it('keeps every value when keys clean to the same name', () => {
    const out = stripControlsDeep({
      x: 1,
      '\u0001x': 2,
      [`x${BEL}`]: 3,
      'x\\u001B': 4,
      'x\\u001B (2)': 5,
    })
    expect(out).toEqual({ x: 1, 'x\\u001B': 4, 'x\\u001B (2)': 5, '\\u0001x': 2, 'x\\u0007': 3 })
    const dirtyOnly = stripControlsDeep({ '\u0001y': 1, [`y${ESC}`]: 2, '\u0085y': 3 })
    expect(dirtyOnly).toEqual({ y: 1, 'y\\u001B': 2, '\\u0085y': 3 })
    const crowded = stripControlsDeep({ z: 1, '\\u0007z': 2, [`${BEL}z`]: 3, [`z${BEL}`]: 4 })
    expect(crowded).toEqual({ z: 1, '\\u0007z': 2, '\\u0007z (2)': 3, 'z\\u0007': 4 })
  })

  it('keeps a __proto__ key an own property and never changes a prototype', () => {
    const parsed = JSON.parse(
      `{"__proto__": {"polluted": "${'\\u001b'}[31mred"}, "a": "${'\\u0007'}b"}`,
    )
    const out = stripControlsDeep(parsed)
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
    expect(Object.hasOwn(out, '__proto__')).toBe(true)
    expect(out.__proto__).toEqual({ polluted: 'red' })
    expect(out.a).toBe('b')
    const renamed = stripControlsDeep({ [`__proto__${BEL}`]: { p: 1 } }) as Record<string, unknown>
    expect(Object.getPrototypeOf(renamed)).toBe(Object.prototype)
    expect(Object.hasOwn(renamed, '__proto__')).toBe(true)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('passes non-plain objects through and survives cycles', () => {
    const map = new Map([['k', SGR]])
    const set = new Set([SGR])
    expect(stripControlsDeep({ map, set, s: SGR })).toEqual({ map, set, s: 'red' })
    const cyclic: Record<string, unknown> = { s: SGR }
    cyclic.self = cyclic
    const list: unknown[] = [SGR]
    list.push(list)
    const out = stripControlsDeep({ cyclic, list }) as {
      cyclic: Record<string, unknown>
      list: unknown[]
    }
    expect(out.cyclic.s).toBe('red')
    expect(out.cyclic.self).toBe(cyclic)
    expect(out.list[0]).toBe('red')
    expect(out.list[1]).toBe(list)
    const shared = { s: SGR }
    const twice = stripControlsDeep([shared, shared])
    expect(twice).toEqual([{ s: 'red' }, { s: 'red' }])
  })
})

const hostile: ChatMessage = {
  id: 'a',
  role: 'assistant',
  createdAt: 1000,
  outcome: { kind: 'error', message: `failed ${OSC52}` },
  attachments: [{ id: 'f', name: `file${SGR}.png`, mediaType: 'image/png', url: 'u' }],
  blocks: [
    { type: 'reasoning', id: 'r', text: `think ${HOSTILE}`, durationMs: 5 },
    {
      type: 'tool_call',
      id: 't',
      name: `tool${CURSOR}`,
      arguments: { [`q${BEL}`]: HOSTILE },
      result: `out ${HOSTILE}`,
      status: 'success',
    },
    {
      type: 'text',
      id: 'x',
      text: [
        `text ${HOSTILE}`,
        '',
        '```',
        `code ${HOSTILE}`,
        '```',
        '',
        '| h |',
        '| - |',
        `| ${SGR} |`,
        '',
        `[link ${OSC8}](https://x/${C1_CSI}) ![alt ${SGR}](https://x/i${BEL}.png)`,
      ].join('\n'),
    },
  ],
}

const ctx = (extra: Partial<LayoutContext> = {}): LayoutContext => ({
  width: 50,
  detail: 'full',
  placement: 'inline',
  liveTail: 3,
  isActive: () => false,
  now: 20_000,
  opened: { version: 1, isOpen: () => true },
  markdown: terminalMarkdown,
  glyphs: plainGlyphs,
  theme: plainTheme,
  hints: { retry: `^R${BEL}`, close: 'Esc' },
  liveFooter: true,
  frame: compactFrame,
  measure: defaultMeasure,
  footerExtras: () => [`turn ${SGR}`],
  ...extra,
})

describe('content entering the line model', () => {
  it('reaches no line as a control, in text, code, tables, links, tools, errors and footers', () => {
    for (const frame of [compactFrame, threadedFrame]) {
      const user: ChatMessage = { id: 'u', role: 'user', createdAt: 1, blocks: hostile.blocks }
      const { lines } = layoutTranscript([user, hostile], ctx({ frame }))
      const all = lines.map(lineText).join('\n')
      expect(hasControl(all)).toBe(false)
      expect(all).toContain('text alinkredc1b')
      expect(all).toContain('code alinkredc1b')
      expect(all).toContain('out alinkredc1b')
      expect(all).toContain('turn red')
      // Widths are measured on what is drawn: no line passes the width.
      for (const line of lines) expect(defaultMeasure(lineText(line))).toBeLessThanOrEqual(50)
    }
  })

  it('hands host callbacks the message they were given', () => {
    const seen: unknown[] = []
    const footerExtras = (m: unknown) => {
      seen.push(m)
      return []
    }
    const isActive = (m: unknown) => {
      seen.push(m)
      return false
    }
    footerSpans(hostile, ctx({ footerExtras }))
    layoutTranscript([hostile], ctx({ isActive, footerExtras, markdown: plainMarkdownLayout }))
    expect(seen.length).toBeGreaterThan(3)
    expect(seen.every((m) => m === hostile)).toBe(true)
  })

  it('cleans image captions, provider errors included', () => {
    const lines = layoutImage(`https://x/${BEL}i.png`, `alt${SGR}`, 60, {
      provider: {
        get: () => ({ kind: 'failed', error: `boom${OSC52}` }),
        allow: () => {},
        version: 0,
        subscribe: () => () => {},
      },
      expanded: false,
      maxHeight: 8,
      glyphs: plainGlyphs,
      measure: defaultMeasure,
    })
    const all = lines.map(lineText).join('\n')
    expect(hasControl(all)).toBe(false)
    expect(all).toContain('altred')
    expect(all).toContain('boom')
  })
})

const str = (node: ReactElement) =>
  renderToString(<InkChatProvider>{node}</InkChatProvider>, { columns: 80 })

/** No hostile sequence survives in a frame (the renderer's own styling is not content). */
function expectSafe(frame: string) {
  expect(frame).not.toContain(']52;')
  expect(frame).not.toContain(']8;')
  expect(frame).not.toContain('[2J')
  expect(frame).not.toContain('[3A')
  expect(frame).not.toContain('\u0007')
  expect(Array.from(frame).some((ch) => ch >= '\u0080' && ch <= '\u009f')).toBe(false)
}

describe('every sink', () => {
  it('draws inline messages clean, through the Markdown slot too', () => {
    const seen: string[] = []
    const Markdown = ({ content }: { content: string }) => {
      seen.push(content)
      return <PlainMarkdown content={content} />
    }
    for (const expanded of [false, true]) {
      const frame = renderToString(
        <InkChatProvider components={{ Markdown }}>
          <MessageView message={hostile} expanded={expanded} retryHint={`^R${OSC52}`} />
        </InkChatProvider>,
        { columns: 80 },
      )
      expectSafe(frame)
      expect(frame).toContain('alinkredc1b')
    }
    expect(hasControl(seen.join(''))).toBe(false)
    const user = { ...hostile, role: 'user' as const }
    expectSafe(str(<MessageView message={user} />))
  })

  it('draws host-given strings clean: rows, status, pending rows, empty state, lines', () => {
    expectSafe(str(<Row label={`row ${HOSTILE}`} detail={OSC8} qualifier={SGR} />))
    expectSafe(str(<StatusLine width={60} notice={{ text: HOSTILE, tone: 'danger' }} />))
    expectSafe(str(<StatusLine width={60} idle={HOSTILE} />))
    expectSafe(
      str(
        <StatusLine
          width={80}
          live={{ message: hostile, startedAt: 0 }}
          extras={[OSC52]}
          phaseLabel={() => `phase ${CURSOR}`}
        />,
      ),
    )
    expectSafe(str(<PendingRows width={60} items={[{ text: HOSTILE }]} />))
    expectSafe(str(<EmptyState title={HOSTILE} subtitle={OSC8} notes={[SGR]} />))
    expectSafe(str(<Styled tone="content">{HOSTILE}</Styled>))
    const line = { spans: [{ text: HOSTILE }], owner: { messageId: 'm' } }
    expectSafe(str(<Lines lines={[line]} theme={plainTheme} />))
  })

  it('cleans string children in arrays and fragments, leaving elements alone', () => {
    const frame = str(
      <Text>
        {[`a${BEL}`, 'b']}
        <>
          {`c${SGR}`}
          <Text>{OSC52}d</Text>
        </>
        <React.Fragment>{`e${CURSOR}`}</React.Fragment>
        {3}
      </Text>,
    )
    expectSafe(frame)
    expect(frame).toContain('abcredde3')
    expect(str(<Text />)).toBe('')
  })

  it('echoes typed and pasted text clean in the composer', async () => {
    const sent: string[] = []
    const send = (text: string) => {
      sent.push(text)
    }
    const view = renderInk(<Composer onSubmit={send} />)
    await tick()
    view.stdin.write(`\u001b[200~paste ${OSC52}${SGR}\u001b[201~`)
    await tick()
    view.stdin.write(`typed${BEL}`)
    await tick()
    expectSafe(view.lastFrame() ?? '')
    expect(view.lastFrame()).toContain('paste redtyped')
    view.stdin.write('\r')
    await tick()
    expect(sent).toEqual(['paste redtyped'])
    view.unmount()
  })
})
