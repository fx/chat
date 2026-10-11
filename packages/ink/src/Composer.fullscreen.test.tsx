// @vitest-environment node
import type { Attachment } from '@fx/chat-core'
import { createRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  Composer,
  type ComposerHandle,
  type ComposerValue,
  composerRows,
  emptyComposerValue,
} from './Composer'
import { InkChatProvider } from './registry'
import { KITTY_POP, KITTY_PUSH } from './terminal'
import { KEYS, renderInk, tick, useFakeClock } from './test-helpers'

useFakeClock()

const shot: Attachment = {
  url: 'data:image/png;base64,AA',
  mediaType: 'image/png',
  kind: 'image',
  name: 'shot.png',
}
const doc: Attachment = { url: 'f', mediaType: 'text/plain', kind: 'file', description: 'notes' }

type Props = Partial<Parameters<typeof Composer>[0]>

const plain = (props: Props = {}) => {
  const onSubmit = vi.fn()
  const view = renderInk(<Composer onSubmit={onSubmit} variant="plain" {...props} />)
  return { ...view, onSubmit }
}

const lines = (frame: string | undefined) =>
  (frame ?? '')
    .split('\n')
    .map((l) => l.trimEnd())
    .filter(Boolean)

const ctrlLeft = '\u001b[1;5D'
const ctrlRight = '\u001b[1;5C'
const altLeft = '\u001b[1;3D'
const altRight = '\u001b[1;3C'

describe('Composer (fullscreen options)', () => {
  it('draws the plain variant: prompt on the first row only, rows soft-wrapped by width', async () => {
    const { lastFrame, press } = plain({ width: 8 })
    await press('abcdefgh', KEYS.altEnter, 'z')
    expect(lines(lastFrame())).toEqual(['› abcde', '  fgh', '  z'])
  })

  it('hides the caret and dims the prompt when unfocused', async () => {
    const { lastFrame, press, onSubmit } = plain({ focused: false, placeholder: 'Ask' })
    await press('typed', KEYS.enter)
    expect(lines(lastFrame())).toEqual(['› Ask'])
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('scrolls inside itself to keep the caret row within max rows', async () => {
    const { lastFrame, press } = plain({ maxRows: 2 })
    await press('a', KEYS.altEnter, 'b', KEYS.altEnter, 'c', KEYS.altEnter, 'd')
    expect(lines(lastFrame())).toEqual(['› c', '  d'])
    await press(KEYS.up, KEYS.up)
    expect(lines(lastFrame())).toEqual(['› b', '  c'])
    await press(KEYS.up, KEYS.up)
    expect(lines(lastFrame())).toEqual(['› a', '  b'])
    await press(KEYS.down)
    expect(lines(lastFrame())).toEqual(['› a', '  b'])
  })

  it('moves by visual row in wrapped text and then to history', async () => {
    const { lastFrame, press } = plain({ width: 7, history: ['old'] })
    await press('abcdefg', KEYS.up, 'X')
    expect(lines(lastFrame())).toEqual(['› abcX', '  defg'])
    await press(KEYS.ctrl('a'), KEYS.up)
    expect(lines(lastFrame())).toEqual(['› old'])
  })

  it('keeps stepping history through a recalled multi-line entry until edited', async () => {
    const { lastFrame, press } = plain({ history: ['older', 'l1\nl2\nl3'] })
    await press(KEYS.up, KEYS.up)
    expect(lines(lastFrame())).toEqual(['› older'])
    await press(KEYS.down)
    expect(lines(lastFrame())).toEqual(['› l1', '  l2', '  l3'])
    await press(KEYS.left, KEYS.up)
    expect(lines(lastFrame())).toEqual(['› older'])
    await press(KEYS.down, 'x', KEYS.up, 'Y')
    expect(lines(lastFrame())).toEqual(['› l1', '  l2Y', '  l3x'])
  })

  it('jumps words with Ctrl and Alt arrows and Alt+B/F', async () => {
    const { lastFrame, press } = plain()
    await press('one two three', ctrlLeft, 'A', altLeft, altLeft, 'B', ctrlRight, 'C')
    await press(altRight, 'D', '\u001bb', 'E', '\u001bf', 'F')
    expect(lines(lastFrame())).toEqual(['› one BtwoC EAthreeDF'])
  })

  it('clears the whole input with Ctrl+U when asked', async () => {
    const { lastFrame, press } = plain({ killLine: 'input', placeholder: 'P' })
    await press('a', KEYS.altEnter, 'b', KEYS.ctrl('u'))
    expect(lines(lastFrame())).toEqual(['› P'])
  })

  it('is controlled: the host restores a draft with attachments, and empty text sends them', async () => {
    const onSubmit = vi.fn()
    const changes: ComposerValue[] = []
    let setValue: (v: ComposerValue) => void = () => {}
    function Host() {
      const [value, set] = useState<ComposerValue>(emptyComposerValue)
      setValue = set
      return (
        <Composer
          onSubmit={onSubmit}
          value={value}
          onChange={(v) => {
            changes.push(v)
            set(v)
          }}
          variant="plain"
          width={40}
          attachmentHint="Esc removes"
        />
      )
    }
    const { lastFrame, press } = renderInk(<Host />)
    await press('hi')
    expect(changes.at(-1)).toEqual({ text: 'hi', caret: 2, attachments: [] })
    setValue({ text: 'see', caret: 1, attachments: [shot, doc] })
    await tick()
    expect(lines(lastFrame())).toEqual(['⊕ shot.png · notes  Esc removes', '› see'])
    await press('X')
    expect(changes.at(-1)).toEqual({ text: 'sXee', caret: 2, attachments: [shot, doc] })
    await press(KEYS.ctrl('u'), KEYS.ctrl('k'), KEYS.enter)
    expect(onSubmit).toHaveBeenLastCalledWith('', [shot, doc])
    expect(changes.at(-1)).toEqual({ text: '', caret: 0, attachments: [] })
    // History brings the attachments back; coming back down restores the draft.
    await press('d', KEYS.up)
    expect(changes.at(-1)).toEqual({ text: '', caret: 0, attachments: [shot, doc] })
    await press(KEYS.down)
    expect(changes.at(-1)).toEqual({ text: 'd', caret: 1, attachments: [] })
  })

  it('soft-wraps the boxed variant inside its border and padding', async () => {
    const { lastFrame, press } = plain({ variant: 'boxed', width: 10 })
    await press('abcdef')
    expect(lines(lastFrame())).toEqual(['╭────────╮', '│ › abc  │', '│   def  │', '╰────────╯'])
  })

  it('labels an attachment by its media type when it has no description or name', async () => {
    const value = {
      text: '',
      caret: 0,
      attachments: [{ url: 'u', mediaType: 'audio/ogg', kind: 'audio' as const }],
    }
    const { lastFrame } = plain({ value })
    await tick()
    expect(lines(lastFrame())[0]).toBe('⊕ audio/ogg')
  })

  it('truncates the attachments row to the width', async () => {
    const value = { text: '', caret: 0, attachments: [{ ...shot, name: 'a-very-long-name.png' }] }
    const { lastFrame } = plain({ value, width: 12 })
    await tick()
    expect(lines(lastFrame())[0]).toBe('⊕ a-very-lo…')
  })

  it('submits typed chunks with attachments', async () => {
    const value = { text: '', caret: 0, attachments: [shot] }
    const { press, onSubmit } = plain({ value })
    await press('hey\r')
    expect(onSubmit).toHaveBeenCalledWith('hey', [shot])
  })

  it('calls the host key handler first', async () => {
    const onEscape = vi.fn()
    const onKey = vi.fn((input: string, key: { escape: boolean }) => key.escape || input === 'q')
    const { lastFrame, press } = plain({ onKey, onEscape })
    await press('aqb', KEYS.escape, 'q', 'c')
    expect(onEscape).not.toHaveBeenCalled()
    expect(lines(lastFrame())).toEqual(['› aqbc'])
    expect(onKey).toHaveBeenCalledWith('q', expect.objectContaining({ ctrl: false }))
  })

  it('lets the host handle pastes first; pasted newlines are text', async () => {
    const onPaste = vi.fn((text: string) => text.startsWith('/'))
    const { lastFrame, stdin, onSubmit } = plain({ onPaste })
    stdin.write('\u001b[200~/tmp/a.png\u001b[201~')
    await tick()
    stdin.write('\u001b[200~x\ry\u001b[201~')
    await tick()
    expect(onPaste).toHaveBeenCalledTimes(2)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(lines(lastFrame())).toEqual(['› x', '  y'])
  })

  it('takes keys from the host through its handle, ignoring stdin', async () => {
    const ref = createRef<ComposerHandle>()
    const { lastFrame, press, onSubmit } = plain({ inputSource: 'host', ref })
    await press('ignored')
    expect(lines(lastFrame())).toEqual(['› Message'])
    const key = { return: false } as Parameters<ComposerHandle['key']>[1]
    ref.current?.key('hi', key)
    ref.current?.paste(' there')
    await tick()
    expect(lines(lastFrame())).toEqual(['› hi there'])
    // Hosts that route raw input may hand over terminal reports; they are ignored.
    ref.current?.key('[<0;3;4M', key)
    ref.current?.key('', { ...key, return: true })
    expect(onSubmit).toHaveBeenCalledWith('hi there')
  })

  it('ignores mouse reports and terminal replies', async () => {
    const { lastFrame, press } = plain()
    await press('a', '\u001b[<0;3;4M', '\u001b[<0;3;4m', '\u001b[?1;2c', 'b')
    expect(lines(lastFrame())).toEqual(['› ab'])
  })

  it('keeps a report split across stdin chunks out of the draft, at every position', async () => {
    for (const report of ['\u001b[<0;3;4M', '\u001b[6;18;9t']) {
      for (let at = 1; at < report.length; at++) {
        const onChange = vi.fn()
        const { lastFrame, press, stdin, unmount } = plain({ onChange })
        await press('ab', KEYS.left)
        stdin.write(report.slice(0, at))
        // Past Ink's wait for the rest of an escape sequence: it flushes what it has.
        await tick(40)
        await press(report.slice(at), 'c')
        expect(lines(lastFrame())).toEqual(['› acb'])
        expect(onChange.mock.lastCall?.[0]).toMatchObject({ text: 'acb', caret: 2 })
        unmount()
      }
    }
  })

  it('types what follows the rest of a split report, and a literal `[`', async () => {
    const onEscape = vi.fn()
    const { lastFrame, press, stdin } = plain({ onEscape })
    stdin.write('\u001b[<0;3')
    await tick(40)
    await press(';4Mxy', '[', 'z', '[', '1', ']', '[', '?', 'a')
    expect(lines(lastFrame())).toEqual(['› xy[z[1][?a'])
    await press(KEYS.escape)
    await tick(40)
    expect(onEscape).toHaveBeenCalledTimes(1)
    await press('\u001b[200~[<0;3;4M\u001b[201~')
    expect(lines(lastFrame())).toEqual(['› xy[z[1][?a[<0;3;4M'])
  })

  it('leaves a split report start that something else has since edited around', async () => {
    const { lastFrame, press, stdin } = plain()
    stdin.write('\u001b[<0;3')
    await tick(40)
    await press('\u001b[200~P\u001b[201~', ';4M')
    expect(lines(lastFrame())).toEqual(['› [<0;3P'])
  })

  it('joins split reports the host routes, raw or as Ink delivers them', async () => {
    const ref = createRef<ComposerHandle>()
    const onKey = vi.fn((input: string) => input === '[<9')
    const { lastFrame, onSubmit } = plain({ inputSource: 'host', ref, onKey })
    const key = { return: false } as Parameters<ComposerHandle['key']>[1]
    const handle = ref.current as ComposerHandle
    handle.key('a', key)
    handle.key('\u001b[<0;3', key)
    handle.key(';4', key)
    handle.key('M', { ...key, shift: true })
    handle.key('[<0;3', key)
    handle.key(';4Mb', key)
    // A start the host handled itself is not the draft's to take back.
    handle.key('[<9', key)
    handle.key(';1;1M', key)
    await tick()
    expect(lines(lastFrame())).toEqual(['› ab'])
    expect(onKey.mock.calls.map(([input]) => input)).toEqual([
      'a',
      '\u001b[<0;3',
      ';4',
      '[<0;3',
      'b',
      '[<9',
    ])
    handle.key('', { ...key, return: true })
    expect(onSubmit).toHaveBeenCalledWith('ab')
  })

  it('pushes the kitty keyboard flag while focused and pops it on blur and unmount', async () => {
    const write = vi.spyOn(process.stdout, 'write')
    const onSubmit = vi.fn()
    const { rerender, unmount, stdout } = renderInk(<Composer onSubmit={onSubmit} kittyKeyboard />)
    await tick()
    const writes = () =>
      (stdout.frames as string[]).filter((f) => f === KITTY_PUSH || f === KITTY_POP)
    expect(writes()).toEqual([KITTY_PUSH])
    rerender(<Composer onSubmit={onSubmit} kittyKeyboard focused={false} />)
    await tick()
    expect(writes()).toEqual([KITTY_PUSH, KITTY_POP])
    rerender(<Composer onSubmit={onSubmit} kittyKeyboard />)
    await tick()
    unmount()
    expect(writes()).toEqual([KITTY_PUSH, KITTY_POP, KITTY_PUSH, KITTY_POP])
    expect(write).not.toHaveBeenCalledWith(KITTY_PUSH)
    write.mockRestore()
  })

  it('takes history entries the host adds after mount', async () => {
    const onSubmit = vi.fn()
    const view = renderInk(<Composer onSubmit={onSubmit} variant="plain" history={['one']} />)
    view.rerender(
      <Composer onSubmit={onSubmit} variant="plain" history={['one', 'sent elsewhere']} />,
    )
    await tick()
    await view.press(KEYS.up)
    expect(lines(view.lastFrame())).toEqual(['› sent elsewhere'])
    // A host list mutated in place is picked up by its length.
    const shared = ['x']
    const again = renderInk(<Composer onSubmit={onSubmit} variant="plain" history={shared} />)
    shared.push('y')
    again.rerender(
      <InkChatProvider>
        <Composer onSubmit={onSubmit} variant="plain" history={shared} />
      </InkChatProvider>,
    )
    await tick()
    await again.press(KEYS.up)
    expect(lines(again.lastFrame())).toEqual(['› y'])
    // Dropping the list empties the history.
    again.rerender(
      <InkChatProvider>
        <Composer onSubmit={onSubmit} variant="plain" />
      </InkChatProvider>,
    )
    await tick()
    await again.press(KEYS.ctrl('u'), KEYS.up)
    expect(lines(again.lastFrame())).toEqual(['› Message'])
  })
})

describe('composerRows', () => {
  it('counts input rows, the attachments row and the border', () => {
    expect(composerRows({ text: '', attachments: [] }, 40)).toBe(3)
    expect(composerRows({ text: 'abcdefgh', attachments: [] }, 8, { variant: 'plain' })).toBe(2)
    expect(
      composerRows({ text: 'a\nb\nc\nd', attachments: [shot] }, 40, {
        variant: 'plain',
        maxRows: 2,
      }),
    ).toBe(3)
    expect(composerRows({ text: 'a', attachments: [] }, 40, { maxRows: 0 })).toBe(3)
  })
})

describe('Composer graphemes', () => {
  const emoji = '😀'
  const family = '👨‍👩‍👧'

  it('moves and deletes whole graphemes, never leaving half a character', async () => {
    const onChange = vi.fn()
    const { lastFrame, press, onSubmit } = plain({ onChange })
    await press('a', emoji, family, 'b', KEYS.left, KEYS.left, KEYS.backspace)
    expect(lines(lastFrame())).toEqual([`› a${family}b`])
    expect(onChange.mock.lastCall?.[0]).toMatchObject({ text: `a${family}b`, caret: 1 })
    await press(KEYS.delete, KEYS.right, 'c', KEYS.enter)
    expect(onSubmit).toHaveBeenCalledWith('abc')
  })

  it('draws a host caret inside a grapheme at its start, with the grapheme whole under it', async () => {
    const onChange = vi.fn()
    const value: ComposerValue = { text: `${emoji}x`, caret: 1, attachments: [] }
    const { lastFrame, press } = plain({ value, onChange })
    await tick()
    expect(lines(lastFrame())).toEqual([`› ${emoji}x`])
    await press('y')
    expect(onChange.mock.lastCall?.[0]).toMatchObject({ text: `y${emoji}x`, caret: 1 })
  })
})
