import { describe, expect, it } from 'vitest'
import {
  backspace,
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
})
