import type { ClockProviderProps } from '@fx/chat-core/hooks'
/**
 * `createChatInk({ React, ink })` — the entry point. It binds the package to
 * the host's React and Ink (see `runtime.ts`) and returns the renderer: the
 * components, the hooks, and the core render hooks bound to the same React
 * (render a `ClockProvider` from here so every timer shares one clock).
 * The module-level exports are the same functions, usable once bound.
 */
import { Composer } from './Composer'
import { MessageView } from './MessageView'
import { Row } from './Row'
import { Spinner } from './Spinner'
import { Transcript } from './Transcript'
import { Lines } from './lines/Lines'
import { EmptyState, PendingRows, StatusLine } from './lines/Status'
import { TranscriptViewport, useOpenState, useTranscriptLayout } from './lines/Viewport'
import { useMouseReporting, useTerminalData } from './lines/mouse'
import { InkChatProvider, PlainMarkdown, Styled, useInkComponents } from './registry'
import { type ChatInkDeps, React, bindRuntime, hooks } from './runtime'

/**
 * One shared clock for every timer, rate, spinner and pulse this package
 * draws (the core hooks' provider, on the host's React).
 */
export function ClockProvider(props: ClockProviderProps) {
  return React.createElement(hooks.ClockProvider, props)
}

export function createChatInk(deps: ChatInkDeps) {
  bindRuntime(deps)
  return {
    React: deps.React,
    ink: deps.ink,
    /** The core render hooks (clock, timers, rates) on the host's React. */
    hooks,
    ClockProvider,
    Composer,
    EmptyState,
    InkChatProvider,
    Lines,
    MessageView,
    PendingRows,
    PlainMarkdown,
    Row,
    Spinner,
    StatusLine,
    Styled,
    Transcript,
    TranscriptViewport,
    useInkComponents,
    useMouseReporting,
    useOpenState,
    useTerminalData,
    useTranscriptLayout,
  }
}

/** The renderer `createChatInk` returns. */
export type ChatInk = ReturnType<typeof createChatInk>
