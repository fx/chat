/**
 * The injected look of the terminal renderer.
 *
 * Like `@fx/chat`'s `classNames`, the package decides structure and semantics
 * and the host decides appearance: every piece of text names its ROLE and the
 * theme answers with an appearance. Glyphs (icons, disclosure markers, spinner
 * frames) are injected the same way. The defaults are greyscale and plain, so
 * an un-themed transcript reads correctly on any terminal.
 */

/** Text attributes for one role. An absent attribute is not applied. */
export interface InkAppearance {
  /** Any Ink/chalk colour name or hex string. */
  color?: string
  dim?: boolean
  bold?: boolean
  italic?: boolean
  inverse?: boolean
  underline?: boolean
  strikethrough?: boolean
}

/** The semantic roles text is drawn in. */
export type InkThemeRole =
  /** Ordinary answer text. */
  | 'content'
  /** Secondary text: timers, metrics, hints, reasoning bodies. */
  | 'muted'
  /** Emphasis: group/row labels. */
  | 'strong'
  /** Markers: glyphs, disclosure carets, `+N` counts. */
  | 'marker'
  /** Frame and separators (composer border). */
  | 'chrome'
  /** The composer cursor. */
  | 'cursor'
  | 'positive'
  | 'caution'
  | 'danger'
  /** The user's own messages. */
  | 'user'
  /** The assistant's role label. */
  | 'assistant'
  /** Per-message accent: frame gutters, footer corners, the live pulse. */
  | 'accent'
  /** Code spans and blocks. */
  | 'code'
  /** Links. */
  | 'link'
  /** Selected text (mouse selection). */
  | 'selection'

export type InkTheme = Record<InkThemeRole, InkAppearance>

/** Greyscale defaults: no hue anywhere. */
export const plainTheme: InkTheme = {
  content: {},
  muted: { dim: true },
  strong: { bold: true },
  marker: { dim: true },
  chrome: { dim: true },
  cursor: { inverse: true },
  positive: {},
  caution: {},
  danger: { bold: true },
  user: { bold: true },
  assistant: { dim: true },
  accent: {},
  code: {},
  link: { underline: true },
  selection: { inverse: true },
}

/** Glyphs used by the renderer. */
export interface InkGlyphs {
  collapsed: string
  expanded: string
  /** Kind icons, by the core summary icon name. */
  brain: string
  wrench: string
  gear: string
  checklist: string
  /** Plan entry markers by status. */
  planDone: string
  planActive: string
  planPending: string
  success: string
  error: string
  /** Prefix of the user's messages. */
  user: string
  /** Prefix of the assistant's messages. */
  assistant: string
  /** Prompt shown before the composer input. */
  prompt: string
  /** Spinner animation frames. */
  spinner: readonly string[]
  /** Between footer facts and status facts. */
  separator: string
  /** @deprecated No longer drawn (the live tail's row uses `earlier`); kept for existing glyph sets. */
  tool: string
  /** Before the live tail's row counting hidden earlier activity (empty: no marker). */
  earlier: string
  /** Tool row status markers. */
  toolSuccess: string
  toolError: string
  toolRunning: string
  toolIdle: string
  /** Frames: boxes, gutters and footer corner. */
  boxTopLeft: string
  boxTopRight: string
  boxBottomLeft: string
  boxBottomRight: string
  boxJunction: string
  boxHorizontal: string
  boxVertical: string
  footer: string
  /** The dotted bar before tool output lines. */
  outputBar: string
  attachment: string
  image: string
  /** Queued (pending) message rows. */
  pending: string
  /** Live pulse frames for the status line. */
  pulse: readonly string[]
  /** Markdown: list bullets, task markers, rules, quote/code bars, table joints. */
  bullet: string
  taskOpen: string
  taskDone: string
  rule: string
  quoteBar: string
  codeBar: string
  tableColumn: string
  tableCross: string
}

export const plainGlyphs: InkGlyphs = {
  collapsed: '▸',
  expanded: '▾',
  brain: '∴',
  wrench: '⚒',
  gear: '⚙',
  checklist: '☑',
  planDone: '✓',
  planActive: '…',
  planPending: '·',
  success: '✓',
  error: '✗',
  user: '›',
  assistant: '•',
  prompt: '›',
  spinner: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  separator: ' · ',
  tool: '🔧',
  earlier: '⋮',
  toolSuccess: '✓',
  toolError: '✗',
  toolRunning: '…',
  toolIdle: '·',
  boxTopLeft: '╭',
  boxTopRight: '╮',
  boxBottomLeft: '╰',
  boxBottomRight: '╯',
  boxJunction: '├',
  boxHorizontal: '─',
  boxVertical: '│',
  footer: '╰',
  outputBar: '┊',
  attachment: '📎',
  image: '🖼',
  pending: '⏸',
  pulse: ['●··', '·●·', '··●'],
  bullet: '•',
  taskOpen: '☐',
  taskDone: '☑',
  rule: '─',
  quoteBar: '│',
  codeBar: '│',
  tableColumn: '│',
  tableCross: '┼',
}

/** Glyphs using only ASCII, for terminals without box-drawing or emoji symbols. */
export const asciiGlyphs: InkGlyphs = {
  collapsed: '>',
  expanded: 'v',
  brain: '~',
  wrench: '*',
  gear: '#',
  checklist: '=',
  planDone: 'x',
  planActive: '>',
  planPending: '-',
  success: '+',
  error: 'x',
  user: '>',
  assistant: '*',
  prompt: '>',
  spinner: ['|', '/', '-', '\\'],
  separator: ' | ',
  tool: '*',
  earlier: '^',
  toolSuccess: '+',
  toolError: 'x',
  toolRunning: '~',
  toolIdle: '.',
  boxTopLeft: '+',
  boxTopRight: '+',
  boxBottomLeft: '+',
  boxBottomRight: '+',
  boxJunction: '+',
  boxHorizontal: '-',
  boxVertical: '|',
  footer: '+',
  outputBar: ':',
  attachment: '@',
  image: '[img]',
  pending: '..',
  pulse: ['o..', '.o.', '..o'],
  bullet: '-',
  taskOpen: '[ ]',
  taskDone: '[x]',
  rule: '-',
  quoteBar: '|',
  codeBar: '|',
  tableColumn: '|',
  tableCross: '+',
}
