import { describe, expect, it } from 'vitest'
import { asciiGlyphs, plainGlyphs } from '../../theme'
import type { LineDraft } from '../layout'
import { defaultMeasure } from '../measure'
import type { Span } from '../model'
import {
  alignments,
  chunks,
  describeSource,
  fitColumns,
  isSeparator,
  layoutBlocks,
  layoutTable,
  mergeSpans,
  parseInline,
  splitRow,
  terminalMarkdown,
  wrapSpans,
} from './index'

const env = { measure: defaultMeasure, glyphs: plainGlyphs }
const md = (
  source: string,
  width = 40,
  extra: Partial<Parameters<typeof terminalMarkdown>[2]> = {},
) => terminalMarkdown(source, width, { ...env, ...extra })
const text = (line: LineDraft) => line.spans.map((s) => s.text).join('')
const texts = (lines: LineDraft[]) => lines.map(text)
const inline = (source: string) => parseInline(source, { role: 'content' }, plainGlyphs)
const find = (spans: Span[], t: string) => spans.find((s) => s.text === t)

describe('parseInline', () => {
  it('styles emphasis, strike and code', () => {
    const spans = inline('a *i* _j_ **b** __c__ ***d*** ~~s~~ `x`')
    expect(find(spans, 'i')).toMatchObject({ italic: true })
    expect(find(spans, 'j')).toMatchObject({ italic: true })
    expect(find(spans, 'b')).toMatchObject({ bold: true })
    expect(find(spans, 'c')).toMatchObject({ bold: true })
    expect(find(spans, 'd')).toMatchObject({ bold: true, italic: true })
    expect(find(spans, 's')).toMatchObject({ strike: true })
    expect(find(spans, 'x')).toMatchObject({ role: 'code' })
  })

  it('opens and closes emphasis only at word boundaries', () => {
    for (const source of [
      '*open',
      'snake_case_name',
      '2*3*4',
      'file__name__x',
      '* a *',
      '~x~',
      '****x****',
    ]) {
      expect(
        inline(source)
          .map((s) => s.text)
          .join(''),
      ).toBe(source)
      expect(inline(source).some((s) => s.italic || s.bold || s.strike)).toBe(false)
    }
    expect(inline('*a* b*')).toContainEqual({ text: 'a', role: 'content', italic: true })
    expect(
      inline('*a b*c d*')
        .map((s) => s.text)
        .join(''),
    ).toBe('a b*c d')
  })

  it('nests emphasis and links', () => {
    const spans = inline('**bold *it* [l *e*](u)**')
    expect(find(spans, 'it')).toMatchObject({ bold: true, italic: true })
    expect(find(spans, 'e')).toMatchObject({ role: 'link', bold: true, italic: true })
    expect(find(spans, ' (u)')).toMatchObject({ role: 'muted', bold: true })
  })

  it('skips code spans and escapes when finding a closer', () => {
    expect(find(inline('*a `*` b*'), '*')).toMatchObject({ role: 'code', italic: true })
    expect(inline('*a ** b*')).toEqual([{ text: 'a ** b', role: 'content', italic: true }])
    expect(inline('*a \\* b*')).toEqual([{ text: 'a * b', role: 'content', italic: true }])
  })

  it('unescapes punctuation only', () => {
    expect(inline('\\*no\\* \\a \\')).toEqual([{ text: '*no* \\a \\', role: 'content' }])
  })

  it('handles code span runs, padding and unclosed backticks', () => {
    expect(inline('``a`b``')).toEqual([{ text: 'a`b', role: 'code' }])
    expect(inline('` x `')).toEqual([{ text: 'x', role: 'code' }])
    expect(inline('`  `')).toEqual([{ text: '  ', role: 'code' }])
    expect(inline('a ``b` c')).toEqual([{ text: 'a ``b` c', role: 'content' }])
    expect(inline('``a```b')).toEqual([{ text: '``a```b', role: 'content' }])
  })

  it('lays out links: muted URL unless it equals the text', () => {
    expect(inline('[t](https://x "title")')).toEqual([
      { text: 't', role: 'link' },
      { text: ' (https://x)', role: 'muted' },
    ])
    expect(inline('[https://x](<https://x>)')).toEqual([{ text: 'https://x', role: 'link' }])
    expect(inline('[t]()')).toEqual([{ text: 't', role: 'link' }])
    expect(inline('[a [b] `]` \\]](u)')[0]).toEqual({ text: 'a [b] ', role: 'link' })
  })

  it('leaves brackets that are not links as written', () => {
    for (const source of ['[a]', '[a] (b)', '[a](b', '[a', '!', '![a]', 'x [']) {
      expect(
        inline(source)
          .map((s) => s.text)
          .join(''),
      ).toBe(source)
    }
  })

  it('autolinks bracketed and bare URLs', () => {
    expect(inline('<mailto:a@b> <https://x/y>')).toEqual([
      { text: 'mailto:a@b', role: 'link' },
      { text: ' ', role: 'content' },
      { text: 'https://x/y', role: 'link' },
    ])
    expect(inline('see (https://x.y/z).')).toEqual([
      { text: 'see (', role: 'content' },
      { text: 'https://x.y/z', role: 'link' },
      { text: ').', role: 'content' },
    ])
    expect(inline('xhttps://a <nope> http')).toEqual([
      { text: 'xhttps://a <nope> http', role: 'content' },
    ])
  })

  it('shows images as glyph, alt and source (a data URL as its type)', () => {
    expect(inline('![cat](https://i/c.png)')).toEqual([
      { text: '▣ cat ', role: 'content' },
      { text: '(https://i/c.png)', role: 'muted' },
    ])
    expect(
      inline('![](data:image/png;base64,AAAA)')
        .map((s) => s.text)
        .join(''),
    ).toBe('▣ (image/png)')
  })
})

describe('describeSource', () => {
  it('keeps URLs and reduces data URLs to their type', () => {
    expect(describeSource('https://x')).toBe('https://x')
    expect(describeSource('data:text/plain,hi')).toBe('text/plain')
    expect(describeSource('data:,hi')).toBe('data')
  })
})

describe('mergeSpans', () => {
  it('merges equal neighbours and drops empty spans', () => {
    expect(
      mergeSpans([
        { text: 'a', role: 'content' },
        { text: '' },
        { text: 'b', role: 'content' },
        { text: 'c', role: 'content', bold: true },
        { text: 'd', role: 'content', italic: true },
      ]),
    ).toEqual([
      { text: 'ab', role: 'content' },
      { text: 'c', role: 'content', bold: true },
      { text: 'd', role: 'content', italic: true },
    ])
  })
})

describe('wrapSpans', () => {
  it('wraps at spaces keeping styles, splitting long words hard', () => {
    const rows = wrapSpans(
      [{ text: 'aa ', role: 'content' }, { text: 'bb cc', bold: true }, { text: ' dddddddd' }],
      5,
      defaultMeasure,
    )
    expect(rows).toEqual([
      {
        spans: [
          { text: 'aa ', role: 'content' },
          { text: 'bb', bold: true },
        ],
      },
      { spans: [{ text: 'cc', bold: true }], wrap: 'soft' },
      { spans: [{ text: 'ddddd' }], wrap: 'soft' },
      { spans: [{ text: 'ddd' }], wrap: 'hard' },
    ])
  })

  it('splits a long first word across styles, and yields one empty row for nothing', () => {
    expect(wrapSpans([{ text: 'ab' }, { text: 'cd', bold: true }], 3, defaultMeasure)).toEqual([
      { spans: [{ text: 'ab' }, { text: 'c', bold: true }] },
      { spans: [{ text: 'd', bold: true }], wrap: 'hard' },
    ])
    expect(wrapSpans([], 0, defaultMeasure)).toEqual([{ spans: [] }])
  })
})

describe('tables', () => {
  it('detects separators and splits rows on unescaped pipes outside code', () => {
    expect(isSeparator('|:--|:-:|--:|')).toBe(true)
    expect(isSeparator('| a | b |')).toBe(false)
    expect(isSeparator('|')).toBe(false)
    expect(splitRow('| a \\| b | `c|d` | ``e`|f`` |')).toEqual(['a | b', '`c|d`', '``e`|f``'])
    expect(splitRow('a | b \\|')).toEqual(['a', 'b |'])
    expect(alignments('|:--|:-:|--:|---|')).toEqual(['left', 'center', 'right', 'left'])
  })

  it('fits columns: natural when they fit, fair share for the wide ones, or none', () => {
    expect(fitColumns([3, 4], 10)).toEqual([3, 4])
    expect(fitColumns([2, 30, 30], 22)).toEqual([2, 10, 10])
    expect(fitColumns([30, 30, 30], 23)).toEqual([8, 8, 7])
    expect(fitColumns([2, 30, 9], 20)).toEqual([2, 9, 9])
    expect(fitColumns([10, 10], 11)).toBeUndefined()
    expect(fitColumns([7, 20, 20], 21)).toEqual([7, 7, 7])
  })

  it('draws header, alignment-honouring cells, rule and no trailing padding', () => {
    const lines = md('| a | b | c |\n|:--|:-:|--:|\n| 1 | 22222 | 3 |\n| 444 |')
    expect(texts(lines)).toEqual([
      'a   │   b   │ c',
      '────┼───────┼──',
      '1   │ 22222 │ 3',
      '444 │       │',
    ])
    expect(lines[0]?.spans[0]).toMatchObject({ role: 'strong', bold: true })
    expect(lines[1]?.frame).toBe(true)
  })

  it('wraps cells in their column', () => {
    const lines = md('| k | value |\n|---|---|\n| a | one two three four |', 14)
    expect(texts(lines)).toEqual(['k │ value', '──┼───────────', 'a │ one two', '  │ three four'])
  })

  it('falls back to header: value rows when even minimums do not fit', () => {
    const header = `|${Array.from({ length: 9 }, (_, i) => ` header${i} |`).join('')}`
    const sep = `|${'---|'.repeat(9)}`
    const row = (n: number) => `|${Array.from({ length: 9 }, (_, i) => ` v${n}${i} |`).join('')}`
    const lines = md([header, sep, row(1), row(2)].join('\n'), 40)
    expect(texts(lines).slice(0, 2)).toEqual(['header0: v10', 'header1: v11'])
    expect(text(lines[9] as LineDraft)).toBe('')
    expect(lines).toHaveLength(19)
    expect(Math.max(...lines.map((l) => defaultMeasure(text(l))))).toBeLessThanOrEqual(40)
  })

  it('aligns columns the separator omits to the left, and needs a separator to start', () => {
    expect(texts(layoutTable('a|b|c', '-|-', ['1|2|3'], 20, env))).toEqual([
      'a │ b │ c',
      '──┼───┼──',
      '1 │ 2 │ 3',
    ])
    expect(texts(md('x\na | b'))).toEqual(['x a | b'])
  })

  it('lays out directly with an ASCII glyph set', () => {
    expect(texts(layoutTable('a|b', '-|-', ['1|2'], 20, { ...env, glyphs: asciiGlyphs }))).toEqual([
      'a | b',
      '--+--',
      '1 | 2',
    ])
  })
})

describe('terminalMarkdown blocks', () => {
  it('lays out headings strong without markers, a blank line before', () => {
    const lines = md('para\n## Head **x** ##\n#\ntext')
    expect(texts(lines)).toEqual(['para', '', 'Head x', '', '', '', 'text'])
    expect(lines[2]?.spans[0]).toMatchObject({ role: 'strong', bold: true })
  })

  it('reflows paragraphs softly and keeps hard breaks', () => {
    const lines = md('one two\nthree four  \nfive\\\nsix', 9)
    expect(lines).toEqual([
      { spans: [{ text: 'one two', role: 'content' }] },
      { spans: [{ text: 'three', role: 'content' }], wrap: 'soft' },
      { spans: [{ text: 'four', role: 'content' }], wrap: 'soft' },
      { spans: [{ text: 'five', role: 'content' }] },
      { spans: [{ text: 'six', role: 'content' }] },
    ])
  })

  it('draws rules full width as decoration', () => {
    for (const rule of ['---', '***', ' _ _ _']) {
      expect(md(rule, 5)).toEqual([
        { spans: [{ text: '─────', role: 'chrome', dim: true }], frame: true },
      ])
    }
  })

  it('draws quotes with a bar, nesting inside', () => {
    const lines = md('> a *b*\n> > c', 20)
    expect(texts(lines)).toEqual(['│ a b', '│ ', '│ │ c'])
    expect(lines[0]?.spans[0]).toMatchObject({ role: 'chrome', dim: true, chrome: true })
  })

  it('draws fenced code: language line, bars, hard-split long lines, no reflow', () => {
    const lines = md('```ts\nconst  x = 1\n\n\tabcdefghij\n```\nafter', 8)
    expect(texts(lines)).toEqual([
      '│ ts',
      '│ const ',
      '│  x = 1',
      '│ ',
      '│   abcd',
      '│ efghij',
      '',
      'after',
    ])
    expect(lines[0]?.frame).toBe(true)
    expect(lines[1]?.spans[1]).toEqual({ text: 'const ', role: 'code' })
    expect(lines[2]?.wrap).toBe('hard')
  })

  it('treats an unclosed fence as code to the end, honouring fence kind and length', () => {
    const lines = md('  ~~~~\n  a\n~~~\n```\nb', 20, { streaming: true })
    expect(texts(lines)).toEqual(['│ a', '│ ~~~', '│ ```', '│ b'])
    expect(texts(md('```\n```'))).toEqual([])
  })

  it('lays out lists: bullets, numbers from start, tasks, nesting, hanging indent', () => {
    const lines = md(
      '- one two three\n- two\n  - nested\n\n  more\n- [x] done\n- [ ] open\n\n3) three\n4) four\n* lazy\ncontinued',
      12,
    )
    expect(texts(lines)).toEqual([
      '• one two',
      '  three',
      '• two',
      '  • nested',
      '  more',
      '☒ done',
      '☐ open',
      '',
      '3) three',
      '4) four',
      '',
      '• lazy',
      '  continued',
    ])
    expect(lines[0]?.spans[0]).toEqual({ text: '• ', role: 'marker', chrome: true })
    expect(lines[1]?.spans[0]).toEqual({ text: '  ', chrome: true })
    expect(lines[1]?.wrap).toBe('soft')
  })

  it('ends a list at a blank line before other content, or a different list kind', () => {
    expect(texts(md('- a\n\npara'))).toEqual(['• a', '', 'para'])
    expect(texts(md('- a\n1. b'))).toEqual(['• a', '', '1. b'])
    expect(texts(md('-\n- b\n# h'))).toEqual(['• ', '• b', '', 'h'])
    expect(texts(md('- a\n\n- b\n\n  - c'))).toEqual(['• a', '• b', '  • c'])
  })

  it('uses the image hook for a line that is only an image, else inline text', () => {
    const image = (src: string, alt: string, width: number) =>
      src === 'skip' ? undefined : [{ spans: [{ text: `[${alt}:${src}:${width}]` }] }]
    expect(texts(md('![a](x.png "t")', 30, { image }))).toEqual(['[a:x.png:30]'])
    expect(texts(md('![a](skip)', 30, { image }))).toEqual(['▣ a (skip)'])
    expect(texts(md('![a](x) and text', 30, { image }))).toEqual(['▣ a (x) and text'])
    expect(texts(md('![a](x)'))).toEqual(['▣ a (x)'])
  })

  it('normalises line endings and tolerates zero width', () => {
    expect(texts(md('a\r\nb\rc', 0))).toEqual(['a', 'b', 'c'])
  })
})

describe('incremental layout', () => {
  const doc = [
    '# Title',
    '',
    'para one',
    'continues',
    '',
    '- a',
    '',
    '- b',
    '  more',
    '',
    '```',
    'code',
    '',
    'still code',
    '```',
    '',
    '| x | y |',
    '|---|---|',
    '| 1 | 2 |',
    '',
    '',
    'end',
  ]

  it('splits at blank lines that end a block, never inside fences or lists', () => {
    expect(chunks(doc).map((c) => c[0])).toEqual(['# Title', 'para one', '```', '| x | y |', 'end'])
    expect(chunks(['~~~~', '', 'x', '~~~~', '', 'y']).map((c) => c[0])).toEqual(['~~~~', 'y'])
    expect(chunks([])).toEqual([])
    expect(chunks(['', '', 'a'])).toEqual([['a']])
  })

  it('lays out the same as the whole document, reusing finished blocks', () => {
    const whole = layoutBlocks(doc, 30, env)
    const first = md(doc.join('\n'), 30)
    expect(first).toEqual(whole)
    const again = md(`${doc.join('\n')}\nmore text`, 30)
    // The unchanged leading block is served from the cache.
    expect(again[0]).toBe(first[0])
  })

  it('lays out image blocks every time when an image hook is given', () => {
    let calls = 0
    const image = () => {
      calls++
      return [{ spans: [{ text: 'IMG' }] }]
    }
    md('![a](x)', 30, { image })
    md('![a](x)', 30, { image })
    expect(calls).toBe(2)
  })

  it('bounds the cache', () => {
    const glyphs = { ...plainGlyphs }
    for (let i = 0; i < 4001; i++) terminalMarkdown(`p${i}`, 20, { ...env, glyphs })
    expect(terminalMarkdown('p4000', 20, { ...env, glyphs })).toEqual([
      { spans: [{ text: 'p4000', role: 'content' }] },
    ])
  })
})
