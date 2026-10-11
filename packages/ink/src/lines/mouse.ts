import { Buffer } from 'node:buffer'
/**
 * Mouse support for the line viewport: SGR mouse reports, the reporting
 * lifecycle, mapping screen cells to lines, selection highlight and copy
 * extraction. Everything but the two hooks is pure.
 */
import type { DOMElement } from 'ink'
import { React, ink } from '../runtime'
import type { InkAppearance } from '../theme'
import { type Measure, graphemes } from './measure'
import type { Line, Span } from './model'

const ESC = String.fromCharCode(27)

/** Button-event tracking with SGR encoding, on and off. */
export const MOUSE_ON = `${ESC}[?1002h${ESC}[?1006h`
export const MOUSE_OFF = `${ESC}[?1006l${ESC}[?1002l`

export interface MouseEvent {
  kind: 'press' | 'release' | 'drag' | 'wheel-up' | 'wheel-down'
  button: 'left' | 'middle' | 'right' | 'none'
  /** Zero-based screen cell. */
  x: number
  y: number
  ctrl: boolean
  shift: boolean
  meta: boolean
}

const BUTTONS = ['left', 'middle', 'right', 'none'] as const
const SGR = new RegExp(`${ESC}\\[<(\\d+);(\\d+);(\\d+)([Mm])`, 'g')

/**
 * Every SGR mouse report in a chunk of terminal input. Horizontal wheel
 * reports (buttons 6 and 7) are dropped: the viewport only scrolls vertically.
 */
export function parseMouse(data: string): MouseEvent[] {
  const reports = Array.from(data.matchAll(SGR)).filter((m) => (Number(m[1]) & 66) !== 66)
  return reports.map((m) => {
    const code = Number(m[1])
    const wheel = (code & 64) !== 0
    const motion = (code & 32) !== 0
    const kind: MouseEvent['kind'] = wheel
      ? code & 1
        ? 'wheel-down'
        : 'wheel-up'
      : m[4] === 'm'
        ? 'release'
        : motion
          ? 'drag'
          : 'press'
    return {
      kind,
      button: wheel ? 'none' : (BUTTONS[code & 3] as MouseEvent['button']),
      x: Number(m[2]) - 1,
      y: Number(m[3]) - 1,
      ctrl: (code & 16) !== 0,
      shift: (code & 4) !== 0,
      meta: (code & 8) !== 0,
    }
  })
}

/** The longest incomplete report kept for the next chunk; a longer one is noise. */
const MAX_PENDING = 64
// A CSI sequence (mouse reports, cell-size replies) and an unfinished one at the end of input.
const CSI_SEQUENCE = new RegExp(`${ESC}\\[[\\x30-\\x3f]*[\\x20-\\x2f]*[\\x40-\\x7e]`, 'g')
const CSI_PARTIAL = new RegExp(`${ESC}(?:\\[[\\x30-\\x3f]*[\\x20-\\x2f]*)?$`)

/**
 * A reader of terminal reports across input chunks: each call returns the
 * complete CSI sequences in what has arrived, keeping an unfinished one at
 * the end for the next chunk (a terminal may split a report anywhere). The
 * kept tail is bounded; past the bound it is dropped as noise.
 */
export function createReportReader(): (data: string) => string[] {
  let pending = ''
  return (data) => {
    let text = pending + data
    pending = ''
    const partial = CSI_PARTIAL.exec(text)
    if (partial) {
      text = text.slice(0, partial.index)
      if (partial[0].length <= MAX_PENDING) pending = partial[0]
    }
    return Array.from(text.matchAll(CSI_SEQUENCE), (m) => m[0])
  }
}

/** An OSC 52 clipboard write of `text`. */
export function osc52(text: string): string {
  return `${ESC}]52;c;${Buffer.from(text, 'utf8').toString('base64')}\u0007`
}

/**
 * The element's position on screen, in cells. This relies on the renderer's
 * layout internals (each node's computed offset from its parent), so it is
 * isolated here.
 */
export function screenOrigin(node: DOMElement | null | undefined): { x: number; y: number } {
  let x = 0
  let y = 0
  for (let n: DOMElement | undefined = node ?? undefined; n; n = n.parentNode) {
    x += n.yogaNode?.getComputedLeft() ?? 0
    y += n.yogaNode?.getComputedTop() ?? 0
  }
  return { x, y }
}

/** A point in the transcript: an absolute line index and a cell column. */
export interface Point {
  line: number
  col: number
}

/** The two ends of a selection, in reading order. */
export function ordered(a: Point, b: Point): [Point, Point] {
  return a.line < b.line || (a.line === b.line && a.col <= b.col) ? [a, b] : [b, a]
}

interface Cell {
  text: string
  start: number
  width: number
  span: Span
}

function cells(line: Line, measure: Measure): Cell[] {
  const out: Cell[] = []
  let at = 0
  for (const s of line.spans) {
    for (const g of graphemes(s.text)) {
      const width = measure(g)
      out.push({ text: g, start: at, width, span: s })
      at += width
    }
  }
  return out
}

/**
 * Whether a grapheme's cells overlap the columns `start`..`end` (inclusive):
 * a point inside a wide grapheme's later cell still takes the whole grapheme.
 */
const within = (cell: Cell, start: number, end: number) =>
  cell.start <= end && cell.start + Math.max(cell.width, 1) > start

/** What a span's grapheme copies as: its replacement, nothing for chrome, else itself. */
const copied = (cell: Cell) =>
  cell.span.copyEach !== undefined ? cell.span.copyEach : cell.span.chrome ? '' : cell.text

/**
 * Copy text between two points (inclusive of the end cell): content spans
 * only, decoration lines skipped, lines right-trimmed, soft joins as a space,
 * hard joins as nothing, other lines by newlines.
 */
export function copyText(lines: readonly Line[], a: Point, b: Point, measure: Measure): string {
  const [from, to] = ordered(a, b)
  let out = ''
  let first = true
  for (let i = from.line; i <= to.line; i++) {
    const line = lines[i]
    if (!line || line.frame) continue
    const start = i === from.line ? from.col : 0
    const end = i === to.line ? to.col : Number.POSITIVE_INFINITY
    const text = cells(line, measure)
      .filter((c) => within(c, start, end))
      .map(copied)
      .join('')
      .trimEnd()
    if (!first) out += line.wrap === 'soft' ? ' ' : line.wrap === 'hard' ? '' : '\n'
    out += text
    first = false
  }
  return out
}

/**
 * Highlight the content cells of a line from `start` to `end` (inclusive) with
 * the selection appearance; selecting past the line's end highlights one more
 * cell. Decoration lines are returned as they are.
 */
export function highlightLine(
  line: Line,
  start: number,
  end: number,
  selection: InkAppearance,
  measure: Measure,
): Line {
  if (line.frame) return line
  const all = cells(line, measure)
  const runs: Array<{ span: Span; selected: boolean; text: string }> = []
  for (const cell of all) {
    const selected = !cell.span.chrome && within(cell, start, end)
    const last = runs.at(-1)
    if (last && last.span === cell.span && last.selected === selected) last.text += cell.text
    else runs.push({ span: cell.span, selected, text: cell.text })
  }
  const spans: Span[] = runs.map(({ span, selected, text }) =>
    selected ? { ...span, text, style: { ...span.style, ...selection } } : { ...span, text },
  )
  const width = all.reduce((sum, c) => sum + c.width, 0)
  if (end >= width && start <= width) spans.push({ text: ' ', style: selection })
  return { ...line, spans }
}

/** Call `handler` with every chunk of raw terminal input while active. */
export function useTerminalData(handler: (data: string) => void, active: boolean) {
  const { stdin } = ink.useStdin()
  const ref = React.useRef(handler)
  ref.current = handler
  React.useEffect(() => {
    if (!active) return
    const listener = (data: unknown) => ref.current(String(data))
    stdin.on('data', listener)
    return () => {
      stdin.off('data', listener)
    }
  }, [active, stdin])
}

/** Enable mouse reporting while active; disable on deactivation, unmount and process exit. */
export function useMouseReporting(active: boolean, write: (data: string) => void) {
  const ref = React.useRef(write)
  ref.current = write
  React.useEffect(() => {
    if (!active) return
    ref.current(MOUSE_ON)
    const off = () => ref.current(MOUSE_OFF)
    process.once('exit', off)
    return () => {
      process.off('exit', off)
      off()
    }
  }, [active])
}
