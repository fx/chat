// @vitest-environment node
import { Box, type DOMElement, Text } from 'ink'
import { cleanup, render } from 'ink-testing-library'
import { act, useRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { plainTheme } from '../theme'
import { defaultMeasure } from './measure'
import { type Line, span } from './model'
import {
  MOUSE_OFF,
  MOUSE_ON,
  copyText,
  highlightLine,
  ordered,
  osc52,
  parseMouse,
  screenOrigin,
  useMouseReporting,
  useTerminalData,
} from './mouse'

const actEnv = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
beforeEach(() => {
  actEnv.IS_REACT_ACT_ENVIRONMENT = true
})
afterEach(() => {
  cleanup()
  actEnv.IS_REACT_ACT_ENVIRONMENT = false
})

const line = (spans: Line['spans'], extra: Partial<Line> = {}): Line => ({
  spans,
  owner: { messageId: 'm' },
  ...extra,
})

describe('parseMouse', () => {
  it('parses presses, drags, releases, wheels and modifiers, zero-based', () => {
    expect(parseMouse('\u001b[<0;3;4M\u001b[<32;5;4M\u001b[<0;5;4m')).toEqual([
      { kind: 'press', button: 'left', x: 2, y: 3, ctrl: false, shift: false, meta: false },
      { kind: 'drag', button: 'left', x: 4, y: 3, ctrl: false, shift: false, meta: false },
      { kind: 'release', button: 'left', x: 4, y: 3, ctrl: false, shift: false, meta: false },
    ])
    expect(parseMouse('\u001b[<64;1;1M\u001b[<65;1;1M').map((e) => [e.kind, e.button])).toEqual([
      ['wheel-up', 'none'],
      ['wheel-down', 'none'],
    ])
    expect(parseMouse('\u001b[<30;1;1M')[0]).toMatchObject({
      button: 'right',
      ctrl: true,
      shift: true,
      meta: true,
    })
    expect(parseMouse('\u001b[<1;1;1M\u001b[<3;1;1m').map((e) => e.button)).toEqual([
      'middle',
      'none',
    ])
    expect(parseMouse('plain')).toEqual([])
  })
})

describe('osc52 and ordering', () => {
  it('encodes the clipboard write and orders points', () => {
    expect(osc52('hé')).toBe('\u001b]52;c;aMOp\u0007')
    const a = { line: 2, col: 5 }
    const b = { line: 1, col: 9 }
    expect(ordered(a, b)).toEqual([b, a])
    expect(ordered(b, a)).toEqual([b, a])
    expect(ordered({ line: 1, col: 3 }, { line: 1, col: 1 })).toEqual([
      { line: 1, col: 1 },
      { line: 1, col: 3 },
    ])
  })
})

describe('copyText', () => {
  const lines = [
    line([span('│ ', { chrome: true }), span('one two', { role: 'content' })]),
    line([span('│ ', { chrome: true }), span('three  ')], { wrap: 'soft' }),
    line([span('──', { role: 'chrome' })], { frame: true }),
    line([span('│ ', { chrome: true }), span('ab')]),
    line([span('cd')], { wrap: 'hard' }),
    line([span('▸ ', { chrome: true, copyEach: ' ' }), span('x')]),
  ]

  it('copies content only, skipping decoration, joining soft and hard wraps', () => {
    expect(copyText(lines, { line: 0, col: 0 }, { line: 5, col: 99 }, defaultMeasure)).toBe(
      'one two three\nabcd\n  x',
    )
  })

  it('honours partial columns and either drag direction', () => {
    expect(copyText(lines, { line: 0, col: 6 }, { line: 0, col: 2 }, defaultMeasure)).toBe('one t')
    expect(copyText(lines, { line: 1, col: 99 }, { line: 0, col: 6 }, defaultMeasure)).toBe(
      'two three',
    )
    expect(copyText(lines, { line: 9, col: 0 }, { line: 9, col: 3 }, defaultMeasure)).toBe('')
  })
})

describe('highlightLine', () => {
  const sel = plainTheme.selection
  it('highlights content cells in range, never chrome', () => {
    const out = highlightLine(
      line([span('│ ', { chrome: true }), span('abcd', { role: 'content' })]),
      0,
      3,
      sel,
      defaultMeasure,
    )
    expect(out.spans).toEqual([
      { text: '│ ', chrome: true },
      { text: 'ab', role: 'content', style: sel },
      { text: 'cd', role: 'content' },
    ])
  })

  it('highlights one cell past the end, and leaves decoration alone', () => {
    const plain = line([span('ab')])
    expect(highlightLine(plain, 1, Number.POSITIVE_INFINITY, sel, defaultMeasure).spans).toEqual([
      { text: 'a' },
      { text: 'b', style: sel },
      { text: ' ', style: sel },
    ])
    expect(highlightLine(plain, 5, 9, sel, defaultMeasure).spans).toEqual([{ text: 'ab' }])
    const frame = line([span('──')], { frame: true })
    expect(highlightLine(frame, 0, 9, sel, defaultMeasure)).toBe(frame)
  })
})

describe('screenOrigin', () => {
  it('sums layout offsets up the tree', async () => {
    let found = { x: -1, y: -1 }
    function Probe() {
      const ref = useRef<DOMElement>(null)
      const [, set] = useState(0)
      return (
        <Box flexDirection="column" paddingTop={2}>
          <Text>head</Text>
          <Box paddingLeft={3} marginLeft={1}>
            <Box
              ref={(node) => {
                ref.current = node
                if (node && found.x === -1) {
                  queueMicrotask(() => {
                    found = screenOrigin(ref.current)
                    set(1)
                  })
                }
              }}
            >
              <Text>x</Text>
            </Box>
          </Box>
        </Box>
      )
    }
    await act(async () => {
      render(<Probe />)
      await new Promise((r) => setTimeout(r, 10))
    })
    expect(found).toEqual({ x: 4, y: 3 })
    expect(screenOrigin(null)).toEqual({ x: 0, y: 0 })
    // Nodes without a layout node add nothing.
    expect(screenOrigin({ parentNode: undefined } as unknown as DOMElement)).toEqual({ x: 0, y: 0 })
  })
})

describe('terminal hooks', () => {
  it('taps raw input while active and toggles mouse reporting with its lifecycle', async () => {
    const seen: string[] = []
    const write = vi.fn()
    function Probe({ active }: { active: boolean }) {
      useTerminalData((data) => seen.push(data), active)
      useMouseReporting(active, write)
      return <Text>x</Text>
    }
    const once = vi.spyOn(process, 'once')
    let view = render(<Probe active={false} />)
    view.stdin.write('a')
    expect(seen).toEqual([])
    expect(write).not.toHaveBeenCalled()
    await act(async () => {
      view.rerender(<Probe active />)
    })
    view.stdin.write('\u001b[<0;1;1M')
    expect(seen).toEqual(['\u001b[<0;1;1M'])
    expect(write).toHaveBeenLastCalledWith(MOUSE_ON)
    const onExit = once.mock.calls.find(([event]) => event === 'exit')?.[1] as () => void
    onExit()
    expect(write).toHaveBeenLastCalledWith(MOUSE_OFF)
    once.mockRestore()
    await act(async () => {
      view.rerender(<Probe active={false} />)
    })
    expect(write).toHaveBeenCalledTimes(3)
    view.stdin.write('b')
    expect(seen).toHaveLength(1)
    await act(async () => {
      view.rerender(<Probe active />)
    })
    view.unmount()
    expect(write).toHaveBeenLastCalledWith(MOUSE_OFF)
    view = render(<Probe active={false} />)
    view.unmount()
  })
})
