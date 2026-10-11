/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */

import type { Attachment, CompletionItem, CompletionMatch, CompletionProvider } from '@fx/chat-core'
/**
 * The terminal composer: a multi-line editor with history and completion.
 *
 * Keys: Enter sends; Alt+Enter, Shift+Enter (kitty protocol), Ctrl+J, or a
 * trailing `\` before Enter insert a newline; ←/→ and Home/End (Ctrl+A/E)
 * move; Ctrl/Alt+←/→ jump a word; ↑/↓ move between rows and, at the first/last
 * row (or straight away after recalling an entry), step through history;
 * Ctrl+U / Ctrl+K kill to line start / end; Ctrl+W deletes a word; Esc closes
 * completion, else calls `onEscape` (e.g. stop a streaming turn). Completion
 * uses the core provider contract: the first provider whose token matches at
 * the caret offers items; ↑/↓ choose, Tab applies, and Enter applies a
 * selection the user moved to (otherwise Enter sends as usual).
 *
 * Fullscreen hosts opt into more: a controlled value with attachments, a
 * borderless `plain` variant, soft wrap at a width with a row limit, a host
 * key handler called first (or all keys routed in through a handle), a paste
 * handler, and the kitty keyboard protocol while focused.
 */
import type { Key } from 'ink'
import type { Ref } from 'react'
import {
  type EditorState,
  backspace,
  caretRow,
  createHistory,
  deleteForward,
  deleteWordBack,
  insert,
  killToLineEnd,
  killToLineStart,
  lineEnd,
  lineStart,
  moveBy,
  moveVisual,
  pushHistory,
  stepHistory,
  visualRows,
  withEntries,
  wordLeft,
  wordRight,
} from './editor'
import { type Measure, defaultMeasure, truncate } from './lines/measure'
import { Styled, appearanceProps, useInkComponents } from './registry'
import { React, ink } from './runtime'
import { stripControls } from './sanitize'
import { KITTY_POP, KITTY_PUSH, createKeyReportReader } from './terminal'
import { Text } from './text'

/** The composer's content: text, caret offset and attachments. */
export interface ComposerValue {
  text: string
  caret: number
  attachments: Attachment[]
}

export const emptyComposerValue: ComposerValue = { text: '', caret: 0, attachments: [] }

/** Drive a composer that takes its keys from the host (`inputSource: 'host'`). */
export interface ComposerHandle {
  key: (input: string, key: Key) => void
  paste: (text: string) => void
}

export interface ComposerProps {
  /** Called with the text, and the attachments when there are any. */
  onSubmit: (text: string, attachments?: Attachment[]) => void
  /** Esc with no completion open. */
  onEscape?: () => void
  providers?: CompletionProvider<CompletionItem<never> | CompletionItem>[]
  /** Previous inputs, oldest first. */
  history?: Array<string | { text: string; attachments?: Attachment[] }>
  placeholder?: string
  /** Ignore input entirely (e.g. while a dialog owns the keyboard). */
  disabled?: boolean
  /** Hint line under the input. */
  hint?: string
  /** Maximum completion items shown. */
  maxItems?: number
  /** Controlled content; pair with `onChange`. */
  value?: ComposerValue
  onChange?: (value: ComposerValue) => void
  /** `boxed` (default) or `plain`: no border, the prompt on the first row only. */
  variant?: 'boxed' | 'plain'
  /** Width in cells: rows soft-wrap to fit (one cell is kept for the caret). */
  width?: number
  /** Rows shown at most; the input scrolls to keep the caret's row visible. */
  maxRows?: number
  /** Whether the composer has focus: takes keys and draws the caret (default true). */
  focused?: boolean
  /** Shown after the attachment descriptions, e.g. `Esc removes`. */
  attachmentHint?: string
  /** What Ctrl+U clears: to the line start (default) or the whole input. */
  killLine?: 'line' | 'input'
  /** Called first for every key; return true when handled. */
  onKey?: (input: string, key: Key) => boolean
  /** Called first for every bracketed paste; return true when handled. */
  onPaste?: (text: string) => boolean
  /** `own` (default) listens for keys; `host` takes them through `ref`. */
  inputSource?: 'own' | 'host'
  ref?: Ref<ComposerHandle>
  /** Push the kitty keyboard disambiguate flag while focused. */
  kittyKeyboard?: boolean
  /** Cell measure for soft wrap (default string width). */
  measure?: Measure
}

interface Completion {
  provider: CompletionProvider<CompletionItem>
  match: CompletionMatch
  items: CompletionItem[]
  active: number
  /** Whether the user moved the selection (Enter then picks it). */
  navigated?: boolean
}

function findMatch(
  providers: ComposerProps['providers'],
  state: EditorState,
): { provider: CompletionProvider<CompletionItem>; match: CompletionMatch } | undefined {
  for (const provider of providers ?? []) {
    if (!state.value.slice(0, state.caret).includes(provider.trigger)) continue
    const match = provider.match(state.value, state.caret)
    if (match) return { provider: provider as CompletionProvider<CompletionItem>, match }
  }
  return undefined
}

/** Stable identity of a matched token (provider, start, query). */
function keyOf(found: ReturnType<typeof findMatch>): string | undefined {
  return found ? `${found.provider.id}:${found.match.range[0]}:${found.match.query}` : undefined
}

/** State plus a ref that always holds the latest value, updated synchronously. */
function useLive<T>(initial: T | (() => T)) {
  const [value, setValue] = React.useState(initial)
  const ref = React.useRef(value)
  const set = React.useCallback((next: T) => {
    ref.current = next
    setValue(() => next)
  }, [])
  return [value, ref, set] as const
}

const toEditor = (v: ComposerValue): EditorState => ({ value: v.text, caret: v.caret })
/** The draft around the start of a possibly split report: before it and after its latest piece. */
type HeldReport = { before: EditorState; after: EditorState }
const sameEditor = (a: EditorState, b: EditorState) => a.value === b.value && a.caret === b.caret

/**
 * Cells left for text at `width`: the prompt, the border and padding of the
 * boxed variant, and one cell kept for the caret come off.
 */
export function composerInnerWidth(
  width: number,
  variant: 'boxed' | 'plain' = 'boxed',
  promptWidth = 2,
): number {
  return Math.max(1, width - promptWidth - (variant === 'boxed' ? 4 : 0) - 1)
}

/**
 * Rows the composer takes at `width` for `value`: its input rows (up to
 * `maxRows`), the attachments row, and the boxed variant's border — not the
 * hint or completion lines under it. Lets a host size the rest of the screen.
 */
export function composerRows(
  value: Pick<ComposerValue, 'text' | 'attachments'>,
  width: number,
  options: {
    variant?: 'boxed' | 'plain'
    maxRows?: number | undefined
    promptWidth?: number
    measure?: Measure
  } = {},
): number {
  const { variant = 'boxed', maxRows, promptWidth = 2, measure = defaultMeasure } = options
  const rows = visualRows(
    value.text,
    composerInnerWidth(width, variant, promptWidth),
    measure,
  ).length
  const shown = maxRows === undefined ? rows : Math.min(rows, Math.max(1, maxRows))
  return shown + (value.attachments.length > 0 ? 1 : 0) + (variant === 'boxed' ? 2 : 0)
}

/** Keep the caret's row inside a window of `max` rows, moving the window as little as possible. */
function scrollTop(top: number, row: number, rows: number, max: number): number {
  const last = Math.max(0, rows - max)
  if (row < top) return row
  if (row >= top + max) return Math.min(row - max + 1, last)
  return Math.min(top, last)
}

export function Composer({
  onSubmit,
  onEscape,
  providers,
  history: initialHistory,
  placeholder = 'Message',
  disabled = false,
  hint,
  maxItems = 6,
  value: controlled,
  onChange,
  variant = 'boxed',
  width,
  maxRows,
  focused = true,
  attachmentHint,
  killLine = 'line',
  onKey,
  onPaste,
  inputSource = 'own',
  ref,
  kittyKeyboard = false,
  measure = defaultMeasure,
}: ComposerProps) {
  const { glyphs, theme } = useInkComponents()
  const { stdout } = ink.useStdout()
  // Keys can arrive faster than React re-renders (two events in one tick), so
  // handlers read and write the live values through refs rather than the
  // rendered snapshot.
  const [own, valueRef, setOwn] = useLive<ComposerValue>(controlled ?? emptyComposerValue)
  const seen = React.useRef(controlled)
  if (controlled && controlled !== seen.current) {
    seen.current = controlled
    valueRef.current = controlled
  }
  const current = controlled ?? own
  const [, historyRef, setHistory] = useLive(() => createHistory(initialHistory))
  // Entries added after mount (by the host, e.g. a message sent another way)
  // join the history; a browse in progress and the draft are kept.
  const historyLength = initialHistory?.length ?? 0
  const seenHistory = React.useRef(initialHistory)
  React.useEffect(() => {
    if (
      seenHistory.current === initialHistory &&
      historyLength === historyRef.current.entries.length
    )
      return
    seenHistory.current = initialHistory
    setHistory(withEntries(historyRef.current, initialHistory ?? []))
  }, [initialHistory, historyLength, historyRef, setHistory])
  const [completion, completionRef, setCompletion] = useLive<Completion | undefined>(undefined)
  const [dismissed, dismissedRef, setDismissed] = useLive<string | undefined>(undefined)
  // Set when a history entry is shown unedited: ↑/↓ then keep stepping history.
  const recalled = React.useRef(false)
  const active = focused && !disabled

  const prompt = `${glyphs.prompt} `
  const promptWidth = measure(prompt)
  const inner = width === undefined ? undefined : composerInnerWidth(width, variant, promptWidth)
  const rowsOf = (text: string) => visualRows(text, inner, measure)

  // Resolve completion items whenever the token at the caret changes.
  const found = findMatch(providers, toEditor(current))
  const tokenKey = keyOf(found)
  const latest = React.useRef(found)
  latest.current = found
  // Keyed on the token only; the match is read through `latest`.
  React.useEffect(() => {
    const match = latest.current
    if (!tokenKey || !match || tokenKey === dismissed) {
      setCompletion(undefined)
      return
    }
    const controller = new AbortController()
    Promise.resolve(match.provider.items(match.match.query, controller.signal)).then(
      (items) => {
        if (controller.signal.aborted) return
        setCompletion(
          items.length > 0
            ? { provider: match.provider, match: match.match, items, active: 0 }
            : undefined,
        )
      },
      () => {
        if (!controller.signal.aborted) setCompletion(undefined)
      },
    )
    return () => controller.abort()
  }, [tokenKey, dismissed])

  React.useEffect(() => {
    if (!kittyKeyboard || !active) return
    stdout.write(KITTY_PUSH)
    const pop = () => stdout.write(KITTY_POP)
    process.once('exit', pop)
    return () => {
      process.off('exit', pop)
      pop()
    }
  }, [kittyKeyboard, active, stdout])

  const commit = (next: ComposerValue) => {
    setOwn(next)
    onChange?.(next)
  }

  const setEditor = (state: EditorState, attachments = valueRef.current.attachments) =>
    commit({ text: state.value, caret: state.caret, attachments })

  /** A change from the user: an edit ends a recall and reopens completion. */
  const edit = (next: EditorState) => {
    if (dismissedRef.current !== undefined) setDismissed(undefined)
    if (next.value !== valueRef.current.text) recalled.current = false
    setEditor(next)
  }

  const apply = (c: Completion) => {
    const item = c.items[c.active] as CompletionItem
    const [start, end] = c.match.range
    const text = valueRef.current.text
    const result = c.provider.apply(item, text.slice(0, start), text.slice(end))
    const next = { value: result.value, caret: result.caret }
    setEditor(next)
    setCompletion(undefined)
    // The applied text usually still matches its own token; keep the list
    // closed until the user edits again, so Enter then sends.
    setDismissed(keyOf(findMatch(providers, next)))
  }

  /** Submit `text` with the current attachments (if either has content); returns whether it was sent. */
  const send = (text: string): boolean => {
    const attachments = valueRef.current.attachments
    if (!text.trim() && attachments.length === 0) return false
    if (attachments.length > 0) onSubmit(text, attachments)
    else onSubmit(text)
    setHistory(pushHistory(historyRef.current, { text, attachments }))
    setCompletion(undefined)
    recalled.current = false
    return true
  }

  const cleared: EditorState = { value: '', caret: 0 }

  const submit = () => {
    if (send(valueRef.current.text)) setEditor(cleared, [])
  }

  /**
   * A chunk of typed characters. Terminals and multiplexers may deliver
   * several keystrokes at once (e.g. `"hi\r"`), which arrive as text without
   * the return flag: a `\r` inside the chunk submits what precedes it and a
   * `\n` inserts a newline, as if each key had arrived alone.
   */
  const typeChunk = (chunk: string) => {
    let state = toEditor(valueRef.current)
    for (const part of chunk.split(/(\r\n?|\n)/)) {
      if (part === '\n') state = insert(state, '\n')
      else if (part.startsWith('\r')) {
        if (send(state.value)) {
          state = cleared
          setEditor(state, [])
        }
      } else if (part) state = insert(state, stripControls(part))
    }
    edit(state)
  }

  const paste = (text: string) => {
    if (onPaste?.(text)) return
    edit(insert(toEditor(valueRef.current), stripControls(text.replace(/\r\n?/g, '\n'))))
  }

  const stepThroughHistory = (direction: -1 | 1) => {
    const value = valueRef.current
    const stepped = stepHistory(historyRef.current, direction, {
      text: value.text,
      attachments: value.attachments,
    })
    if (!stepped) return
    setHistory(stepped.history)
    recalled.current = stepped.history.index < stepped.history.entries.length
    setEditor({ value: stepped.value, caret: stepped.value.length }, stepped.attachments ?? [])
  }

  // A report split across key events starts out looking like typing (`[<0;3`):
  // it is inserted, and taken back out when the rest of the report arrives.
  const [readReport] = React.useState(createKeyReportReader)
  const held = React.useRef<HeldReport>(undefined)

  const handleKey = (input: string, key: Key) => {
    const report = readReport(input)
    // Set exactly when the previous event was a `partial`, as the reader's own tail is.
    const start = held.current as HeldReport
    held.current = undefined
    if (report.kind === 'report') {
      const now = toEditor(valueRef.current)
      // Only if nothing else changed the draft since (a paste, the host).
      if (report.joined && sameEditor(now, start.after) && !sameEditor(now, start.before))
        edit(start.before)
      if (report.rest) handleKey(report.rest, key)
      return
    }
    // A continued start keeps the draft from before its first piece.
    const from =
      report.kind === 'partial' && report.continued ? start.before : toEditor(valueRef.current)
    // Held before handling, so a throwing host handler cannot leave the reader ahead of it.
    if (report.kind === 'partial') held.current = { before: from, after: from }
    handleOwnKey(input, key)
    if (held.current) held.current.after = toEditor(valueRef.current)
  }

  const handleOwnKey = (input: string, key: Key) => {
    if (onKey?.(input, key)) return
    const completion = completionRef.current
    const editor = toEditor(valueRef.current)
    if (completion) {
      if (key.upArrow || key.downArrow) {
        const n = completion.items.length
        setCompletion({
          ...completion,
          active: (completion.active + (key.upArrow ? n - 1 : 1)) % n,
          navigated: true,
        })
        return
      }
      // Tab always completes; Enter picks only a selection the user moved
      // to, so a complete line (e.g. a command) still sends on Enter.
      if (key.tab || (key.return && completion.navigated)) {
        apply(completion)
        return
      }
      if (key.escape) {
        setDismissed(keyOf(findMatch(providers, editor)))
        setCompletion(undefined)
        return
      }
    }
    if (key.escape) {
      onEscape?.()
      return
    }
    if (key.return) {
      if (key.meta || key.shift) edit(insert(editor, '\n'))
      else if (editor.value.slice(0, editor.caret).endsWith('\\')) {
        edit(insert(backspace(editor), '\n'))
      } else submit()
      return
    }
    if (key.backspace) return edit(backspace(editor))
    if (key.delete) return edit(deleteForward(editor))
    if ((key.ctrl || key.meta) && key.leftArrow) return edit(wordLeft(editor))
    if ((key.ctrl || key.meta) && key.rightArrow) return edit(wordRight(editor))
    if (key.meta && input === 'b') return edit(wordLeft(editor))
    if (key.meta && input === 'f') return edit(wordRight(editor))
    if (key.leftArrow) return edit(moveBy(editor, -1))
    if (key.rightArrow) return edit(moveBy(editor, 1))
    if (key.home || (key.ctrl && input === 'a')) return edit(lineStart(editor))
    if (key.end || (key.ctrl && input === 'e')) return edit(lineEnd(editor))
    if (key.ctrl && input === 'u') {
      return edit(killLine === 'input' ? cleared : killToLineStart(editor))
    }
    if (key.ctrl && input === 'k') return edit(killToLineEnd(editor))
    if (key.ctrl && input === 'w') return edit(deleteWordBack(editor))
    if (key.upArrow || key.downArrow) {
      const direction = key.upArrow ? -1 : 1
      const moved = recalled.current
        ? undefined
        : moveVisual(editor, rowsOf(editor.value), direction, measure)
      if (moved) return edit(moved)
      stepThroughHistory(direction)
      return
    }
    if (key.ctrl || key.meta || key.tab || !input) return
    typeChunk(input)
  }

  React.useImperativeHandle(ref, () => ({ key: handleKey, paste }))

  const listening = active && inputSource === 'own'
  ink.usePaste(paste, { isActive: listening })
  ink.useInput(handleKey, { isActive: listening })

  const rows = rowsOf(current.text)
  const row = caretRow(rows, current.caret)
  const top = React.useRef(0)
  top.current =
    maxRows === undefined ? 0 : scrollTop(top.current, row, rows.length, Math.max(1, maxRows))
  const shown = rows.slice(top.current, maxRows === undefined ? undefined : top.current + maxRows)
  const empty = current.text === '' && current.attachments.length === 0

  const input = empty ? (
    <Text>
      {focused ? (
        <>
          <Text {...appearanceProps(theme.cursor)}>{placeholder.slice(0, 1) || ' '}</Text>
          <Styled tone="muted">{placeholder.slice(1)}</Styled>
        </>
      ) : (
        <Styled tone="muted">{placeholder}</Styled>
      )}
    </Text>
  ) : (
    shown.map((r, i) => {
      const text = current.text.slice(r.start, r.end)
      const caret = focused && top.current + i === row ? current.caret - r.start : undefined
      return (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity beyond position
        <Text key={i} wrap={inner === undefined ? 'wrap' : 'truncate'}>
          {caret === undefined ? (
            text || ' '
          ) : (
            <>
              {text.slice(0, caret)}
              <Text {...appearanceProps(theme.cursor)}>{text[caret] ?? ' '}</Text>
              {text.slice(caret + 1)}
            </>
          )}
        </Text>
      )
    })
  )

  const attachments =
    current.attachments.length > 0 ? (
      <Text wrap="truncate">
        <Styled tone="link">{`${glyphs.attachment} `}</Styled>
        <Text dimColor>
          {truncate(
            [
              current.attachments
                .map((a) => a.description ?? a.name ?? a.mediaType)
                .join(glyphs.separator),
              attachmentHint,
            ]
              .filter(Boolean)
              .join('  '),
            Math.max(1, (width ?? Number.POSITIVE_INFINITY) - measure(`${glyphs.attachment} `)),
            measure,
          )}
        </Text>
      </Text>
    ) : null

  const promptTone = focused ? 'marker' : 'chrome'
  const below = completion ? (
    <ink.Box flexDirection="column" paddingLeft={2}>
      {completion.items.slice(0, maxItems).map((item, i) => (
        <Text key={item.id}>
          <Text {...(i === completion.active ? appearanceProps(theme.cursor) : {})}>
            {item.label}
          </Text>
          {item.description ? <Styled tone="muted"> {item.description}</Styled> : null}
        </Text>
      ))}
    </ink.Box>
  ) : hint ? (
    <ink.Box paddingLeft={2}>
      <Styled tone="muted">{hint}</Styled>
    </ink.Box>
  ) : null

  if (variant === 'plain') {
    return (
      <ink.Box flexDirection="column">
        {attachments}
        <ink.Box>
          <ink.Box flexDirection="column" width={promptWidth} flexShrink={0}>
            <Styled tone={promptTone}>{prompt}</Styled>
          </ink.Box>
          <ink.Box flexDirection="column" flexGrow={1}>
            {input}
          </ink.Box>
        </ink.Box>
        {below}
      </ink.Box>
    )
  }

  return (
    <ink.Box flexDirection="column">
      {attachments}
      <ink.Box
        {...(width === undefined ? {} : { width })}
        borderStyle="round"
        borderColor={theme.chrome.color ?? 'gray'}
        borderDimColor={Boolean(theme.chrome.dim)}
        paddingX={1}
      >
        <ink.Box marginRight={1}>
          <Styled tone={promptTone}>{glyphs.prompt}</Styled>
        </ink.Box>
        <ink.Box flexDirection="column" flexGrow={1}>
          {input}
        </ink.Box>
      </ink.Box>
      {below}
    </ink.Box>
  )
}
