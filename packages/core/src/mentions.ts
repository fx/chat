/**
 * Mention parsing — shared, pure, DOM-free.
 *
 * A "mention" is an `@<id>` token that begins a message or follows whitespace.
 * The id is a run of mention-safe characters (letters, digits, `_`, `-`, `.`).
 * Email-like usage (`user@host`) is deliberately NOT a mention: an `@` that is
 * immediately preceded by a non-whitespace character is treated as plain text.
 *
 * This module is consumed by the user-text renderer (change 0004) for mention
 * highlighting and by the input composer (change 0005) for the same tokenizer,
 * so it is intentionally self-contained: no React, no DOM, no package imports.
 */

/** A parsed mention occurrence: the referenced agent id and its `[start, end)` range. */
export interface MentionRange {
  /** The referenced id — the characters after `@`, excluding the `@` itself. */
  agentId: string
  /**
   * Half-open character range of the whole token (including the leading `@`)
   * within the source string: `[start, end)`.
   */
  range: [number, number]
}

/** A resolved mention segment carried in {@link mentionsToSegments} output. */
export interface MentionSegment {
  /** The referenced id (characters after `@`). */
  agentId: string
  /** The full matched text including the leading `@` (e.g. `@alice`). */
  text: string
  /** Half-open character range `[start, end)` of the token in the source. */
  range: [number, number]
}

/**
 * A single segment of {@link mentionsToSegments} output: either a literal text
 * run or a resolved mention carrying a stable render `key`.
 */
export type Segment = string | { mention: MentionSegment; key: string }

/**
 * Characters allowed in a mention id after the `@`. Kept conservative so URLs
 * and punctuation following a mention (e.g. `@alice,`) terminate the token.
 */
const ID_CHAR = /[A-Za-z0-9_.-]/

/** True when `ch` is undefined (start of string) or a whitespace character. */
function isBoundary(ch: string | undefined): boolean {
  return ch === undefined || /\s/.test(ch)
}

/**
 * Parse all mentions in `text`, returning each as a {@link MentionRange}.
 *
 * A mention matches when:
 * - the `@` is at the start of the string or immediately follows whitespace
 *   (so `a@b` — email-like — does NOT match), and
 * - at least one mention-safe character follows the `@`.
 *
 * Ids may contain `.` and `-`, but a trailing run of `.`/`-` is excluded from
 * the id so `@alice.` highlights `@alice` and leaves `.` as text.
 */
export function parseMentions(text: string): MentionRange[] {
  const out: MentionRange[] = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '@') continue
    // Must be at a word boundary (start-or-after-whitespace), never email-like.
    if (!isBoundary(text[i - 1])) continue
    let j = i + 1
    while (j < text.length && ID_CHAR.test(text[j] as string)) j++
    // Trim a trailing run of `.`/`-` so sentence punctuation stays as text.
    while (j > i + 1 && /[.-]/.test(text[j - 1] as string)) j--
    // Require a non-empty id.
    if (j === i + 1) continue
    out.push({ agentId: text.slice(i + 1, j), range: [i, j] })
    i = j - 1
  }
  return out
}

/**
 * Tokenize `text` into interleaved literal strings and mention segments.
 *
 * Each mention segment carries a stable `key` derived from its start offset, so
 * re-rendering the same text yields identical keys. Consecutive literal runs
 * collapse into single strings; empty literal runs are omitted.
 */
export function mentionsToSegments(text: string): Segment[] {
  const mentions = parseMentions(text)
  if (mentions.length === 0) return text.length > 0 ? [text] : []
  const segments: Segment[] = []
  let cursor = 0
  for (const { agentId, range } of mentions) {
    const [start, end] = range
    if (start > cursor) segments.push(text.slice(cursor, start))
    const matched = text.slice(start, end)
    segments.push({
      mention: { agentId, text: matched, range: [start, end] },
      key: `mention-${start}`,
    })
    cursor = end
  }
  if (cursor < text.length) segments.push(text.slice(cursor))
  return segments
}
