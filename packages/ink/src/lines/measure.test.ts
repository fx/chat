// @vitest-environment node
import stringWidth from 'string-width'
import { describe, expect, it } from 'vitest'
import {
  cachedMeasure,
  defaultMeasure,
  graphemes,
  hardSplit,
  truncate,
  wrapLines,
  wrapText,
} from './measure'
import { lineText, prefix, span, suffix } from './model'

describe('measure', () => {
  it('measures terminal cells', () => {
    expect(defaultMeasure('abc')).toBe(3)
    expect(defaultMeasure('日本')).toBe(4)
    expect(graphemes('éx')).toEqual(['é', 'x'])
  })

  it('truncates and hard-splits by cells', () => {
    expect(truncate('hello', 10)).toBe('hello')
    expect(truncate('hello world', 6)).toBe('hello…')
    expect(truncate('日本語', 4)).toBe('日…')
    expect(truncate('abc', 0)).toBe('')
    expect(hardSplit('abcdef', 4)).toEqual(['abcd', 'ef'])
    expect(hardSplit('日本語', 3)).toEqual(['日', '本', '語'])
    expect(hardSplit('', 3)).toEqual([''])
  })

  it('wraps words softly and splits long words hard', () => {
    expect(wrapText('the quick brown fox', 9)).toEqual([
      { text: 'the quick' },
      { text: 'brown fox', wrap: 'soft' },
    ])
    expect(wrapText('a supercalifragilistic word', 8)).toEqual([
      { text: 'a' },
      { text: 'supercal', wrap: 'soft' },
      { text: 'ifragili', wrap: 'hard' },
      { text: 'stic', wrap: 'hard' },
      { text: 'word', wrap: 'soft' },
    ])
    expect(wrapText('', 5)).toEqual([{ text: '' }])
    expect(wrapLines('one\ntwo', 10)).toEqual([{ text: 'one' }, { text: 'two' }])
    expect(wrapText('xy', 0)).toEqual([{ text: 'x' }, { text: 'y', wrap: 'hard' }])
  })
})

describe('line model', () => {
  it('prefixes and suffixes keeping metadata', () => {
    const line = {
      spans: [span('b')],
      wrap: 'soft' as const,
      frame: true,
      owner: { messageId: 'm' },
      target: { kind: 'image' as const, src: 's' },
    }
    const out = suffix(prefix(line, [span('a')]), [span('c', { role: 'muted' })])
    expect(lineText(out)).toBe('abc')
    expect(out).toMatchObject({
      wrap: 'soft',
      frame: true,
      owner: { messageId: 'm' },
      target: { src: 's' },
    })
  })
})

describe('cachedMeasure', () => {
  it('returns exactly string-width’s widths, measuring each cluster once', () => {
    const texts: string[] = []
    for (let codePoint = 0; codePoint <= 0x1ffff; codePoint += 3) {
      if (codePoint < 0xd800 || codePoint > 0xdfff) texts.push(String.fromCodePoint(codePoint))
    }
    texts.push(
      '가각 jamo',
      '👨‍👩‍👧 family',
      '1️⃣ 🇩🇪',
      'à́b​­',
      '╭──── 21:06 ─╮ │ ▸',
      '\u001b[31mred\u001b[39m',
      '日本語 x',
    )
    const measure = cachedMeasure()
    expect(texts.filter((text) => measure(text) !== stringWidth(text))).toEqual([])
    // Twice, so cached clusters are read back too.
    expect(texts.filter((text) => measure(text) !== stringWidth(text))).toEqual([])
  })

  it('asks the width function once per cluster, starting over when full', () => {
    const calls: string[] = []
    const measure = cachedMeasure((text) => {
      calls.push(text)
      return 2
    }, 2)
    expect(measure('日本日本')).toBe(8)
    expect(calls).toEqual(['日', '本'])
    expect(measure('語')).toBe(2)
    expect(measure('日')).toBe(2)
    expect(calls).toEqual(['日', '本', '語', '日'])
    expect(measure('plain')).toBe(5)
    expect(measure('\u001b[1m日')).toBe(2)
    expect(calls.at(-1)).toBe('\u001b[1m日')
  })
})
