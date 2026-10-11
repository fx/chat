/**
 * Tool-call display helpers shared by every renderer: the label (title over
 * name), a one-line input summary that never repeats the label, and the text a
 * renderer lays out (and copies) as the tool's output.
 *
 * Pure: no React, no DOM.
 */
import { toJsonSafe } from '../model/codec'
import type { ToolCallBlock } from '../model/types'

/** The keys whose first non-empty string value best says what a call acts on. */
const INPUT_KEYS = [
  'command',
  'file_path',
  'path',
  'pattern',
  'url',
  'query',
  'prompt',
  'description',
]

const collapse = (text: string) => text.replace(/\s+/g, ' ').trim()

function cut(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1))}…` : text
}

/** The row label for a tool call: its non-blank `title` (trimmed), else its `name`. */
export function toolLabel(block: Pick<ToolCallBlock, 'name' | 'title'>): string {
  const title = typeof block.title === 'string' ? block.title.trim() : ''
  return title || block.name
}

/**
 * Summarize tool arguments as one line: a string argument as is; else the
 * first non-empty string among well-known keys; else compact JSON of a
 * non-empty object. Whitespace is collapsed and the result cut to `maxLength`
 * with `…`. `undefined` when there is nothing to say.
 */
export function summarizeToolInput(args: unknown, maxLength = 300): string | undefined {
  if (typeof args === 'string') {
    const text = collapse(args)
    return text ? cut(text, maxLength) : undefined
  }
  if (!args || typeof args !== 'object') return undefined
  const record = args as Record<string, unknown>
  for (const key of INPUT_KEYS) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return cut(collapse(value), maxLength)
  }
  if (Array.isArray(args) ? args.length === 0 : Object.keys(record).length === 0) return undefined
  return cut(collapse(JSON.stringify(toJsonSafe(args))), maxLength)
}

/**
 * The input a tool row shows beside its label: `inputSummary`, else a summary
 * of `arguments` — either way one line, cut to `maxLength` with `…` — or
 * `undefined` when the label already contains it, so a row never says the
 * same thing twice.
 */
export function toolDisplayInput(block: ToolCallBlock, maxLength = 300): string | undefined {
  const input =
    typeof block.inputSummary === 'string' && block.inputSummary.trim()
      ? cut(collapse(block.inputSummary), maxLength)
      : summarizeToolInput(block.arguments, maxLength)
  if (!input) return undefined
  return toolLabel(block).includes(input) ? undefined : input
}

/**
 * A tool call in one line, as its row reads: the label, then the input when it
 * adds something (`Running sleep 2 && echo hi`).
 */
export function toolHeadline(block: ToolCallBlock): string {
  const input = toolDisplayInput(block)
  return input ? `${toolLabel(block)} ${input}` : toolLabel(block)
}

/**
 * The tool's output as text: a string as is, `''` when absent, otherwise
 * two-space-indented JSON (made JSON-safe first).
 */
export function toolResultText(result: unknown): string {
  if (typeof result === 'string') return result
  if (result === undefined) return ''
  return JSON.stringify(toJsonSafe(result), null, 2) as string
}
