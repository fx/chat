/**
 * Terminal protocol helpers shared by the composer and the viewport.
 */

const ESC = String.fromCharCode(27)

const TERMINAL_REPORT = new RegExp(
  `^(?:${ESC})?\\[(?:<\\d+;\\d+;\\d+[Mm]|\\d+;\\d+;\\d+t|\\?\\d[\\d;]*[a-zA-Z])`,
)

/** Mouse reports and terminal replies arrive as input; key handlers ignore them. */
export function isTerminalReport(input: string): boolean {
  return TERMINAL_REPORT.test(input)
}

/** The longest unfinished report followed across key events; a longer one is noise. */
const MAX_TAIL = 64
// The start of a CSI sequence with its ESC stripped: `[`, parameters, intermediates.
const CSI_HEAD = /^\[[\x30-\x3f]*[\x20-\x2f]*/

/**
 * Where the CSI sequence opening `text` (ESC stripped) ends: past its final
 * byte, 0 while it is unfinished, or -1 when `text` opens none.
 */
function csiEnd(text: string): number {
  const head = CSI_HEAD.exec(text)
  if (!head) return -1
  const at = head[0].length
  if (at === text.length) return 0
  const code = text.charCodeAt(at)
  return code >= 0x40 && code <= 0x7e ? at + 1 : -1
}

/** What one key event is, as far as terminal reports go. */
export type KeyReport =
  /** A report, whole or completing an earlier `partial`; `rest` is input after it. */
  | { kind: 'report'; joined: boolean; rest: string }
  /** The unfinished start of what may be a report; `continued` when it extends an earlier one. */
  | { kind: 'partial'; continued: boolean }
  | { kind: 'text' }

/**
 * A reader of terminal reports across key events. Ink holds an unfinished
 * escape sequence only briefly, then delivers it with its ESC stripped (so a
 * report split across stdin chunks arrives as `[<0;3` and then `;4M`). Each
 * call classifies one event's input, following such a start into the next
 * event; the start itself cannot be told from typing (a typed `[` looks the
 * same), so it is `partial` and the caller decides what to hold back.
 */
export function createKeyReportReader(): (input: string) => KeyReport {
  let tail = ''
  return (input) => {
    const held = tail
    tail = ''
    if (isTerminalReport(input)) return { kind: 'report', joined: false, rest: '' }
    const text = input.startsWith(ESC) ? input.slice(1) : input
    if (held && text) {
      const joined = held + text
      const end = csiEnd(joined)
      if (end > 0 && isTerminalReport(joined.slice(0, end)))
        return { kind: 'report', joined: true, rest: joined.slice(end) }
      if (end === 0 && joined.length <= MAX_TAIL) {
        tail = joined
        return { kind: 'partial', continued: true }
      }
    }
    if (csiEnd(text) === 0 && text.length <= MAX_TAIL) {
      tail = text
      return { kind: 'partial', continued: false }
    }
    return { kind: 'text' }
  }
}

/** Kitty keyboard protocol: push the disambiguate flag (Shift+Enter is then reported). */
export const KITTY_PUSH = `${ESC}[>1u`
/** Kitty keyboard protocol: pop the flags pushed last. */
export const KITTY_POP = `${ESC}[<u`
