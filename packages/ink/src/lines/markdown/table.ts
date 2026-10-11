/**
 * GFM tables: rows split on unescaped pipes, columns fitted to the width
 * (natural widths when they fit, else a fair share for the wide ones), cells
 * wrapped in their column. When even the minimum widths do not fit, each row
 * renders as `header: value` lines.
 */
import type { InkGlyphs } from '../../theme'
import type { LineDraft } from '../layout'
import type { Measure } from '../measure'
import { type Span, span } from '../model'
import { mergeSpans, parseInline } from './inline'
import { wrapSpans } from './wrap'

export type Align = 'left' | 'center' | 'right'

/** The narrowest a wrapped column may get before the table falls back. */
export const MIN_COLUMN = 6

const SEPARATOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

/** Whether `line` is a GFM table separator row. */
export function isSeparator(line: string): boolean {
  return line.includes('-') && SEPARATOR.test(line)
}

/** Split a row into cells on pipes that are neither escaped nor inside a code span. */
export function splitRow(line: string): string[] {
  let row = line.trim()
  if (row.startsWith('|')) row = row.slice(1)
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1)
  const cells: string[] = []
  let cell = ''
  let code = 0
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]
    if (ch === '\\' && row[i + 1] === '|') {
      cell += '|'
      i++
    } else if (ch === '`') {
      let run = 0
      while (row[i + run] === '`') run++
      code = code === run ? 0 : code || run
      cell += row.slice(i, i + run)
      i += run - 1
    } else if (ch === '|' && code === 0) {
      cells.push(cell.trim())
      cell = ''
    } else cell += ch
  }
  cells.push(cell.trim())
  return cells
}

/** Column alignments from a separator row. */
export function alignments(line: string): Align[] {
  return splitRow(line).map((cell) =>
    cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left',
  )
}

/**
 * Fit natural widths into `available` cells: columns within a fair share keep
 * theirs, the rest share what remains. Undefined when a column would fall
 * below its minimum (the minimums together exceed the available cells).
 */
export function fitColumns(natural: readonly number[], available: number): number[] | undefined {
  const minimum = natural.map((w) => Math.min(w, MIN_COLUMN))
  if (minimum.reduce((a, b) => a + b, 0) > available) return undefined
  const widths = [...natural]
  let open = natural.map((_, i) => i)
  let budget = available
  for (;;) {
    const fair = Math.floor(budget / open.length)
    const small = open.filter((i) => (natural[i] as number) <= fair)
    if (small.length === 0 || small.length === open.length) break
    for (const i of small) budget -= natural[i] as number
    open = open.filter((i) => !small.includes(i))
  }
  if (open.reduce((sum, i) => sum + (natural[i] as number), 0) <= budget) return widths
  const share = Math.floor(budget / open.length)
  open.forEach((i, k) => {
    widths[i] = share + (k < budget - share * open.length ? 1 : 0)
  })
  // Wide columns get at least the fair share, which the minimum check above keeps ≥ their minimum.
  return widths
}

const width = (spans: readonly Span[], measure: Measure) =>
  spans.reduce((sum, s) => sum + measure(s.text), 0)

function pad(spans: Span[], cells: number, align: Align, last: boolean, measure: Measure): Span[] {
  if (last && spans.length === 0) return []
  const room = Math.max(0, cells - width(spans, measure))
  const before = align === 'right' ? room : align === 'center' ? Math.floor(room / 2) : 0
  const after = last ? 0 : room - before
  return [
    ...(before ? [span(' '.repeat(before), { chrome: true })] : []),
    ...spans,
    ...(after ? [span(' '.repeat(after), { chrome: true })] : []),
  ]
}

/** Drop trailing spaces (an empty last cell leaves the column joint's). */
function trimEnd(spans: Span[]): Span[] {
  const merged = mergeSpans(spans)
  const last = merged.at(-1)
  if (last?.text.endsWith(' ')) merged[merged.length - 1] = { ...last, text: last.text.trimEnd() }
  return mergeSpans(merged)
}

export interface TableEnv {
  glyphs: InkGlyphs
  measure: Measure
}

/** Lay out a table from its header, separator and body source rows. */
export function layoutTable(
  header: string,
  separator: string,
  body: readonly string[],
  maxWidth: number,
  { glyphs, measure }: TableEnv,
): LineDraft[] {
  const heads = splitRow(header)
  const columns = heads.length
  const align = alignments(separator)
  const cells = (row: string, style: Omit<Span, 'text'>) =>
    Array.from({ length: columns }, (_, c) => parseInline(splitRow(row)[c] ?? '', style, glyphs))
  const head = cells(header, { role: 'strong', bold: true })
  const rows = body.map((row) => cells(row, { role: 'content' }))
  const natural = Array.from({ length: columns }, (_, c) =>
    Math.max(1, ...[head, ...rows].map((row) => width(row[c] as Span[], measure))),
  )
  const joint = 3
  const widths = fitColumns(natural, maxWidth - joint * (columns - 1))
  if (!widths) return fallback(head, rows, maxWidth, measure)

  // Padding and joints are layout: a copy gets the cells separated by tabs.
  const column = [
    span(' ', { chrome: true }),
    span(glyphs.tableColumn, { role: 'chrome', chrome: true, copyEach: '\t' }),
    span(' ', { chrome: true }),
  ]
  const drawRow = (row: Span[][]): LineDraft[] => {
    const wrapped = row.map((cell, c) => wrapSpans(cell, widths[c] as number, measure))
    const height = Math.max(...wrapped.map((w) => w.length))
    return Array.from({ length: height }, (_, r) => ({
      spans: trimEnd(
        wrapped.flatMap((w, c) => [
          ...(c > 0 ? column : []),
          ...pad(
            w[r]?.spans ?? [],
            widths[c] as number,
            align[c] ?? 'left',
            c === columns - 1,
            measure,
          ),
        ]),
      ),
    }))
  }
  const rule = widths
    .map((w) => glyphs.rule.repeat(w))
    .join(`${glyphs.rule}${glyphs.tableCross}${glyphs.rule}`)
  return [
    ...drawRow(head),
    { spans: [span(rule, { role: 'chrome' })], frame: true },
    ...rows.flatMap(drawRow),
  ]
}

function fallback(
  head: Span[][],
  rows: Span[][][],
  maxWidth: number,
  measure: Measure,
): LineDraft[] {
  return rows.flatMap((row, r) => [
    ...(r > 0 ? [{ spans: [] }] : []),
    ...row.flatMap((cell, c) =>
      wrapSpans(
        [...(head[c] as Span[]), span(': ', { role: 'muted' }), ...cell],
        maxWidth,
        measure,
      ),
    ),
  ])
}
