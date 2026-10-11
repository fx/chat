import { describe, expect, it } from 'vitest'
import {
  backspace,
  caretBoundary,
  caretLines,
  caretRow,
  createHistory,
  deleteForward,
  deleteWordBack,
  emptyEditor,
  insert,
  killToLineEnd,
  killToLineStart,
  lineEnd,
  lineStart,
  moveBy,
  moveLine,
  moveVisual,
  pushHistory,
  splitAtCaret,
  stepHistory,
  visualRows,
  withEntries,
  wordLeft,
  wordRight,
} from './editor'

const at = (value: string, caret = value.length) => ({ value, caret })

describe('editor', () => {
  it('inserts and deletes around the caret', () => {
    expect(insert(at('ac', 1), 'b')).toEqual(at('abc', 2))
    expect(backspace(at('abc', 2))).toEqual(at('ac', 1))
    expect(backspace(at('abc', 0))).toEqual(at('abc', 0))
    expect(deleteForward(at('abc', 1))).toEqual(at('ac', 1))
    expect(deleteForward(at('abc'))).toEqual(at('abc'))
    expect(emptyEditor).toEqual(at(''))
  })

  it('moves within bounds and to line edges', () => {
    expect(moveBy(at('ab', 1), -5)).toEqual(at('ab', 0))
    expect(moveBy(at('ab', 1), 5)).toEqual(at('ab', 2))
    expect(lineStart(at('a\nbcd', 4))).toEqual(at('a\nbcd', 2))
    expect(lineEnd(at('ab\ncd', 1))).toEqual(at('ab\ncd', 2))
    expect(lineEnd(at('ab\ncd', 3))).toEqual(at('ab\ncd', 5))
  })

  it('kills to line edges and deletes words', () => {
    expect(killToLineStart(at('x\nhello', 5))).toEqual(at('x\nlo', 2))
    expect(killToLineEnd(at('hello\nx', 2))).toEqual(at('he\nx', 2))
    expect(deleteWordBack(at('one two  ', 9))).toEqual(at('one ', 4))
    expect(deleteWordBack(at('', 0))).toEqual(at('', 0))
  })

  it('moves between lines keeping the column, undefined at the edges', () => {
    const s = at('abcd\nxy\nlonger', 3)
    expect(moveLine(s, -1)).toBeUndefined()
    const down = moveLine(s, 1)
    expect(down).toEqual(at(s.value, 7))
    expect(moveLine(down as typeof s, 1)).toEqual(at(s.value, 10))
    expect(moveLine(at(s.value, 10), -1)).toEqual(at(s.value, 7))
    expect(moveLine(at(s.value, 12), 1)).toBeUndefined()
  })

  it('splits lines with the caret column on its line', () => {
    expect(caretLines(at('ab\ncd', 4))).toEqual([{ text: 'ab' }, { text: 'cd', caret: 1 }])
    expect(caretLines(at('', 0))).toEqual([{ text: '', caret: 0 }])
  })

  it('browses history, keeping the draft', () => {
    let h = createHistory(['one'])
    h = pushHistory(h, 'two')
    h = pushHistory(h, 'two')
    h = pushHistory(h, '  ')
    expect(h.entries).toEqual([{ text: 'one' }, { text: 'two' }])
    const up = stepHistory(h, -1, 'draft')
    expect(up?.value).toBe('two')
    const up2 = stepHistory(up?.history ?? h, -1, 'two')
    expect(up2?.value).toBe('one')
    expect(stepHistory(up2?.history ?? h, -1, 'one')).toBeUndefined()
    const down = stepHistory(up2?.history ?? h, 1, 'one')
    const back = stepHistory(down?.history ?? h, 1, 'two')
    expect(back?.value).toBe('draft')
    expect(stepHistory(back?.history ?? h, 1, 'draft')).toBeUndefined()
    expect(createHistory().entries).toEqual([])
  })

  it('jumps whitespace-separated words', () => {
    expect(wordLeft(at('ab  cd ', 7)).caret).toBe(4)
    expect(wordLeft(at('ab', 0)).caret).toBe(0)
    expect(wordRight(at(' ab  cd', 0)).caret).toBe(3)
    expect(wordRight(at('ab', 2)).caret).toBe(2)
  })

  it('lays out visual rows at newlines and by cells, never splitting a wide character', () => {
    expect(visualRows('ab\ncd')).toEqual([
      { start: 0, end: 2, soft: false },
      { start: 3, end: 5, soft: false },
    ])
    expect(visualRows('abcde', 2)).toEqual([
      { start: 0, end: 2, soft: true },
      { start: 2, end: 4, soft: true },
      { start: 4, end: 5, soft: false },
    ])
    expect(visualRows('a界b', 2)).toEqual([
      { start: 0, end: 1, soft: true },
      { start: 1, end: 2, soft: true },
      { start: 2, end: 3, soft: false },
    ])
    expect(visualRows('界', 0)).toEqual([{ start: 0, end: 1, soft: false }])
    expect(visualRows('')).toEqual([{ start: 0, end: 0, soft: false }])
  })

  it('places the caret on its row: a soft row end belongs to the next row', () => {
    const rows = visualRows('abcd\ne', 2)
    expect(caretRow(rows, 1)).toBe(0)
    expect(caretRow(rows, 2)).toBe(1)
    expect(caretRow(rows, 4)).toBe(1)
    expect(caretRow(rows, 6)).toBe(2)
    expect(caretRow(rows, 99)).toBe(2)
  })

  it('moves by visual row keeping the cell column, landing at a shorter row end', () => {
    const value = 'abcdef\nxy'
    const rows = visualRows(value, 3)
    expect(moveVisual(at(value, 1), rows, 1)?.caret).toBe(4)
    expect(moveVisual(at(value, 5), rows, 1)?.caret).toBe(9)
    expect(moveVisual(at(value, 9), rows, -1)?.caret).toBe(5)
    // A soft row's last cell would put the caret on the next row; stop before it.
    expect(moveVisual(at(value, 6), rows, -1)?.caret).toBe(2)
    expect(moveVisual(at(value, 0), rows, -1)).toBeUndefined()
    expect(moveVisual(at(value, 9), rows, 1)).toBeUndefined()
    const wide = '界界\nab'
    expect(moveVisual(at(wide, 4), visualRows(wide), -1)?.caret).toBe(0)
    expect(moveVisual(at(wide, 5), visualRows(wide), -1)?.caret).toBe(1)
  })

  it('keeps attachments in history entries and the draft', () => {
    const file = { url: 'u', mediaType: 'image/png', kind: 'image' as const }
    let h = createHistory([{ text: 'old', attachments: [file] }])
    h = pushHistory(h, { text: '', attachments: [file] })
    h = pushHistory(h, { text: '', attachments: [file] })
    h = pushHistory(h, { text: 'x', attachments: [] })
    h = pushHistory(h, { text: 'x' })
    expect(h.entries).toHaveLength(4)
    const up = stepHistory(h, -1, { text: 'draft', attachments: [file] })
    expect(up).toMatchObject({ value: 'x' })
    expect(up && 'attachments' in up).toBe(false)
    const up2 = stepHistory(up?.history ?? h, -1, 'x')
    expect(up2).toMatchObject({ value: '', attachments: [file] })
    const down = stepHistory(up2?.history ?? h, 1, '')
    const back = stepHistory(down?.history ?? h, 1, 'x')
    expect(back).toEqual(expect.objectContaining({ value: 'draft', attachments: [file] }))
  })

  it('takes new entries keeping the draft and a browse in progress', () => {
    const h = createHistory(['a', 'b', 'c'])
    const browsing = stepHistory(h, -1, 'draft')?.history as typeof h
    expect(withEntries(browsing, ['a', 'b', 'c', 'd'])).toEqual({
      entries: [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }],
      index: 2,
      draft: { text: 'draft' },
    })
    expect(withEntries(browsing, ['x'])).toMatchObject({ index: 1 })
    expect(withEntries(h, ['a', 'b', 'c', 'd'])).toMatchObject({ index: 4 })
  })

  describe('by grapheme', () => {
    const emoji = '😀' // a surrogate pair
    const family = '👨‍👩‍👧' // ZWJ sequence
    const flag = '🇵🇱' // regional-indicator pair
    const accent = 'é' // e + combining acute
    const cjk = '界'
    const clusters = [emoji, family, flag, accent, cjk]
    const text = clusters.join('')
    /** Offsets of every grapheme boundary of `text`. */
    const stops = [0]
    for (const g of clusters) stops.push((stops.at(-1) as number) + g.length)

    it('steps left and right one whole grapheme at a time', () => {
      let state = at(text, 0)
      for (const stop of stops.slice(1)) {
        state = moveBy(state, 1)
        expect(state.caret).toBe(stop)
      }
      expect(moveBy(state, 1).caret).toBe(text.length)
      for (const stop of stops.slice(0, -1).reverse()) {
        state = moveBy(state, -1)
        expect(state.caret).toBe(stop)
      }
      expect(moveBy(at(text, 0), 3).caret).toBe(stops[3])
      expect(moveBy(at(text), -2).caret).toBe(stops[3])
      expect(moveBy(at(`a\n${emoji}`, 2), -1).caret).toBe(1)
      expect(moveBy(at(`${emoji}\nb`, 2), 1).caret).toBe(3)
    })

    it('backspaces and deletes whole graphemes', () => {
      for (const [i, g] of clusters.entries()) {
        const rest = clusters.filter((_, j) => j !== i).join('')
        expect(backspace(at(text, stops[i + 1]))).toEqual(at(rest, stops[i]))
        expect(deleteForward(at(text, stops[i]))).toEqual(at(rest, stops[i]))
        expect(backspace(at(g))).toEqual(at(''))
      }
      expect(backspace(at(`a\n${emoji}`, 2))).toEqual(at(`a${emoji}`, 1))
      expect(deleteForward(at(`${emoji}\nb`, 2))).toEqual(at(`${emoji}b`, 2))
    })

    it('treats a caret inside a grapheme as at its start', () => {
      expect(caretBoundary(text, 1)).toBe(0)
      expect(caretBoundary(text, stops[1] + 3)).toBe(stops[1])
      expect(caretBoundary(text, -4)).toBe(0)
      expect(caretBoundary(text, 999)).toBe(text.length)
      expect(moveBy(at(emoji, 1), 1).caret).toBe(2)
      expect(moveBy(at(emoji, 1), 0).caret).toBe(0)
      expect(backspace(at(`a${emoji}`, 2))).toEqual(at(emoji, 0))
      expect(backspace(at(emoji, 1))).toEqual(at(emoji, 0))
      expect(deleteForward(at(`${emoji}b`, 1))).toEqual(at('b', 0))
      expect(insert(at(emoji, 1), 'x')).toEqual(at(`x${emoji}`, 1))
      expect(killToLineStart(at(`a${emoji}`, 2))).toEqual(at(emoji, 0))
      expect(killToLineEnd(at(`a${emoji}`, 2))).toEqual(at('a', 1))
      expect(caretLines(at(`a${emoji}`, 2))).toEqual([{ text: `a${emoji}`, caret: 1 }])
      expect(wordLeft(at(`ab ${emoji}`, 4)).caret).toBe(0)
      expect(wordRight(at(`${emoji} b`, 1)).caret).toBe(2)
      expect(deleteWordBack(at(`ab ${emoji}`, 4))).toEqual(at(emoji, 0))
    })

    it('splits a row for drawing around the whole grapheme under the caret', () => {
      expect(splitAtCaret(`a${family}b`, 1)).toEqual(['a', family, 'b'])
      expect(splitAtCaret(`a${family}b`, 3)).toEqual(['a', family, 'b'])
      expect(splitAtCaret(`${cjk}${accent}`, 1)).toEqual([cjk, accent, ''])
      expect(splitAtCaret(flag, 4)).toEqual([flag, '', ''])
      expect(splitAtCaret('', 0)).toEqual(['', '', ''])
    })

    it('leaves the caret after a grapheme that inserted text joins', () => {
      expect(insert(at('́', 0), 'e')).toEqual(at(accent, 2))
      expect(insert(at('🇱', 0), '🇵')).toEqual(at(flag, 4))
      expect(insert(at('ab', 1), emoji)).toEqual(at(`a${emoji}b`, 3))
    })

    it('jumps and deletes words without splitting graphemes', () => {
      const value = `${family} ${flag}${accent}  `
      expect(wordLeft(at(value)).caret).toBe(family.length + 1)
      expect(wordLeft(at(value, family.length + 1)).caret).toBe(0)
      expect(wordRight(at(value, 0)).caret).toBe(family.length)
      expect(wordRight(at(value, family.length)).caret).toBe(value.length - 2)
      expect(deleteWordBack(at(value))).toEqual(at(`${family} `))
      // A combining mark on a space makes it part of a word.
      expect(wordLeft(at('a ́b')).caret).toBe(0)
    })

    it('keeps the cell column on line moves, landing between graphemes', () => {
      const value = `${cjk}${cjk}\n${emoji}ab\n${accent}${accent}${accent}`
      const second = 2 + 1
      const third = second + emoji.length + 2 + 1
      expect(moveLine(at(value, 1), 1)?.caret).toBe(second + emoji.length)
      expect(moveLine(at(value, second + emoji.length + 1), 1)?.caret).toBe(third + 6)
      expect(moveLine(at(value, third + 2), -1)?.caret).toBe(second)
      expect(moveLine(at(value, third + 4), -1)?.caret).toBe(second + emoji.length)
      expect(moveLine(at(value, third), 1)).toBeUndefined()
    })
  })
})
