/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */

import {
  type CustomBlock,
  type DetailLevel,
  type RenderableMessage,
  type ToolCallBlock,
  toolResultText,
} from '@fx/chat-core'
/**
 * The fullscreen transcript: exactly `height` rows of laid-out lines, either
 * following new output or pinned to a top line. Any message may be redrawn
 * (no static output). The rendered window is memoised on a shape signature,
 * so a keystroke in a sibling composer does not rebuild it.
 */
import type { DOMElement, Key } from 'ink'
import type { ReactNode } from 'react'
import { useInkComponents } from '../registry'
import { React, hooks, ink } from '../runtime'
import { isTerminalReport } from '../terminal'
import type { InkAppearance, InkThemeRole } from '../theme'
import { Lines } from './Lines'
import { compactFrame } from './frames'
import { type ImageProvider, type ImageState, layoutImage } from './images'
import {
  type BlockLayoutContext,
  type FooterHints,
  type LayoutContext,
  type LineDraft,
  type MarkdownLayout,
  type MessageFrame,
  type OpenState,
  ROW_PATH,
} from './layout'
import { terminalMarkdown } from './markdown'
import { type Measure, defaultMeasure } from './measure'
import type { Line } from './model'
import {
  type MouseEvent,
  type Point,
  copyText,
  createReportReader,
  highlightLine,
  ordered,
  osc52,
  parseMouse,
  screenOrigin,
  useMouseReporting,
  useTerminalData,
} from './mouse'
import { type LayoutCache, createLayoutCache, layoutTranscript } from './transcript'

/** Follow the bottom, or stay pinned to a top line. */
export type Scroll = { follow: true } | { follow: false; top: number }

/** The viewport's geometry: total lines, the first visible one, rows, and lines below. */
export interface Geometry {
  total: number
  first: number
  rows: number
  below: number
}

export const scrollHome: Scroll = { follow: false, top: 0 }
export const scrollEnd: Scroll = { follow: true }

/** The window's first line for a scroll state. */
export function firstLine(scroll: Scroll, total: number, rows: number): number {
  const last = Math.max(0, total - rows)
  return scroll.follow ? last : Math.max(0, Math.min(scroll.top, last))
}

/** Scroll by `delta` lines, clamped; reaching the bottom returns to follow. */
export function scrollBy(scroll: Scroll, delta: number, g: Geometry): Scroll {
  const last = Math.max(0, g.total - g.rows)
  const top = Math.max(0, Math.min(firstLine(scroll, g.total, g.rows) + delta, last))
  return top >= last ? scrollEnd : { follow: false, top }
}

/** Scroll by pages; a page keeps two lines of context. */
export function pageBy(scroll: Scroll, pages: number, g: Geometry): Scroll {
  return scrollBy(scroll, pages * Math.max(1, g.rows - 2), g)
}

const NEXT_DETAIL: Record<DetailLevel, DetailLevel> = {
  collapsed: 'details',
  details: 'full',
  full: 'collapsed',
}

/** Remappable viewport keys; `false` disables a binding (or all of them). */
export interface ViewportKeys {
  page?: boolean
  lines?: boolean
  homeEnd?: boolean
  detail?: boolean
}

export interface TranscriptViewportProps {
  messages: RenderableMessage[]
  width: number
  height: number
  /** The live message's id, when one streams. */
  streamingMessageId?: string | undefined
  scroll: Scroll
  onScroll: (next: Scroll) => void
  onGeometry?: (geometry: Geometry) => void
  detail?: DetailLevel
  onDetailChange?: (detail: DetailLevel) => void
  /** The message frame (default compact). */
  frame?: MessageFrame
  activityPlacement?: 'inline' | 'after-content'
  /** Newest tool rows a collapsed live message shows (default 3). */
  liveTail?: number
  /** Footer on the live message (default true here). */
  liveFooter?: boolean
  accentFor?: (message: RenderableMessage) => InkThemeRole | InkAppearance
  /** Drawn centred when there is nothing to show. */
  empty?: ReactNode
  /** Controlled open state for rows and JSON members (uncontrolled when omitted). */
  opened?: OpenState
  onToggle?: (blockId: string, path: string) => void
  hints?: FooterHints
  markdown?: MarkdownLayout
  blockLayouts?: Record<string, (block: CustomBlock, ctx: BlockLayoutContext) => LineDraft[]>
  measure?: Measure
  /** Whether the viewport takes its keys (default true). */
  focused?: boolean
  /** Key bindings; `false` disables all. Home/End need `homeEnd: true` (no composer). */
  keys?: ViewportKeys | false
  /** Lays out a block image line, when the host draws images. */
  image?: LayoutContext['image']
  /** Draw a line differently (selection highlight); index is within the window. */
  override?: (line: Line, index: number, absolute: number) => ReactNode | undefined
  /** Bumped by an image provider when an image arrives (part of the cache key). */
  imagesVersion?: number
  /** Draws block images (used when `image` is not given). */
  images?: ImageProvider
  /** Rows an expanded image may take (default: the height minus 8). */
  maxImageHeight?: number
  /** Mouse support (opt-in): wheel, drag-select and copy, clicks. */
  mouse?: ViewportMouse
  /** Writes terminal escapes: mouse reporting, copies, the image query (default: stdout). */
  write?: (data: string) => void
  /** Host facts after a message's own footer facts (e.g. `turn 42` in details). */
  footerExtras?: LayoutContext['footerExtras']
  /** A finished answer's folded activity when collapsed: a row (default) or only the footer counts. */
  finishedActivity?: LayoutContext['finishedActivity']
}

/** Mouse options. Shift+drag keeps the terminal's own selection. */
export interface ViewportMouse {
  /** Lines per wheel step (default 3). */
  wheelStep?: number
  /** Double-click interval in ms (default 400). */
  doubleClickMs?: number
  /** Writes this feature's escapes (default: the viewport's `write`). */
  write?: (data: string) => void
  /** Called after a copy with the text and a short description. */
  onCopy?: (text: string, description: string) => void
  /** Ctrl+click on an image; hosts should accept only http(s). */
  onOpenUrl?: (url: string) => void
}

/** Uncontrolled open state: a version plus the set of open `blockId␟path` keys. */
export function useOpenState(): [OpenState, (blockId: string, path: string) => void] {
  const [state, setState] = React.useState<{ version: number; open: Set<string> }>({
    version: 0,
    open: new Set(),
  })
  const toggle = React.useCallback((blockId: string, path: string) => {
    setState((current) => {
      const open = new Set(current.open)
      const key = `${blockId}␟${path}`
      if (open.has(key)) open.delete(key)
      else open.add(key)
      return { version: current.version + 1, open }
    })
  }, [])
  const opened = React.useMemo<OpenState>(
    () => ({ version: state.version, isOpen: (b, p) => state.open.has(`${b}␟${p}`) }),
    [state],
  )
  return [opened, toggle]
}

/** Lay out the transcript and compute the window (for hosts that draw extra chrome). */
export function useTranscriptLayout(props: TranscriptViewportProps) {
  const { theme, glyphs } = useInkComponents()
  const live = props.streamingMessageId !== undefined
  const now = Math.floor(hooks.useClock(live, 1000) / 1000) * 1000
  const [ownOpened, ownToggle] = useOpenState()
  const opened = props.opened ?? ownOpened
  const provider = props.images
  const [, bump] = React.useState(0)
  React.useEffect(() => provider?.subscribe(() => bump((n) => n + 1)), [provider])
  const [expanded, setExpanded] = React.useState<{ version: number; open: Set<string> }>({
    version: 0,
    open: new Set(),
  })
  const toggleExpanded = React.useCallback((src: string) => {
    setExpanded((current) => {
      const open = new Set(current.open)
      if (open.has(src)) open.delete(src)
      else open.add(src)
      return { version: current.version + 1, open }
    })
  }, [])
  // The last state each image was laid out in, for clicks.
  const imageStates = React.useRef(new Map<string, ImageState | undefined>())
  const imagesVersion = (props.imagesVersion ?? 0) + (provider?.version ?? 0) + expanded.version
  const cache = React.useRef<LayoutCache | null>(null)
  const versionRef = React.useRef(imagesVersion)
  versionRef.current = imagesVersion
  cache.current ??= createLayoutCache(() => versionRef.current)
  const ctx: LayoutContext = {
    width: props.width,
    detail: props.detail ?? 'collapsed',
    placement: props.activityPlacement ?? 'inline',
    liveTail: props.liveTail ?? 3,
    isActive: (message) => message.id === props.streamingMessageId,
    now,
    opened,
    markdown: props.markdown ?? terminalMarkdown,
    glyphs,
    theme,
    hints: props.hints ?? {},
    liveFooter: props.liveFooter ?? true,
    ...(props.blockLayouts ? { blockLayouts: props.blockLayouts } : {}),
    frame: props.frame ?? compactFrame,
    accentFor: props.accentFor,
    measure: props.measure ?? defaultMeasure,
    footerExtras: props.footerExtras,
    finishedActivity: props.finishedActivity,
    image:
      props.image ??
      (provider
        ? (src, alt, width) =>
            layoutImage(src, alt, width, {
              provider: {
                ...provider,
                get: (source, box) => {
                  const state = provider.get(source, box)
                  imageStates.current.set(source, state)
                  return state
                },
              },
              expanded: expanded.open.has(src),
              maxHeight: props.maxImageHeight ?? Math.max(1, props.height - 8),
              glyphs,
              measure: props.measure ?? defaultMeasure,
            })
        : undefined),
  }
  const { lines } = layoutTranscript(props.messages, ctx, cache.current)
  const rows = Math.max(0, props.height)
  const first = firstLine(props.scroll, lines.length, rows)
  const geometry: Geometry = {
    total: lines.length,
    first,
    rows,
    below: Math.max(0, lines.length - first - rows),
  }
  return {
    lines,
    geometry,
    window: lines.slice(first, first + rows),
    toggle: props.onToggle ?? ownToggle,
    now,
    imageStates: imageStates.current,
    toggleExpanded,
  }
}

/** Contiguous lines around `index` in the same tool output box, if it is in one. */
function outputBox(lines: readonly Line[], index: number): [number, number] | undefined {
  const blockOf = (line: Line | undefined) =>
    line?.target && (line.target.kind === 'tool-output' || line.target.kind === 'json-toggle')
      ? `${line.owner.messageId}␟${line.target.blockId}`
      : undefined
  const box = blockOf(lines[index])
  if (!box) return undefined
  let a = index
  let b = index
  while (blockOf(lines[a - 1]) === box) a--
  while (blockOf(lines[b + 1]) === box) b++
  return [a, b]
}

/** A tool's whole output, JSON pretty-printed. */
function outputText(tool: ToolCallBlock): string {
  const text = toolResultText(tool.result)
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

/** A message as written (an answer's raw markdown). */
function messageText(message: RenderableMessage): string {
  return message.blocks
    .filter((block) => block.type === 'text')
    .map((block) => (block as { text: string }).text)
    .join('\n\n')
}

const ids = new WeakMap<Line, number>()
let nextId = 0
/** A stable id per line object (lines are cached per message, so identity is content). */
function lineId(line: Line): number {
  let id = ids.get(line)
  if (id === undefined) {
    id = ++nextId
    ids.set(line, id)
  }
  return id
}

/** What a key does in the viewport (pure, so every binding is testable). */
export function viewportKeyAction(
  input: string,
  key: Pick<
    Key,
    'pageUp' | 'pageDown' | 'shift' | 'upArrow' | 'downArrow' | 'home' | 'end' | 'ctrl'
  >,
  keys: ViewportKeys | false,
  scroll: Scroll,
  geometry: Geometry,
  detail: DetailLevel,
): { scroll: Scroll } | { detail: DetailLevel } | undefined {
  if (keys === false || isTerminalReport(input)) return undefined
  if (keys.page !== false && key.pageUp) return { scroll: pageBy(scroll, -1, geometry) }
  if (keys.page !== false && key.pageDown) return { scroll: pageBy(scroll, 1, geometry) }
  if (keys.lines !== false && key.shift && key.upArrow)
    return { scroll: scrollBy(scroll, -3, geometry) }
  if (keys.lines !== false && key.shift && key.downArrow)
    return { scroll: scrollBy(scroll, 3, geometry) }
  if (keys.homeEnd && key.home) return { scroll: scrollHome }
  if (keys.homeEnd && key.end) return { scroll: scrollEnd }
  if (keys.detail !== false && key.ctrl && input === 't') return { detail: NEXT_DETAIL[detail] }
  return undefined
}

interface Selection {
  anchor: Point
  head: Point
}

export function TranscriptViewport(props: TranscriptViewportProps) {
  const { theme } = useInkComponents()
  const { lines, geometry, window, toggle, imageStates, toggleExpanded } =
    useTranscriptLayout(props)
  const { onGeometry, onScroll, onDetailChange, scroll, focused = true, keys = {} } = props
  const detail = props.detail ?? 'collapsed'
  const measure = props.measure ?? defaultMeasure
  const { stdout } = ink.useStdout()

  const last = React.useRef('')
  React.useEffect(() => {
    const key = `${geometry.total}:${geometry.first}:${geometry.rows}:${geometry.below}`
    if (key === last.current) return
    last.current = key
    onGeometry?.(geometry)
  })

  const [selection, setSelection] = React.useState<Selection | undefined>(undefined)

  ink.useInput(
    (input: string, key: Key) => {
      const action = viewportKeyAction(input, key, keys, scroll, geometry, detail)
      if (action && 'scroll' in action) onScroll(action.scroll)
      else if (action) onDetailChange?.(action.detail)
    },
    { isActive: focused && keys !== false },
  )
  // Any key clears the selection.
  ink.useInput(() => setSelection(undefined), { isActive: focused && selection !== undefined })

  const mouse = props.mouse
  const mouseActive = mouse !== undefined && focused
  const write = mouse?.write ?? props.write ?? ((data: string) => stdout.write(data))
  useMouseReporting(mouseActive, write)

  const box = React.useRef<DOMElement>(null)
  const press = React.useRef<{ at: Point; moved: boolean; clamp?: [number, number] } | undefined>(
    undefined,
  )
  const lastClick = React.useRef<{ line: number; at: number } | undefined>(undefined)

  const copy = (text: string, description: string) => {
    write(osc52(text))
    mouse?.onCopy?.(text, description)
  }

  /** The point under a screen cell, rows clamped to the visible window. */
  const pointAt = (e: MouseEvent): Point & { inside: boolean } => {
    const origin = screenOrigin(box.current)
    const row = e.y - origin.y
    const inside = row >= 0 && row < window.length
    const clamped = Math.max(0, Math.min(row, window.length - 1))
    return { line: geometry.first + clamped, col: Math.max(0, e.x - origin.x), inside }
  }

  const click = (at: Point, e: MouseEvent) => {
    const line = lines[at.line] as Line
    const target = line.target
    if (target?.kind === 'json-toggle') return toggle(target.blockId, target.path)
    if (target?.kind === 'row-toggle') return toggle(target.rowKey, ROW_PATH)
    if (target?.kind === 'image') {
      if (e.ctrl) return mouse?.onOpenUrl?.(target.src)
      const state = imageStates.get(target.src)
      if (state?.kind === 'ask') props.images?.allow(target.src)
      else if (state?.kind === 'ready') toggleExpanded(target.src)
      return
    }
    const now = Date.now()
    const previous = lastClick.current
    if (previous?.line === at.line && now - previous.at <= (mouse?.doubleClickMs ?? 400)) {
      lastClick.current = undefined
      // Every line comes from a message, and an output line from its tool.
      const message = props.messages.find((m) => m.id === line.owner.messageId) as RenderableMessage
      if (target?.kind === 'tool-output') {
        const tool = message.blocks.find(
          (b) => b.type === 'tool_call' && b.id === target.blockId,
        ) as ToolCallBlock
        copy(outputText(tool), 'tool output')
        return
      }
      copy(messageText(message), 'message')
      return
    }
    lastClick.current = { line: at.line, at: now }
  }

  const onMouse = (e: MouseEvent) => {
    if (window.length === 0) return
    if (e.kind === 'wheel-up' || e.kind === 'wheel-down') {
      const step = mouse?.wheelStep ?? 3
      onScroll(scrollBy(scroll, e.kind === 'wheel-up' ? -step : step, geometry))
      return
    }
    // Shift gestures belong to the terminal's own selection: a Shift press or
    // drag neither starts nor extends one here, and a Shift release abandons
    // a pending press without clicking or copying.
    if (e.shift) {
      if (e.kind === 'release') press.current = undefined
      return
    }
    if (e.button !== 'left' && e.kind !== 'release') return
    const point = pointAt(e)
    if (e.kind === 'press') {
      if (!point.inside) return
      const clamp = outputBox(lines, point.line)
      press.current = { at: point, moved: false, ...(clamp ? { clamp } : {}) }
      setSelection(undefined)
      return
    }
    const current = press.current
    if (!current) return
    const head: Point = current.clamp
      ? { line: Math.max(current.clamp[0], Math.min(point.line, current.clamp[1])), col: point.col }
      : { line: point.line, col: point.col }
    if (e.kind === 'drag') {
      current.moved = true
      setSelection({ anchor: current.at, head })
      return
    }
    press.current = undefined
    if (!current.moved && head.line === current.at.line && head.col === current.at.col) {
      click(current.at, e)
      return
    }
    const text = copyText(lines, current.at, head, measure)
    setSelection({ anchor: current.at, head })
    const count = text.split('\n').length
    if (text) copy(text, `${count} line${count === 1 ? '' : 's'}`)
  }

  // The image provider's query goes out once; its reply comes back as raw input.
  const images = props.images
  const writeRef = React.useRef(write)
  writeRef.current = write
  React.useEffect(() => {
    if (images?.query) writeRef.current(images.query)
  }, [images])

  // Reports may arrive split across chunks; the reader joins them.
  const [readReports] = React.useState(createReportReader)
  useTerminalData(
    (data) => {
      for (const report of readReports(data)) {
        if (images?.takeReply?.(report)) continue
        if (mouseActive) for (const e of parseMouse(report)) onMouse(e)
      }
    },
    mouseActive || images?.takeReply !== undefined,
  )

  const [from, to] = selection ? ordered(selection.anchor, selection.head) : []
  const shown =
    from && to
      ? window.map((line, i) => {
          const at = geometry.first + i
          if (at < from.line || at > to.line) return line
          const start = at === from.line ? from.col : 0
          const end = at === to.line ? to.col : Number.POSITIVE_INFINITY
          return highlightLine(line, start, end, theme.selection, measure)
        })
      : window
  const selected = from && to ? `${from.line}.${from.col}-${to.line}.${to.col}` : ''
  const signature = `${geometry.first}:${lines.length}:${props.width}:${selected}:${window.map(lineId).join(',')}`
  // The window's line objects are cached per message, so their identities
  // change exactly when content does; the signature carries them.
  // Memoised on the window shape and line identities (the signature).
  const body = React.useMemo(
    () =>
      lines.length === 0 && props.empty ? (
        <ink.Box
          height={props.height}
          width={props.width}
          alignItems="center"
          justifyContent="center"
        >
          {props.empty}
        </ink.Box>
      ) : (
        <Lines
          lines={shown}
          theme={theme}
          {...(props.override
            ? { override: (line: Line, i: number) => props.override?.(line, i, geometry.first + i) }
            : {})}
        />
      ),
    [signature, theme, props.override, props.empty],
  )

  return (
    <ink.Box
      ref={box}
      height={props.height}
      width={props.width}
      flexDirection="column"
      overflow="hidden"
      flexShrink={0}
    >
      {body}
    </ink.Box>
  )
}
