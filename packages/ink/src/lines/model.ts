/**
 * The line model: what a fullscreen viewport scrolls, hit-tests and copies.
 *
 * A line is spans plus metadata — who produced it, how it joins the previous
 * line when copied, whether it is pure decoration, and what a click on it acts
 * on. Spans name a theme role (resolved when drawn) and may carry explicit
 * attributes; `chrome` marks layout that is drawn but never copied.
 */
import type { InkAppearance, InkThemeRole } from '../theme'

export interface Span {
  text: string
  /** Theme role, resolved at render time. */
  role?: InkThemeRole
  /** An explicit appearance (e.g. a per-message accent), applied over the role. */
  style?: InkAppearance
  bold?: boolean
  italic?: boolean
  dim?: boolean
  underline?: boolean
  strike?: boolean
  inverse?: boolean
  /** A literal colour, only where no role can say it. */
  color?: string
  /** Layout (borders, gutters, indents, bars): drawn, never copied. */
  chrome?: boolean
  /** Copied as this string once per character instead of as itself. */
  copyEach?: string
}

/** What a click on a line acts on. */
export type LineTarget =
  | { kind: 'tool-output'; blockId: string }
  | { kind: 'json-toggle'; blockId: string; path: string; open: boolean }
  | { kind: 'image'; src: string }
  | { kind: 'row-toggle'; rowKey: string }

export interface Line {
  spans: Span[]
  /** How this line joins the previous one in a copy: a space (`soft`) or nothing (`hard`). */
  wrap?: 'soft' | 'hard'
  /** Pure decoration (rules, frames, footers): skipped by copy. */
  frame?: boolean
  /** Which message (and block) produced it. */
  owner: { messageId: string; blockId?: string }
  target?: LineTarget
}

/** A span. */
export function span(text: string, extra: Omit<Span, 'text'> = {}): Span {
  return { text, ...extra }
}

/** Prepend spans, keeping the line's metadata. */
export function prefix(line: Line, spans: Span[]): Line {
  return { ...line, spans: [...spans, ...line.spans] }
}

/** Append spans, keeping the line's metadata. */
export function suffix(line: Line, spans: Span[]): Line {
  return { ...line, spans: [...line.spans, ...spans] }
}

/** The line's text as drawn. */
export function lineText(line: Line): string {
  return line.spans.map((s) => s.text).join('')
}
