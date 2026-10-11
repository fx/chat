/**
 * Content must never drive the terminal. Model output, tool output, titles
 * and other host- or model-provided strings may carry escape sequences (an
 * OSC 52 clipboard write, an OSC 8 link, SGR colours, cursor moves) that Ink
 * would pass straight through. Everything this package draws is cleaned
 * here first; its own styling travels as Ink props, never as escapes in text.
 *
 * Removed: whole ESC/C1 sequences — CSI, OSC, DCS, SOS, PM, APC (a string
 * command up to its terminator: BEL, `ESC \` or ST), and any other ESC
 * sequence — then every remaining C0 control but `\n` and `\t` (so `\r` and
 * BEL go), DEL, and the C1 controls U+0080–U+009F. An unterminated string
 * command loses its introducer only: the rest is plain text once no control
 * can read it, and the scan stays linear.
 */

// The ESC and C1 code units every pattern is built from.
const ESC = '\\u001B'
const BEL = '\\u0007'
const ST = '\\u009C'
// String-command introducers: ESC P/]/X/^/_ and their C1 forms (DCS, SOS, OSC, PM, APC).
const STRING_START = `(?:${ESC}[P\\]X^_]|[\\u0090\\u0098\\u009D-\\u009F])`
// A string command's body stops at any terminator or introducer, never spanning one.
const STRING_BODY = `[^${BEL}${ESC}\\u0090\\u0098\\u009C-\\u009F]*`
const STRING_END = `(?:${BEL}|${ESC}\\\\|${ST})`
const CSI = `(?:${ESC}\\[|\\u009B)[\\u0030-\\u003F]*[\\u0020-\\u002F]*[\\u0040-\\u007E]`
const OTHER_ESC = `${ESC}[\\u0020-\\u002F]*[\\u0030-\\u007E]`
const CONTROL = '[\\u0000-\\u0008\\u000B-\\u001F\\u007F-\\u009F]'

const SEQUENCES = new RegExp(
  `${STRING_START}${STRING_BODY}${STRING_END}|${CSI}|${OTHER_ESC}|${CONTROL}`,
  'g',
)
const HAS_CONTROL = new RegExp(CONTROL)

/** `text` without terminal control sequences or control characters (bar `\n` and `\t`). */
export function stripControls(text: string): string {
  return HAS_CONTROL.test(text) ? text.replace(SEQUENCES, '') : text
}

const isPlain = (value: object): boolean => {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

const CONTROLS = new RegExp(CONTROL, 'g')

/** `key` with each control character spelled as visible `\uXXXX` text. */
const escapeControls = (key: string): string =>
  key.replace(CONTROLS, (c) => `\\u${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`)

/**
 * Clean keys for `keys`, one per key, all distinct. A clean key keeps its
 * name; a dirty one takes its stripped form unless that is taken, then its
 * visibly escaped form, then that with ` (2)`, ` (3)`… — so no value is ever
 * dropped by two keys cleaning to the same name.
 */
const cleanKeys = (keys: string[]): string[] => {
  const taken = new Set(keys.filter((key) => stripControls(key) === key))
  return keys.map((key) => {
    if (stripControls(key) === key) return key
    let name = stripControls(key)
    if (taken.has(name)) name = escapeControls(key)
    const base = name
    for (let n = 2; taken.has(name); n++) name = `${base} (${n})`
    taken.add(name)
    return name
  })
}

/**
 * `value` with `stripControls` applied to every string in it (object keys
 * included), through arrays and plain objects; other objects (Map, Set,
 * Date, class instances) pass through as they are. Anything unchanged keeps
 * its identity, so clean content costs a scan and no copies. Keys that clean
 * to the same name all survive (see `cleanKeys`); a `__proto__` key stays an
 * own property, never a prototype; a cycle is left as it is where it closes.
 */
export function stripControlsDeep<T>(value: T): T {
  return deep(value, new Set()) as T
}

function deep(value: unknown, path: Set<object>): unknown {
  if (typeof value === 'string') return stripControls(value)
  if (value === null || typeof value !== 'object' || path.has(value)) return value
  if (!Array.isArray(value) && !isPlain(value)) return value
  path.add(value)
  try {
    if (Array.isArray(value)) {
      let out: unknown[] | undefined
      value.forEach((item, i) => {
        const next = deep(item, path)
        if (next !== item) {
          out ??= value.slice()
          out[i] = next
        }
      })
      return out ?? value
    }
    const entries = Object.entries(value)
    const keys = cleanKeys(entries.map(([key]) => key))
    let changed = false
    const values = entries.map(([key, item], i) => {
      const next = deep(item, path)
      if (next !== item || keys[i] !== key) changed = true
      return next
    })
    if (!changed) return value
    // `fromEntries` defines own data properties, so `__proto__` stays a key.
    return Object.fromEntries(keys.map((key, i) => [key, values[i]]))
  } finally {
    path.delete(value)
  }
}
