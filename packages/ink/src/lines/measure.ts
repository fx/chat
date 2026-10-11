/**
 * Terminal-cell measurement and cutting: wide and emoji characters count 2,
 * combining marks 0 — the measure Ink lays out by, so a wrapped line ends where
 * Ink's edge is. The measure is injectable.
 */
import stringWidth from 'string-width'

export type Measure = (text: string) => number

const segmenter = new Intl.Segmenter()

/**
 * `width`'s results (default: `string-width`, which Ink measures with), with
 * each distinct grapheme cluster measured once. The package sums independent
 * per-cluster widths, so caching changes no result; on Bun its emoji check is
 * pathologically slow and the same few clusters are measured over and over.
 * Text with ANSI escapes goes to `width` as it is (stripping spans clusters).
 * The cache is bounded and starts over when full.
 */
export function cachedMeasure(width: Measure = stringWidth, limit = 4096): Measure {
  const cache = new Map<string, number>()
  return (text) => {
    if (/^[\u0020-\u007E]*$/.test(text)) return text.length
    if (text.includes('\u001B') || text.includes('\u009B')) return width(text)
    let total = 0
    for (const { segment } of segmenter.segment(text)) {
      let cluster = cache.get(segment)
      if (cluster === undefined) {
        cluster = width(segment)
        if (cache.size >= limit) cache.clear()
        cache.set(segment, cluster)
      }
      total += cluster
    }
    return total
  }
}

export const defaultMeasure: Measure = cachedMeasure()

/** Grapheme clusters of `text` (so a wide or combined character is never split). */
export function graphemes(text: string): string[] {
  return Array.from(segmenter.segment(text), (s) => s.segment)
}

/** The first grapheme cluster of `text` ('' when empty), segmenting no further. */
export function firstGrapheme(text: string): string {
  for (const { segment } of segmenter.segment(text)) return segment
  return ''
}

/** Cut `text` to at most `cells`, ending with `…` when cut. */
export function truncate(text: string, cells: number, measure: Measure = defaultMeasure): string {
  if (measure(text) <= cells) return text
  if (cells <= 0) return ''
  let out = ''
  let width = 0
  for (const g of graphemes(text)) {
    const w = measure(g)
    if (width + w > cells - 1) break
    out += g
    width += w
  }
  return `${out}…`
}

/** Split `text` into pieces of at most `cells` each, never inside a grapheme. */
export function hardSplit(
  text: string,
  cells: number,
  measure: Measure = defaultMeasure,
): string[] {
  const pieces: string[] = []
  let current = ''
  let width = 0
  for (const g of graphemes(text)) {
    const w = measure(g)
    if (width + w > cells && current) {
      pieces.push(current)
      current = ''
      width = 0
    }
    current += g
    width += w
  }
  if (current || pieces.length === 0) pieces.push(current)
  return pieces
}

/** One wrapped row and how it joins the previous row when copied. */
export interface WrappedRow {
  text: string
  wrap?: 'soft' | 'hard'
}

/**
 * Wrap one paragraph (no newlines) to `width` cells at spaces. A word longer
 * than the line is split with a `hard` join; other continuation rows are
 * `soft` (a copy rejoins them with a space).
 */
export function wrapText(
  text: string,
  width: number,
  measure: Measure = defaultMeasure,
): WrappedRow[] {
  const max = Math.max(1, width)
  const words = text.split(' ')
  const rows: WrappedRow[] = []
  let current = ''
  let currentWidth = 0
  let join: WrappedRow['wrap']
  const push = (next: WrappedRow['wrap']) => {
    rows.push(join ? { text: current, wrap: join } : { text: current })
    current = ''
    currentWidth = 0
    join = next
  }
  for (const word of words) {
    const w = measure(word)
    const gap = current ? 1 : 0
    if (current && currentWidth + gap + w > max) push('soft')
    if (w > max) {
      const pieces = hardSplit(word, max, measure)
      pieces.forEach((piece, i) => {
        if (i > 0) push('hard')
        current = piece
        currentWidth = measure(piece)
      })
      continue
    }
    current = current ? `${current} ${word}` : word
    currentWidth += (current === word ? 0 : 1) + w
  }
  push(undefined)
  return rows
}

/** Wrap text with newlines: each line wrapped on its own (hard line breaks stay). */
export function wrapLines(
  text: string,
  width: number,
  measure: Measure = defaultMeasure,
): WrappedRow[] {
  return text.split('\n').flatMap((line) => wrapText(line, width, measure))
}
