/**
 * Pure multi-line text editing for the composer: a value and a caret offset,
 * and the operations keys map to. No Ink, no React — every edit is a function
 * from state to state, so it is tested without a terminal.
 */
import type { Attachment } from '@fx/chat-core'
import { type Measure, defaultMeasure, graphemes } from './lines/measure'

export interface EditorState {
  value: string
  /** Caret offset into `value` (0…length). */
  caret: number
}

export const emptyEditor: EditorState = { value: '', caret: 0 }

const clamp = (n: number, max: number) => Math.max(0, Math.min(n, max))

export function insert(state: EditorState, text: string): EditorState {
  const value = state.value.slice(0, state.caret) + text + state.value.slice(state.caret)
  return { value, caret: state.caret + text.length }
}

export function backspace(state: EditorState): EditorState {
  if (state.caret === 0) return state
  return {
    value: state.value.slice(0, state.caret - 1) + state.value.slice(state.caret),
    caret: state.caret - 1,
  }
}

export function deleteForward(state: EditorState): EditorState {
  if (state.caret >= state.value.length) return state
  return {
    value: state.value.slice(0, state.caret) + state.value.slice(state.caret + 1),
    caret: state.caret,
  }
}

export function moveBy(state: EditorState, delta: number): EditorState {
  return { ...state, caret: clamp(state.caret + delta, state.value.length) }
}

/** Start and end offsets of the line containing `caret`. */
function lineBounds(value: string, caret: number): [number, number] {
  const start = value.lastIndexOf('\n', caret - 1) + 1
  const nl = value.indexOf('\n', caret)
  return [start, nl === -1 ? value.length : nl]
}

export function lineStart(state: EditorState): EditorState {
  return { ...state, caret: lineBounds(state.value, state.caret)[0] }
}

export function lineEnd(state: EditorState): EditorState {
  return { ...state, caret: lineBounds(state.value, state.caret)[1] }
}

/** Delete from the line start to the caret. */
export function killToLineStart(state: EditorState): EditorState {
  const [start] = lineBounds(state.value, state.caret)
  return { value: state.value.slice(0, start) + state.value.slice(state.caret), caret: start }
}

/** Delete from the caret to the line end. */
export function killToLineEnd(state: EditorState): EditorState {
  const [, end] = lineBounds(state.value, state.caret)
  return { value: state.value.slice(0, state.caret) + state.value.slice(end), caret: state.caret }
}

/** Delete the word before the caret (and the whitespace after it). */
export function deleteWordBack(state: EditorState): EditorState {
  let i = state.caret
  while (i > 0 && /\s/.test(state.value[i - 1] as string)) i--
  while (i > 0 && !/\s/.test(state.value[i - 1] as string)) i--
  return { value: state.value.slice(0, i) + state.value.slice(state.caret), caret: i }
}

/**
 * Move the caret one line up (`-1`) or down (`+1`), keeping its column where
 * the target line is long enough. Returns `undefined` at the first/last line,
 * so the caller can fall through to history navigation.
 */
export function moveLine(state: EditorState, direction: -1 | 1): EditorState | undefined {
  const [start, end] = lineBounds(state.value, state.caret)
  const column = state.caret - start
  if (direction === -1) {
    if (start === 0) return undefined
    const [prevStart, prevEnd] = lineBounds(state.value, start - 1)
    return { ...state, caret: Math.min(prevStart + column, prevEnd) }
  }
  if (end === state.value.length) return undefined
  const [nextStart, nextEnd] = lineBounds(state.value, end + 1)
  return { ...state, caret: Math.min(nextStart + column, nextEnd) }
}

/** Split into lines, each with the caret column when the caret is on it. */
export function caretLines(state: EditorState): Array<{ text: string; caret?: number }> {
  const out: Array<{ text: string; caret?: number }> = []
  let offset = 0
  for (const text of state.value.split('\n')) {
    const end = offset + text.length
    out.push(
      state.caret >= offset && state.caret <= end
        ? { text, caret: state.caret - offset }
        : { text },
    )
    offset = end + 1
  }
  return out
}

/** Jump to the start of the previous whitespace-separated word. */
export function wordLeft(state: EditorState): EditorState {
  let i = state.caret
  while (i > 0 && /\s/.test(state.value[i - 1] as string)) i--
  while (i > 0 && !/\s/.test(state.value[i - 1] as string)) i--
  return { ...state, caret: i }
}

/** Jump past the end of the next whitespace-separated word. */
export function wordRight(state: EditorState): EditorState {
  let i = state.caret
  const n = state.value.length
  while (i < n && /\s/.test(state.value[i] as string)) i++
  while (i < n && !/\s/.test(state.value[i] as string)) i++
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
  const from = caretRow(rows, state.caret)
  const target = rows[from + direction]
  if (!target) return undefined
  const row = rows[from] as VisualRow
  const column = measure(state.value.slice(row.start, state.caret))
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
