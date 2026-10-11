/**
 * `@fx/chat-core/json` — tolerant JSON for laying out tool output.
 *
 * Tool output is often JSON, often JSON inside a string (a tool's
 * `content[].text`), and often a capped preview cut off mid-value. These
 * helpers detect it, parse it without ever throwing, and lay it out as rows a
 * renderer can draw and fold. Pure and dependency-free.
 */

/** A parsed (possibly unfinished) JSON value. */
export type JsonNode =
  | { t: 'obj'; entries: Array<[string, JsonNode]>; closed: boolean }
  | { t: 'arr'; items: JsonNode[]; closed: boolean }
  | { t: 'str'; v: string; closed: boolean }
  /** A number, `true`/`false`/`null`, or a non-JSON token as written. */
  | { t: 'lit'; v: string }

/**
 * True for an object, or an array whose first member starts like a JSON
 * value — so a bracketed log prefix such as `[glob] 0 matches` is not JSON.
 */
export function looksLikeJson(text: string): boolean {
  const trimmed = text.trimStart()
  if (trimmed.startsWith('{')) return true
  if (!trimmed.startsWith('[')) return false
  const next = trimmed.slice(1).trimStart()[0]
  return next !== undefined && /[[{"\-\d\]tfn]/.test(next)
}

const LITERAL = /^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/

export interface LooseJsonOptions {
  /** How many levels of JSON-in-a-string to unwrap (default 4). */
  maxUnwrap?: number
}

/**
 * Parse as much JSON as `text` holds. Never throws: unfinished strings,
 * objects and arrays end with `closed: false`; text after the value is
 * returned as `rest`; string values that are themselves an object or array are
 * unwrapped in place (up to `maxUnwrap` levels).
 */
export function parseLooseJson(
  text: string,
  options: LooseJsonOptions = {},
): { node: JsonNode; rest: string } {
  const maxUnwrap = options.maxUnwrap ?? 4
  let pos = 0
  const ws = () => {
    while (pos < text.length && /\s/.test(text[pos] as string)) pos++
  }

  const parseString = (): JsonNode => {
    pos++ // opening quote
    let value = ''
    while (pos < text.length) {
      const ch = text[pos] as string
      if (ch === '"') {
        pos++
        return { t: 'str', v: value, closed: true }
      }
      if (ch === '\\') {
        const esc = text[pos + 1]
        if (esc === undefined) {
          pos++
          break
        }
        if (esc === 'u') {
          const hex = text.slice(pos + 2, pos + 6)
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            value += String.fromCharCode(Number.parseInt(hex, 16))
            pos += 6
            continue
          }
          pos = text.length
          break
        }
        const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' }
        value += map[esc] ?? esc
        pos += 2
        continue
      }
      value += ch
      pos++
    }
    return { t: 'str', v: value, closed: false }
  }

  const parseValue = (): JsonNode | undefined => {
    ws()
    const ch = text[pos]
    if (ch === undefined) return undefined
    if (ch === '{') {
      pos++
      const entries: Array<[string, JsonNode]> = []
      for (;;) {
        ws()
        if (pos >= text.length) return { t: 'obj', entries, closed: false }
        if (text[pos] === '}') {
          pos++
          return { t: 'obj', entries, closed: true }
        }
        if (text[pos] === ',') {
          pos++
          continue
        }
        if (text[pos] !== '"') {
          // Not a key: treat the remainder of the object as unreadable.
          return { t: 'obj', entries, closed: false }
        }
        const key = parseString() as Extract<JsonNode, { t: 'str' }>
        ws()
        if (!key.closed || text[pos] !== ':') return { t: 'obj', entries, closed: false }
        pos++
        const value = parseValue()
        if (value === undefined) return { t: 'obj', entries, closed: false }
        entries.push([key.v, value])
        if (isOpen(value)) return { t: 'obj', entries, closed: false }
      }
    }
    if (ch === '[') {
      pos++
      const items: JsonNode[] = []
      for (;;) {
        ws()
        if (pos >= text.length) return { t: 'arr', items, closed: false }
        if (text[pos] === ']') {
          pos++
          return { t: 'arr', items, closed: true }
        }
        if (text[pos] === ',') {
          pos++
          continue
        }
        const value = parseValue() as JsonNode
        items.push(value)
        if (isOpen(value)) return { t: 'arr', items, closed: false }
      }
    }
    if (ch === '"') return parseString()
    const literal = LITERAL.exec(text.slice(pos))
    if (literal) {
      pos += (literal[1] as string).length
      return { t: 'lit', v: literal[1] as string }
    }
    // A token that is not JSON: keep it as written, up to the next delimiter.
    const start = pos
    while (pos < text.length && !/[,\]}\s]/.test(text[pos] as string)) pos++
    return { t: 'lit', v: text.slice(start, pos) }
  }

  ws()
  const node = parseValue() ?? { t: 'lit', v: '' }
  const rest = text.slice(pos).replace(/^\s+/, '')
  return { node: unwrap(node, maxUnwrap), rest }
}

function isOpen(node: JsonNode): boolean {
  return node.t !== 'lit' && !node.closed
}

/** Replace string values that hold an object or array with the parsed value. */
function unwrap(node: JsonNode, depth: number): JsonNode {
  if (node.t === 'obj') {
    return { ...node, entries: node.entries.map(([k, v]) => [k, unwrap(v, depth)]) }
  }
  if (node.t === 'arr') return { ...node, items: node.items.map((v) => unwrap(v, depth)) }
  if (node.t === 'str' && node.closed && depth > 0 && looksLikeJson(node.v)) {
    const inner = parseLooseJson(node.v, { maxUnwrap: 0 })
    if (inner.rest === '' && !isOpen(inner.node) && inner.node.t !== 'lit') {
      return unwrap(inner.node, depth - 1)
    }
  }
  return node
}

/** One laid-out row. */
export interface JsonRow {
  depth: number
  /** The row's text without indentation. */
  text: string
  /** Present on a foldable member: its path, whether it is open, and a size label. */
  toggle?: { path: string; open: boolean; size: string }
}

export interface JsonLayoutOptions {
  /** Cut string values longer than this with `…` (default: no cut). */
  maxString?: number
  /** Whether the array member at `path` is folded (default: none). */
  collapsed?: (path: string) => boolean
}

const quote = (s: string) => JSON.stringify(s)
const keyPath = (path: string, key: string) =>
  /^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${quote(key)}]`

function cutString(value: string, max: number | undefined): string {
  return max !== undefined && value.length > max ? `${value.slice(0, max)}…` : value
}

function sizeLabel(node: Extract<JsonNode, { t: 'obj' | 'arr' }>): string {
  const n = node.t === 'obj' ? node.entries.length : node.items.length
  const unit = node.t === 'obj' ? 'key' : 'item'
  return `${n} ${unit}${n === 1 ? '' : 's'}`
}

/** A one-line preview of a folded member, strings cut to 24 characters. */
function preview(node: JsonNode, top = true): string {
  switch (node.t) {
    case 'lit':
      return node.v
    case 'str':
      return `${quote(cutString(node.v, 24))}`
    case 'arr':
      return top ? `[${node.items.map((v) => preview(v, false)).join(', ')}]` : '[…]'
    case 'obj':
      return top
        ? `{${node.entries.map(([k, v]) => `${quote(k)}: ${preview(v, false)}`).join(', ')}}`
        : '{…}'
  }
}

/**
 * Lay out a value as rows: two-space indentation per `depth`, `"key": value`
 * members, commas between members. Object and array members of an array fold
 * to a one-line preview (with a toggle and size label) when `collapsed` says
 * so. Unfinished input ends with one `…` row at the innermost open level.
 */
export function layoutJson(node: JsonNode, options: JsonLayoutOptions = {}): JsonRow[] {
  const rows: JsonRow[] = []
  const scalar = (value: Extract<JsonNode, { t: 'lit' | 'str' }>): string => {
    if (value.t === 'lit') return value.v
    const text = quote(cutString(value.v, options.maxString))
    return value.closed ? text : `${text.slice(0, -1)}…`
  }

  /** Emit `value`; `lead` prefixes its first row; `comma` follows its last. */
  const emit = (
    value: JsonNode,
    depth: number,
    path: string,
    lead: string,
    comma: string,
    foldable: boolean,
  ): void => {
    if (value.t === 'lit' || value.t === 'str') {
      rows.push({ depth, text: `${lead}${scalar(value)}${comma}` })
      return
    }
    const toggle = foldable
      ? { path, open: !(options.collapsed?.(path) ?? false), size: sizeLabel(value) }
      : undefined
    if (toggle && !toggle.open) {
      rows.push({ depth, text: `${lead}${preview(value)}${comma}`, toggle })
      return
    }
    const [open, close] = value.t === 'obj' ? ['{', '}'] : ['[', ']']
    rows.push({ depth, text: `${lead}${open}`, ...(toggle ? { toggle } : {}) })
    const members =
      value.t === 'obj'
        ? value.entries.map(([k, v]) => ({ v, lead: `${quote(k)}: `, path: keyPath(path, k) }))
        : value.items.map((v, i) => ({ v, lead: '', path: `${path}[${i}]` }))
    members.forEach((member, i) => {
      const last = i === members.length - 1
      emit(member.v, depth + 1, member.path, member.lead, last ? '' : ',', value.t === 'arr')
    })
    if (value.closed) {
      rows.push({ depth, text: `${close}${comma}` })
    } else {
      const tail = members[members.length - 1]
      const innermost = !tail || !isOpen(tail.v)
      if (innermost) rows.push({ depth: depth + 1, text: '…' })
    }
  }

  emit(node, 0, '$', '', '', false)
  return rows
}

/** The whole value, open and uncut, as indented lines (what a copy copies). */
export function prettyJson(text: string): string[] {
  const { node, rest } = parseLooseJson(text)
  const lines = layoutJson(node).map((row) => `${'  '.repeat(row.depth)}${row.text}`)
  return rest ? [...lines, ...rest.split('\n')] : lines
}
