/**
 * Terminal protocol helpers shared by the composer and the viewport.
 */

const ESC = String.fromCharCode(27)

const TERMINAL_REPORT = new RegExp(
  `^(?:${ESC})?\\[(?:<\\d+;\\d+;\\d+[Mm]|\\d+;\\d+;\\d+t|\\?[\\d;]*[a-zA-Z])`,
)

/** Mouse reports and terminal replies arrive as input; key handlers ignore them. */
export function isTerminalReport(input: string): boolean {
  return TERMINAL_REPORT.test(input)
}

/** Kitty keyboard protocol: push the disambiguate flag (Shift+Enter is then reported). */
export const KITTY_PUSH = `${ESC}[>1u`
/** Kitty keyboard protocol: pop the flags pushed last. */
export const KITTY_POP = `${ESC}[<u`
