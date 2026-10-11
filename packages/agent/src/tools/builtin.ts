/**
 * Built-in tools shared by the reference apps: current date/time, an exact
 * arithmetic calculator, and an HTTP GET page fetcher. Hosts choose which are
 * enabled and which need approval; tools that reach the network require
 * approval by default. Platform needs are injected (fetch, HTML-to-text,
 * clock), so the tools run in a webview and in Node/Bun alike.
 */
import type { FetchLike } from '../client'
import type { AgentTool } from '../types'
import { evaluate } from './calculator'

export type ToolId = 'current_time' | 'calculator' | 'fetch_url'

export interface ToolInfo {
  id: ToolId
  label: string
  description: string
  /** Whether it reaches the network (approval required by default). */
  network: boolean
}

export const TOOL_INFO: readonly ToolInfo[] = [
  {
    id: 'current_time',
    label: 'Date & time',
    description: 'Current date, time and time zone of this device.',
    network: false,
  },
  {
    id: 'calculator',
    label: 'Calculator',
    description: 'Evaluates arithmetic expressions exactly.',
    network: false,
  },
  {
    id: 'fetch_url',
    label: 'Fetch web page',
    description: 'Downloads a web page and returns its text.',
    network: true,
  },
]

/** Maximum characters of page text returned to the model. */
export const FETCH_TEXT_LIMIT = 20_000

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/**
 * Reduce an HTML document to readable text without a DOM: drops script, style
 * and similar elements, turns block boundaries into newlines, strips tags,
 * decodes common entities, and prefixes the title. Hosts with a DOM may pass a
 * parser-based converter instead.
 */
export function stripHtml(html: string): string {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? ''
  const body = html
    .replace(/<(script|style|noscript|svg|template|head)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
      if (entity[0] === '#') {
        const code =
          entity[1] === 'x' || entity[1] === 'X'
            ? Number.parseInt(entity.slice(2), 16)
            : Number(entity.slice(1))
        // Out-of-range code points would throw; keep the source text instead.
        return code <= 0x10ffff ? String.fromCodePoint(code) : match
      }
      return ENTITIES[entity.toLowerCase()] ?? match
    })
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
  return [title, body].filter(Boolean).join('\n\n')
}

/** Platform services the built-in tools use. */
export interface BuiltinToolOptions {
  /** Transport for the fetch tool. */
  fetch: FetchLike
  /** HTML-to-text conversion for fetched pages (default: {@link stripHtml}). */
  htmlToText?: (html: string) => string
  /** Clock for the time tool. */
  now?: () => Date
}

function argsObject(args: unknown): Record<string, unknown> {
  return args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
}

/** Build the enabled tools; `approvals` overrides the per-tool default. */
export function buildTools(
  enabled: Partial<Record<ToolId, boolean>>,
  approvals: Partial<Record<ToolId, boolean>>,
  options: BuiltinToolOptions,
): AgentTool[] {
  const { fetch: fetchImpl, htmlToText = stripHtml, now = () => new Date() } = options
  const all: Record<ToolId, AgentTool> = {
    current_time: {
      name: 'current_time',
      description: 'Get the current date, time and time zone of the user.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => {
        const date = now()
        return {
          iso: date.toISOString(),
          local: date.toLocaleString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }
      },
    },
    calculator: {
      name: 'calculator',
      description:
        'Evaluate an arithmetic expression. Supports + - * / % ^, parentheses, pi, e, and sqrt abs round floor ceil ln log sin cos tan min max.',
      parameters: {
        type: 'object',
        properties: { expression: { type: 'string', description: 'e.g. "(2+3)^2 / 7"' } },
        required: ['expression'],
        additionalProperties: false,
      },
      execute: (args) => {
        const expression = argsObject(args).expression
        if (typeof expression !== 'string') throw new Error('"expression" must be a string')
        return { expression, result: evaluate(expression) }
      },
    },
    fetch_url: {
      name: 'fetch_url',
      description:
        'Fetch a web page or text resource over HTTP(S) GET and return its text content (truncated).',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string', description: 'Absolute http(s) URL' } },
        required: ['url'],
        additionalProperties: false,
      },
      execute: async (args, { signal }) => {
        const url = argsObject(args).url
        if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
          throw new Error('"url" must be an absolute http(s) URL')
        }
        const response = await fetchImpl(url, { method: 'GET', signal })
        const contentType = response.headers.get('content-type') ?? ''
        const raw = await response.text()
        const text = /html/i.test(contentType) ? htmlToText(raw) : raw
        return {
          url,
          status: response.status,
          contentType,
          truncated: text.length > FETCH_TEXT_LIMIT,
          text: text.slice(0, FETCH_TEXT_LIMIT),
        }
      },
    },
  }
  return TOOL_INFO.filter((info) => enabled[info.id]).map((info) => ({
    ...all[info.id],
    requiresApproval: approvals[info.id] ?? info.network,
  }))
}
