/**
 * `@fx/chat-ink` — a terminal renderer for `@fx/chat` conversations.
 *
 * Structure and behavior come from `@fx/chat-core` (the same render plan the
 * React-DOM renderer projects); the look — theme roles, glyphs, markdown — is
 * injected through `<InkChatProvider>`, with greyscale plain defaults. React
 * and Ink are injected too: call `createChatInk({ React, ink })` with the
 * host's instances before rendering anything.
 */
export type { ChatInk } from './create'
export { ClockProvider, createChatInk } from './create'
export type { ChatInkDeps, InkApi, ReactApi } from './runtime'
/** The bound instances (live bindings), for a host's own components. */
export { React, hooks, ink, isBound } from './runtime'
export type { ComposerHandle, ComposerProps, ComposerValue } from './Composer'
export { Composer, composerInnerWidth, composerRows, emptyComposerValue } from './Composer'
export type { EditorState, History, HistoryEntry, VisualRow } from './editor'
export {
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
export { KITTY_POP, KITTY_PUSH, isTerminalReport } from './terminal'
export type { InkBlockRendererProps, InkExtensions, MessageViewProps } from './MessageView'
export { MessageView } from './MessageView'
export type { InkComponents, InkMarkdownProps, PartialInkComponents } from './registry'
export {
  InkChatProvider,
  PlainMarkdown,
  Styled,
  appearanceProps,
  mergeInkComponents,
  plainComponents,
  useInkComponents,
} from './registry'
export type { RowProps } from './Row'
export { Row, clipLines, toJson } from './Row'
export { Spinner } from './Spinner'
export type { InkAppearance, InkGlyphs, InkTheme, InkThemeRole } from './theme'
export { asciiGlyphs, plainGlyphs, plainTheme } from './theme'
export type { TranscriptProps } from './Transcript'
export { Transcript } from './Transcript'
export * from './lines'
