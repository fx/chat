/**
 * Wrap styled spans to a width at spaces, keeping each piece's style. Rows
 * after the first join `soft` (at a space) or `hard` (inside a word too long
 * for the line), as plain-text wrapping does.
 */
import { type Measure, graphemes } from '../measure'
import type { Span } from '../model'
import { mergeSpans } from './inline'

export interface SpanRow {
  spans: Span[]
  wrap?: 'soft' | 'hard'
}

interface Word {
  pieces: Span[]
  width: number
  /** The space before this word (carrying its span's style). */
  gap?: Span
}

function words(spans: readonly Span[], measure: Measure): Word[] {
  const out: Word[] = [{ pieces: [], width: 0 }]
  for (const s of spans) {
    s.text.split(' ').forEach((part, i) => {
      if (i > 0) out.push({ pieces: [], width: 0, gap: { ...s, text: ' ' } })
      const word = out.at(-1) as Word
      if (part) {
        word.pieces.push({ ...s, text: part })
        word.width += measure(part)
      }
    })
  }
  return out
}

/** Cut a word's pieces into chunks of at most `max` cells, never inside a grapheme. */
function split(word: Word, max: number, measure: Measure): Word[] {
  const chunks: Word[] = [{ pieces: [], width: 0 }]
  for (const piece of word.pieces) {
    for (const g of graphemes(piece.text)) {
      const w = measure(g)
      let chunk = chunks.at(-1) as Word
      if (chunk.width + w > max && chunk.width > 0) {
        chunk = { pieces: [], width: 0 }
        chunks.push(chunk)
      }
      chunk.pieces.push({ ...piece, text: g })
      chunk.width += w
    }
  }
  return chunks
}

export function wrapSpans(spans: readonly Span[], width: number, measure: Measure): SpanRow[] {
  const max = Math.max(1, width)
  const rows: SpanRow[] = []
  let current: Span[] = []
  let currentWidth = 0
  let join: SpanRow['wrap']
  let started = false
  const push = (next: SpanRow['wrap']) => {
    const spans = mergeSpans(current)
    rows.push(join ? { spans, wrap: join } : { spans })
    current = []
    currentWidth = 0
    started = false
    join = next
  }
  for (const word of words(spans, measure)) {
    const gap = started && word.gap ? 1 : 0
    if (started && currentWidth + gap + word.width > max) push('soft')
    else if (started && word.gap) {
      current.push(word.gap)
      currentWidth += 1
    }
    if (word.width > max) {
      split(word, max, measure).forEach((chunk, i) => {
        if (i > 0) push('hard')
        current.push(...chunk.pieces)
        currentWidth = chunk.width
        started = true
      })
      continue
    }
    current.push(...word.pieces)
    currentWidth += word.width
    started = true
  }
  push(undefined)
  return rows
}
