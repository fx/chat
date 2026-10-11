/**
 * Inline markdown → spans: code spans, emphasis at word boundaries, strike,
 * links and autolinks, images as text, backslash escapes. Unmatched markers
 * stay as written.
 */
import type { InkGlyphs } from '../../theme'
import type { Span } from '../model'

/** The attributes inline markup sets on a span. */
export type InlineStyle = Omit<Span, 'text'>

const PUNCTUATION = /[!-/:-@[-`{-~]/
const WORD = /[\p{L}\p{N}]/u
const SPACE = /\s/

/** Show a source the way a reader can use it: a `data:` URL as its type. */
export function describeSource(src: string): string {
  if (!src.startsWith('data:')) return src
  return src.slice(5).split(/[;,]/)[0] || 'data'
}

/** Merge adjacent spans with identical attributes. */
export function mergeSpans(spans: readonly Span[]): Span[] {
  const out: Span[] = []
  for (const s of spans) {
    if (s.text === '') continue
    const last = out.at(-1)
    if (last && sameStyle(last, s)) out[out.length - 1] = { ...last, text: last.text + s.text }
    else out.push(s)
  }
  return out
}

function sameStyle(a: Span, b: Span): boolean {
  return (
    a.role === b.role &&
    a.style === b.style &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.dim === b.dim &&
    a.underline === b.underline &&
    a.strike === b.strike &&
    a.inverse === b.inverse &&
    a.color === b.color &&
    a.chrome === b.chrome &&
    a.copyEach === b.copyEach
  )
}

/** End of the code span opening at `i` (index after its closing run), or -1. */
function codeSpanEnd(text: string, i: number): number {
  let run = 0
  while (text[i + run] === '`') run++
  const fence = '`'.repeat(run)
  let j = text.indexOf(fence, i + run)
  while (j !== -1) {
    let k = 0
    while (text[j + k] === '`') k++
    if (k === run) return j + run
    j = text.indexOf(fence, j + k)
  }
  return -1
}

/** Index of the bracket closing the one at `open`, skipping code spans and escapes. */
function matching(text: string, open: number, left: string, right: string): number {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\\') i++
    else if (ch === '`') {
      const end = codeSpanEnd(text, i)
      if (end !== -1) i = end - 1
    } else if (ch === left) depth++
    else if (ch === right && --depth === 0) return i
  }
  return -1
}

function runLength(text: string, i: number): number {
  let n = 0
  while (text[i + n] === text[i]) n++
  return n
}

const isWordChar = (ch: string | undefined) => ch !== undefined && WORD.test(ch)
const isSpace = (ch: string | undefined) => ch === undefined || SPACE.test(ch)

/** Where the emphasis run opening at `i` (length `run`) closes, or -1. */
function closer(text: string, i: number, run: number): number {
  const marker = text[i] as string
  for (let j = i + run; j < text.length; j++) {
    const ch = text[j]
    if (ch === '\\') {
      j++
      continue
    }
    if (ch === '`') {
      const end = codeSpanEnd(text, j)
      if (end !== -1) j = end - 1
      continue
    }
    if (ch !== marker) continue
    const n = runLength(text, j)
    if (n === run && !isSpace(text[j - 1]) && !isWordChar(text[j + n]) && j > i + run) return j
    j += n - 1
  }
  return -1
}

/** A bare `http(s)://` URL at `i`, trailing punctuation excluded. */
function bareUrl(text: string, i: number): string | undefined {
  const match = /^https?:\/\/[^\s<>]+/.exec(text.slice(i))
  if (!match) return undefined
  return match[0].replace(/[.,;:!?'")\]]+$/, '')
}

/** Parse inline markdown into spans, every span starting from `base`. */
export function parseInline(text: string, base: InlineStyle, glyphs: InkGlyphs): Span[] {
  const out: Span[] = []
  let plain = ''
  const flush = () => {
    if (plain) out.push({ text: plain, ...base })
    plain = ''
  }
  const emit = (spans: Span[]) => {
    flush()
    out.push(...spans)
  }
  let i = 0
  while (i < text.length) {
    const ch = text[i] as string
    const prev = text[i - 1]
    if (ch === '\\' && i + 1 < text.length && PUNCTUATION.test(text[i + 1] as string)) {
      plain += text[i + 1]
      i += 2
      continue
    }
    if (ch === '`') {
      const end = codeSpanEnd(text, i)
      if (end !== -1) {
        const run = runLength(text, i)
        let code = text.slice(i + run, end - run)
        if (code.startsWith(' ') && code.endsWith(' ') && code.trim()) code = code.slice(1, -1)
        emit([{ text: code, ...base, role: 'code' }])
        i = end
        continue
      }
      const run = runLength(text, i)
      plain += text.slice(i, i + run)
      i += run
      continue
    }
    if ((ch === '[' || (ch === '!' && text[i + 1] === '[')) && text.length > i + 1) {
      const image = ch === '!'
      const open = image ? i + 1 : i
      const close = matching(text, open, '[', ']')
      if (close !== -1 && text[close + 1] === '(') {
        const end = matching(text, close + 1, '(', ')')
        if (end !== -1) {
          const label = text.slice(open + 1, close)
          const url = text
            .slice(close + 2, end)
            .trim()
            .replace(/\s+"[^"]*"$/, '')
            .replace(/^<(.*)>$/, '$1')
          if (image) {
            emit([
              { text: `${glyphs.image} `, ...base },
              ...(label ? [{ text: `${label} `, ...base }] : []),
              { text: `(${describeSource(url)})`, ...base, role: 'muted' },
            ])
          } else {
            emit(parseInline(label, { ...base, role: 'link' }, glyphs))
            if (url && url !== label) emit([{ text: ` (${url})`, ...base, role: 'muted' }])
          }
          i = end + 1
          continue
        }
      }
    }
    if (ch === '<') {
      const match = /^<((?:https?|mailto):[^\s<>]+)>/.exec(text.slice(i))
      if (match) {
        emit([{ text: match[1] as string, ...base, role: 'link' }])
        i += match[0].length
        continue
      }
    }
    if (ch === 'h' && (prev === undefined || /[\s(]/.test(prev))) {
      const url = bareUrl(text, i)
      if (url) {
        emit([{ text: url, ...base, role: 'link' }])
        i += url.length
        continue
      }
    }
    if (ch === '*' || ch === '_' || ch === '~') {
      const run = runLength(text, i)
      const valid = ch === '~' ? run === 2 : run <= 3
      if (valid && !isWordChar(prev) && !isSpace(text[i + run])) {
        const end = closer(text, i, run)
        if (end !== -1) {
          const style: InlineStyle =
            ch === '~'
              ? { strike: true }
              : run === 1
                ? { italic: true }
                : run === 2
                  ? { bold: true }
                  : { bold: true, italic: true }
          emit(parseInline(text.slice(i + run, end), { ...base, ...style }, glyphs))
          i = end + run
          continue
        }
      }
      plain += text.slice(i, i + run)
      i += run
      continue
    }
    plain += ch
    i++
  }
  flush()
  return mergeSpans(out)
}
