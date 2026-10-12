/**
 * Pure multi-line text editing for the composer: a value and a caret offset,
 * and the operations keys map to. No Ink, no React — every edit is a function
 * from state to state, so it is tested without a terminal.
 */
import type { Attachment } from '@fx-/chat-core'
import { type Measure, defaultMeasure, firstGrapheme, graphemes } from './lines/measure'

export interface EditorState {
  value: string
  /**
   * Caret offset into `value` (0…length). Every operation leaves it on a
   * grapheme boundary, so an emoji, flag or combining sequence is never split;
   * an offset inside a grapheme is first moved back to that grapheme's start.
   */
  caret: number
}

export const emptyEditor: EditorState = { value: '', caret: 0 }

const clamp = (n: number, max: number) => Math.max(0, Math.min(n, max))

/** Start and end offsets of the line containing `caret`. */
function lineBounds(value: string, caret: number): [number, number] {
  const start = value.lastIndexOf('\n', caret - 1) + 1
  const nl = value.indexOf('\n', caret)
  return [start, nl === -1 ? value.length : nl]
}

/**
 * The grapheme boundaries of the line holding `at`, both line ends included.
 * A newline always separates graphemes, so only the one line is segmented.
 */
function boundaries(value: string, at: number): number[] {
  const [start, end] = lineBounds(value, at)
  const out = [start]
  let offset = start
  for (const g of graphemes(value.slice(start, end))) {
    offset += g.length
    out.push(offset)
  }
  return out
}

/** `caret` clamped to the value and moved back to the start of the grapheme it is inside. */
export function caretBoundary(value: string, caret: number): number {
  const at = clamp(caret, value.length)
  return lastBelow(boundaries(value, at), at + 1)
}

/** The last of ascending `list` (which starts below `limit`) that is below `limit`. */
function lastBelow(list: number[], limit: number): number {
  let found = list[0] as number
  for (const b of list) if (b < limit) found = b
  return found
}

/** The boundary one grapheme before `caret` (a boundary), or 0. */
function before(value: string, caret: number): number {
  if (caret === 0) return 0
  if (value[caret - 1] === '\n') return caret - 1
  return lastBelow(boundaries(value, caret), caret)
}

/** The boundary one grapheme after `caret` (a boundary), or the end. */
function after(value: string, caret: number): number {
  if (caret >= value.length) return value.length
  if (value[caret] === '\n') return caret + 1
  return boundaries(value, caret).find((b) => b > caret) as number
}

/**
 * Split `text` at a caret for drawing: before it, the grapheme under it ('' at
 * the end) and after it. The grapheme is whole, so the caret cell covers all
 * of it (two cells for a wide one) and no character is split around it.
 */
export function splitAtCaret(text: string, caret: number): [string, string, string] {
  const at = caretBoundary(text, caret)
  const under = firstGrapheme(text.slice(at))
  return [text.slice(0, at), under, text.slice(at + under.length)]
}

const snapped = (state: EditorState): EditorState => {
  const caret = caretBoundary(state.value, state.caret)
  return caret === state.caret ? state : { ...state, caret }
}

/**
 * Insert at the caret. Text that joins the grapheme after it (a combining
 * mark's base, half a flag) leaves the caret after the joined grapheme.
 */
export function insert(state: EditorState, text: string): EditorState {
  const { caret } = snapped(state)
  const value = state.value.slice(0, caret) + text + state.value.slice(caret)
  const end = caret + text.length
  const at = caretBoundary(value, end)
  return { value, caret: at === end ? end : after(value, at) }
}

export function backspace(state: EditorState): EditorState {
  const { caret } = snapped(state)
  if (caret === 0) return { ...state, caret }
  const start = before(state.value, caret)
  return { value: state.value.slice(0, start) + state.value.slice(caret), caret: start }
}

export function deleteForward(state: EditorState): EditorState {
  const { caret } = snapped(state)
  const end = after(state.value, caret)
  return { value: state.value.slice(0, caret) + state.value.slice(end), caret }
}

/** Move the caret `delta` graphemes (negative: left), stopping at the ends. */
export function moveBy(state: EditorState, delta: number): EditorState {
  let { caret } = snapped(state)
  const step = delta < 0 ? before : after
  for (let n = Math.abs(delta); n > 0; n--) {
    const next = step(state.value, caret)
    if (next === caret) break
    caret = next
  }
  return { ...state, caret }
}

export function lineStart(state: EditorState): EditorState {
  return { ...state, caret: lineBounds(state.value, clamp(state.caret, state.value.length))[0] }
}

export function lineEnd(state: EditorState): EditorState {
  return { ...state, caret: lineBounds(state.value, clamp(state.caret, state.value.length))[1] }
}

/** Delete from the line start to the caret. */
export function killToLineStart(state: EditorState): EditorState {
  const { caret } = snapped(state)
  const [start] = lineBounds(state.value, caret)
  return { value: state.value.slice(0, start) + state.value.slice(caret), caret: start }
}

/** Delete from the caret to the line end. */
export function killToLineEnd(state: EditorState): EditorState {
  const { caret } = snapped(state)
  const [, end] = lineBounds(state.value, caret)
  return { value: state.value.slice(0, caret) + state.value.slice(end), caret }
}

const blank = (g: string) => /^\s+$/.test(g)

/** The start of the whitespace-separated word before `caret` (skipping whitespace first). */
function wordStart(value: string, caret: number): number {
  let i = caret
  const skip = (word: boolean) => {
    while (i > 0) {
      const prev = before(value, i)
      if (blank(value.slice(prev, i)) === word) return
      i = prev
    }
  }
  skip(false)
  skip(true)
  return i
}

/** Delete the word before the caret (and the whitespace after it). */
export function deleteWordBack(state: EditorState): EditorState {
  const { caret } = snapped(state)
  const i = wordStart(state.value, caret)
  return { value: state.value.slice(0, i) + state.value.slice(caret), caret: i }
}

/**
 * Move the caret one line up (`-1`) or down (`+1`), keeping its cell column
 * where the target line is long enough. Returns `undefined` at the first/last
 * line, so the caller can fall through to history navigation.
 */
export function moveLine(
  state: EditorState,
  direction: -1 | 1,
  measure: Measure = defaultMeasure,
): EditorState | undefined {
  return moveVisual(state, visualRows(state.value), direction, measure)
}

/** Split into lines, each with the caret column (an offset into the line) when the caret is on it. */
export function caretLines(state: EditorState): Array<{ text: string; caret?: number }> {
  const { caret } = snapped(state)
  const out: Array<{ text: string; caret?: number }> = []
  let offset = 0
  for (const text of state.value.split('\n')) {
    const end = offset + text.length
    out.push(caret >= offset && caret <= end ? { text, caret: caret - offset } : { text })
    offset = end + 1
  }
  return out
}

/** Jump to the start of the previous whitespace-separated word. */
export function wordLeft(state: EditorState): EditorState {
  return { ...state, caret: wordStart(state.value, snapped(state).caret) }
}

/** Jump past the end of the next whitespace-separated word. */
export function wordRight(state: EditorState): EditorState {
  const { value } = state
  let i = snapped(state).caret
  const skip = (word: boolean) => {
    while (i < value.length) {
      const next = after(value, i)
      if (blank(value.slice(i, next)) === word) return
      i = next
    }
  }
  skip(false)
  skip(true)
  return { ...state, caret: i }
}

/**
 * One drawn row of the input: offsets `[start, end)` into the value (a
 * newline is never inside a row). `soft` rows continue on the next row.
 */
export interface VisualRow {
  start: number
  end: number
  soft: boolean
}

/**
 * Lay the value out in rows: at newlines, and (with a width) wherever the
 * next grapheme would pass `width` cells — never inside a wide character.
 */
export function visualRows(
  value: string,
  width?: number,
  measure: Measure = defaultMeasure,
): VisualRow[] {
  const rows: VisualRow[] = []
  let offset = 0
  for (const line of value.split('\n')) {
    let start = offset
    let cells = 0
    if (width !== undefined) {
      let at = offset
      for (const g of graphemes(line)) {
        const w = measure(g)
        if (cells + w > Math.max(1, width) && at > start) {
          rows.push({ start, end: at, soft: true })
          start = at
          cells = 0
        }
        cells += w
        at += g.length
      }
    }
    rows.push({ start, end: offset + line.length, soft: false })
    offset += line.length + 1
  }
  return rows
}

/** The row holding the caret: a soft row's end belongs to the next row. */
export function caretRow(rows: readonly VisualRow[], caret: number): number {
  const i = rows.findIndex(
    (row) => caret >= row.start && (caret < row.end || (caret === row.end && !row.soft)),
  )
  return i === -1 ? rows.length - 1 : i
}

/**
 * Move the caret one visual row up or down, keeping its cell column (landing
 * at the end of a shorter row). Undefined at the first or last row.
 */
export function moveVisual(
  state: EditorState,
  rows: readonly VisualRow[],
  direction: -1 | 1,
  measure: Measure = defaultMeasure,
): EditorState | undefined {
  const at = caretBoundary(state.value, state.caret)
  const from = caretRow(rows, at)
  const target = rows[from + direction]
  if (!target) return undefined
  const row = rows[from] as VisualRow
  const column = measure(state.value.slice(row.start, at))
  let caret = target.start
  let cells = 0
  for (const g of graphemes(state.value.slice(target.start, target.end))) {
    const w = measure(g)
    if (cells + w > column) break
    // A soft row's end is the next row's start, so stop before its last grapheme.
    if (target.soft && caret + g.length === target.end) break
    cells += w
    caret += g.length
  }
  return { ...state, caret }
}

/** A history entry: text, and the attachments sent with it. */
export interface HistoryEntry {
  text: string
  attachments?: Attachment[]
}

const toEntry = (entry: string | HistoryEntry): HistoryEntry =>
  typeof entry === 'string' ? { text: entry } : entry

/**
 * Input history with a draft: browsing up from a fresh draft keeps it, so
 * coming back down restores what was being typed (with its attachments).
 */
export interface History {
  entries: HistoryEntry[]
  /** Index into `entries` while browsing; `entries.length` means the draft. */
  index: number
  draft: HistoryEntry
}

export function createHistory(entries: Array<string | HistoryEntry> = []): History {
  const list = entries.map(toEntry)
  return { entries: list, index: list.length, draft: { text: '' } }
}

export function pushHistory(history: History, entry: string | HistoryEntry): History {
  const next = toEntry(entry)
  const last = history.entries.at(-1)
  const attached = Boolean(next.attachments?.length)
  const repeat = last?.text === next.text && !attached && !last.attachments?.length
  const entries =
    (next.text.trim() || attached) && !repeat ? [...history.entries, next] : history.entries
  return { entries, index: entries.length, draft: { text: '' } }
}

/**
 * Replace the entries (the host's list changed), keeping the draft and a
 * browse in progress (clamped to the new list).
 */
export function withEntries(history: History, entries: Array<string | HistoryEntry>): History {
  const list = entries.map(toEntry)
  const browsing = history.index < history.entries.length
  return {
    entries: list,
    index: browsing ? Math.min(history.index, list.length) : list.length,
    draft: history.draft,
  }
}

/** Step through history; returns the new history and the entry to show, or undefined at an end. */
export function stepHistory(
  history: History,
  direction: -1 | 1,
  current: string | HistoryEntry,
): { history: History; value: string; attachments?: Attachment[] } | undefined {
  const index = history.index + direction
  if (index < 0 || index > history.entries.length) return undefined
  const draft = history.index === history.entries.length ? toEntry(current) : history.draft
  const entry = index === history.entries.length ? draft : (history.entries[index] as HistoryEntry)
  return {
    history: { ...history, index, draft },
    value: entry.text,
    ...(entry.attachments?.length ? { attachments: entry.attachments } : {}),
  }
}
