/**
 * The default terminal markdown layout: a line-oriented block scanner
 * (fences, tables, lists, quotes, headings, rules, paragraphs) laying each
 * block out to the width with injected roles and glyphs. Dependency-free and
 * replaceable; not CommonMark-complete (HTML blocks, reference links and
 * setext headings render as text).
 */
import type { InkGlyphs } from '../../theme'
import type { LineDraft, MarkdownLayout } from '../layout'
import { type Measure, hardSplit } from '../measure'
import { type Span, span } from '../model'
import { parseInline } from './inline'
import { isSeparator, layoutTable } from './table'
import { wrapSpans } from './wrap'

export interface MarkdownEnv {
  measure: Measure
  glyphs: InkGlyphs
  streaming?: boolean | undefined
  image?: ((src: string, alt: string, width: number) => LineDraft[] | undefined) | undefined
}

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)/
const HEADING = /^ {0,3}(#{1,6})(?:\s+(.*?))?(?:\s+#+)?\s*$/
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/
const QUOTE = /^ {0,3}> ?/
const ITEM = /^( *)([-*+]|\d{1,9}[.)])(?: +(.*))?$/
const IMAGE_LINE = /^!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?(?:\s+"[^"]*")?\s*\)$/

const blank = (line: string | undefined) => line === undefined || line.trim() === ''

function startsBlock(lines: readonly string[], i: number): boolean {
  const line = lines[i] as string
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    ITEM.test(line) ||
    isTableStart(lines, i)
  )
}

function isTableStart(lines: readonly string[], i: number): boolean {
  return (lines[i] as string).includes('|') && isSeparator(lines[i + 1] ?? '')
}

const indentOf = (line: string) => line.length - line.trimStart().length

/** Prefix laid-out lines: `first` on the first line, `rest` on the others. */
function hang(lines: LineDraft[], first: Span[], rest: Span[]): LineDraft[] {
  return lines.map((line, i) => ({ ...line, spans: [...(i === 0 ? first : rest), ...line.spans] }))
}

function paragraph(source: string[], width: number, env: MarkdownEnv): LineDraft[] {
  const only = source.length === 1 ? IMAGE_LINE.exec((source[0] as string).trim()) : null
  if (only && env.image) {
    const lines = env.image(only[2] as string, only[1] as string, width)
    if (lines) return lines
  }
  // A trailing double space or backslash ends a line hard; other breaks reflow.
  const segments: string[] = ['']
  source.forEach((raw, i) => {
    const hard = i < source.length - 1 && /(?: {2,}|\\)$/.test(raw)
    const text = raw.trim().replace(/\\$/, '')
    const at = segments.length - 1
    segments[at] = segments[at] ? `${segments[at]} ${text}` : text
    if (hard) segments.push('')
  })
  return segments.flatMap((text) =>
    wrapSpans(parseInline(text, { role: 'content' }, env.glyphs), width, env.measure),
  )
}

function fence(
  lines: readonly string[],
  i: number,
  width: number,
  env: MarkdownEnv,
): [LineDraft[], number] {
  const [, marker, lang] = FENCE.exec(lines[i] as string) as unknown as [string, string, string]
  const indent = indentOf(lines[i] as string)
  const close = new RegExp(`^ {0,3}${marker[0] === '`' ? '`' : '~'}{${marker.length},}\\s*$`)
  let j = i + 1
  const code: string[] = []
  while (j < lines.length && !close.test(lines[j] as string)) {
    const line = lines[j] as string
    code.push(line.slice(Math.min(indent, indentOf(line))))
    j++
  }
  const bar = span(`${env.glyphs.codeBar} `, { role: 'chrome', dim: true, chrome: true })
  const inner = Math.max(1, width - 2)
  const out: LineDraft[] = []
  if (lang) out.push({ spans: [bar, span(lang, { role: 'muted', dim: true })], frame: true })
  for (const line of code) {
    hardSplit(line.replace(/\t/g, '  '), inner, env.measure).forEach((piece, k) => {
      out.push({
        spans: [bar, ...(piece ? [span(piece, { role: 'code' })] : [])],
        ...(k > 0 ? { wrap: 'hard' as const } : {}),
      })
    })
  }
  // An unclosed fence (streaming or not) is code to the end.
  return [out, j < lines.length ? j + 1 : j]
}

function list(
  lines: readonly string[],
  i: number,
  width: number,
  env: MarkdownEnv,
): [LineDraft[], number] {
  const first = ITEM.exec(lines[i] as string) as RegExpExecArray
  const indent = (first[1] as string).length
  const ordered = /\d/.test(first[2] as string)
  let number = ordered ? Number.parseInt(first[2] as string, 10) : 0
  const out: LineDraft[] = []
  let j = i
  while (j < lines.length) {
    const match = ITEM.exec(lines[j] as string)
    if (!match || (match[1] as string).length !== indent) break
    if (/\d/.test(match[2] as string) !== ordered) break
    const content = indent + (match[2] as string).length + 1
    const body: string[] = [match[3] ?? '']
    j++
    while (j < lines.length) {
      const line = lines[j] as string
      if (blank(line)) {
        const next = lines[j + 1]
        if (next !== undefined && !blank(next) && indentOf(next) >= content) {
          body.push('')
          j++
          continue
        }
        break
      }
      if (indentOf(line) > indent) body.push(line.slice(Math.min(content, indentOf(line))))
      else if (!startsBlock(lines, j)) body.push(line.trim())
      else break
      j++
    }
    let marker: string
    if (ordered) marker = `${number++}${(match[2] as string).slice(-1)}`
    else marker = env.glyphs.bullet
    const task = /^\[([ xX])\] /.exec(body[0] as string)
    if (task) {
      marker = task[1] === ' ' ? env.glyphs.taskOpen : env.glyphs.taskDone
      body[0] = (body[0] as string).slice(4)
    }
    const markerWidth = env.measure(marker) + 1
    const inner = layoutBlocks(body, Math.max(1, width - markerWidth), env, true)
    out.push(
      ...hang(
        inner.length ? inner : [{ spans: [] }],
        [span(`${marker} `, { role: 'marker', chrome: true })],
        [span(' '.repeat(markerWidth), { chrome: true })],
      ),
    )
    if (
      blank(lines[j]) &&
      ITEM.test(lines[j + 1] ?? '') &&
      indentOf(lines[j + 1] as string) === indent
    )
      j++
  }
  return [out, j]
}

/** Lay out markdown source lines as blocks; `tight` drops the blank lines between blocks. */
export function layoutBlocks(
  lines: readonly string[],
  width: number,
  env: MarkdownEnv,
  tight = false,
): LineDraft[] {
  const out: LineDraft[] = []
  const add = (block: LineDraft[]) => {
    if (out.length && !tight) out.push({ spans: [] })
    out.push(...block)
  }
  let i = 0
  while (i < lines.length) {
    const line = lines[i] as string
    if (blank(line)) {
      i++
      continue
    }
    if (FENCE.test(line)) {
      const [block, next] = fence(lines, i, width, env)
      add(block)
      i = next
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      add(
        wrapSpans(
          parseInline(heading[2] ?? '', { role: 'strong', bold: true }, env.glyphs),
          width,
          env.measure,
        ),
      )
      i++
      continue
    }
    if (RULE.test(line)) {
      add([
        {
          spans: [span(env.glyphs.rule.repeat(width), { role: 'chrome', dim: true })],
          frame: true,
        },
      ])
      i++
      continue
    }
    if (QUOTE.test(line)) {
      const quoted: string[] = []
      while (i < lines.length && QUOTE.test(lines[i] as string)) {
        quoted.push((lines[i] as string).replace(QUOTE, ''))
        i++
      }
      const bar = span(`${env.glyphs.quoteBar} `, { role: 'chrome', dim: true, chrome: true })
      const inner = layoutBlocks(quoted, Math.max(1, width - 2), env)
      add(hang(inner, [bar], [bar]))
      continue
    }
    if (ITEM.test(line)) {
      const [block, next] = list(lines, i, width, env)
      add(block)
      i = next
      continue
    }
    if (isTableStart(lines, i)) {
      const body: string[] = []
      let j = i + 2
      while (j < lines.length && !blank(lines[j]) && (lines[j] as string).includes('|')) {
        body.push(lines[j] as string)
        j++
      }
      add(layoutTable(line, lines[i + 1] as string, body, width, env))
      i = j
      continue
    }
    const source: string[] = [line]
    i++
    while (i < lines.length && !blank(lines[i]) && !startsBlock(lines, i)) {
      source.push(lines[i] as string)
      i++
    }
    add(paragraph(source, width, env))
  }
  return out
}

/**
 * Split source lines into top-level chunks at blank lines that end a block:
 * never inside a fence, and not where an indented line or a list item
 * continues the block before. Chunks lay out independently.
 */
export function chunks(lines: readonly string[]): string[][] {
  const out: string[][] = []
  let current: string[] = []
  let fence: RegExp | undefined
  // The next non-blank line after each index, in one backward pass.
  const nextText: Array<string | undefined> = []
  for (let i = lines.length - 1, seen: string | undefined; i >= 0; i--) {
    nextText[i] = seen
    if (!blank(lines[i])) seen = lines[i]
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string
    if (fence) {
      if (fence.test(line)) fence = undefined
      current.push(line)
      continue
    }
    const open = FENCE.exec(line)
    if (open) {
      const marker = open[1] as string
      fence = new RegExp(`^ {0,3}${marker[0] === '`' ? '`' : '~'}{${marker.length},}\\s*$`)
      current.push(line)
      continue
    }
    if (blank(line)) {
      // Blank lines between chunks belong to neither.
      if (current.length === 0) continue
      const next = nextText[i]
      if (next !== undefined && indentOf(next) === 0 && !ITEM.test(next)) {
        out.push(current)
        current = []
        continue
      }
    }
    current.push(line)
  }
  if (current.length) out.push(current)
  return out
}

/** Laid-out chunks per glyph set and measure, keyed by width and source. */
const chunkCache = new WeakMap<object, WeakMap<object, Map<string, LineDraft[]>>>()
const CHUNK_CACHE_SIZE = 4000

function cached(env: MarkdownEnv): Map<string, LineDraft[]> {
  let byMeasure = chunkCache.get(env.glyphs)
  if (!byMeasure) {
    byMeasure = new WeakMap()
    chunkCache.set(env.glyphs, byMeasure)
  }
  let map = byMeasure.get(env.measure)
  if (!map) {
    map = new Map()
    byMeasure.set(env.measure, map)
  }
  return map
}

/**
 * The default terminal markdown: dependency-free, injected roles and glyphs.
 * Finished blocks are cached, so a streamed delta lays out only the tail.
 */
export const terminalMarkdown: MarkdownLayout = (source, width, options) => {
  const w = Math.max(1, width)
  const cache = cached(options)
  const out: LineDraft[] = []
  for (const chunk of chunks(source.replace(/\r\n?/g, '\n').split('\n'))) {
    const text = chunk.join('\n')
    // Image lines depend on the image hook's state; lay those out every time.
    const cacheable = !(options.image && text.includes('!['))
    const key = `${w}\n${text}`
    let lines = cacheable ? cache.get(key) : undefined
    if (!lines) {
      lines = layoutBlocks(chunk, w, options)
      if (cacheable) {
        if (cache.size >= CHUNK_CACHE_SIZE) cache.clear()
        cache.set(key, lines)
      }
    }
    if (lines.length === 0) continue
    if (out.length) out.push({ spans: [] })
    out.push(...lines)
  }
  return out
}
