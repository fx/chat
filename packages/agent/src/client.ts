/**
 * OpenAI-compatible Chat Completions client.
 *
 * Talks to any endpoint that implements `GET {base}/models` and streaming
 * `POST {base}/chat/completions`. The transport is injectable so hosts can
 * supply a CORS-exempt native fetch (e.g. on mobile); the API key is sent only
 * to the configured base URL and never logged.
 */
import { parseSSE } from './sse'
import { ThinkSplitter } from './think'
import type { ReasoningField, StreamEvent, WireMessage, WireTool } from './types'

/** A `fetch`-compatible function. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/** Client configuration. */
export interface ClientOptions {
  /** Endpoint base, e.g. `https://api.example.com/v1`. Paths are appended to it. */
  baseUrl: string
  /** Optional bearer token. */
  apiKey?: string | undefined
  /** Transport; defaults to the global `fetch`. */
  fetch?: FetchLike | undefined
  /** Extra headers sent with every request. */
  headers?: Record<string, string> | undefined
}

/** A streaming completion request. */
export interface CompletionRequest {
  model: string
  messages: WireMessage[]
  tools?: WireTool[] | undefined
  /** Parse inline `<think>` spans in content as reasoning (default true). */
  thinkTags?: boolean | undefined
  /** Extra body fields merged into the request (e.g. `temperature`). */
  body?: Record<string, unknown> | undefined
  signal?: AbortSignal | undefined
}

/** An error reported by the endpoint or the transport. */
export class AgentError extends Error {
  override name = 'AgentError'
  constructor(
    message: string,
    /** HTTP status, when the error came from a response. */
    readonly status?: number,
  ) {
    super(message)
  }
}

export interface Client {
  /** List model ids offered by the endpoint, sorted. */
  listModels(signal?: AbortSignal): Promise<string[]>
  /** Stream a completion as normalized events. */
  streamCompletion(request: CompletionRequest): AsyncGenerator<StreamEvent>
}

const MAX_ERROR_TEXT = 300

/** Best human-readable message from an error response body. */
async function errorFrom(response: Response): Promise<AgentError> {
  let detail = ''
  const text = await response.text().catch(() => '')
  try {
    const body = JSON.parse(text) as { error?: { message?: unknown } | string; message?: unknown }
    const err = body.error
    const message =
      typeof err === 'string' ? err : typeof err?.message === 'string' ? err.message : body.message
    detail = typeof message === 'string' ? message : text
  } catch {
    detail = text
  }
  detail = detail.trim().slice(0, MAX_ERROR_TEXT)
  const prefix = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`
  return new AgentError(detail ? `${prefix}: ${detail}` : prefix, response.status)
}

interface WireChunk {
  model?: string
  error?: { message?: string } | string
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    cost?: number
  } | null
  choices?: Array<{
    delta?: {
      content?: string | null
      reasoning_content?: string | null
      reasoning?: string | null
      tool_calls?: Array<{
        index?: number
        id?: string
        function?: { name?: string; arguments?: string }
      }>
    }
    finish_reason?: string | null
  }>
}

const REASONING_FIELDS: ReasoningField[] = ['reasoning_content', 'reasoning']

export function createClient(options: ClientOptions): Client {
  const base = options.baseUrl.trim().replace(/\/+$/, '')
  const doFetch: FetchLike = options.fetch ?? ((input, init) => globalThis.fetch(input, init))

  function headers(json: boolean): Record<string, string> {
    return {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      Accept: json ? 'text/event-stream' : 'application/json',
      ...options.headers,
      ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
    }
  }

  async function listModels(signal?: AbortSignal): Promise<string[]> {
    const response = await doFetch(`${base}/models`, {
      method: 'GET',
      headers: headers(false),
      ...(signal ? { signal } : {}),
    })
    if (!response.ok) throw await errorFrom(response)
    const body = (await response.json()) as { data?: Array<{ id?: unknown }> }
    if (!Array.isArray(body.data)) throw new AgentError('Unexpected models response')
    return body.data
      .map((model) => model.id)
      .filter((id): id is string => typeof id === 'string')
      .sort((a, b) => a.localeCompare(b))
  }

  async function post(request: CompletionRequest, includeUsage: boolean): Promise<Response> {
    const body = {
      model: request.model,
      messages: request.messages,
      stream: true,
      ...(includeUsage ? { stream_options: { include_usage: true } } : {}),
      ...(request.tools && request.tools.length > 0 ? { tools: request.tools } : {}),
      ...request.body,
    }
    return doFetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify(body),
      ...(request.signal ? { signal: request.signal } : {}),
    })
  }

  async function* streamCompletion(request: CompletionRequest): AsyncGenerator<StreamEvent> {
    let response = await post(request, true)
    if (!response.ok && (response.status === 400 || response.status === 422)) {
      // Some servers reject `stream_options`; retry once without it.
      const error = await errorFrom(response)
      if (!/stream_options|include_usage/i.test(error.message)) throw error
      response = await post(request, false)
    }
    if (!response.ok) throw await errorFrom(response)
    if (!response.body) throw new AgentError('Response has no body')

    const splitter = request.thinkTags === false ? undefined : new ThinkSplitter()
    let announcedModel = false
    for await (const data of parseSSE(response.body)) {
      if (data === '[DONE]') break
      let chunk: WireChunk
      try {
        chunk = JSON.parse(data) as WireChunk
      } catch {
        throw new AgentError(`Malformed stream chunk: ${data.slice(0, 100)}`)
      }
      if (chunk.error) {
        const message = typeof chunk.error === 'string' ? chunk.error : chunk.error.message
        throw new AgentError(message ?? 'Stream error')
      }
      if (!announcedModel && typeof chunk.model === 'string' && chunk.model) {
        announcedModel = true
        yield { type: 'model', model: chunk.model }
      }
      const choice = chunk.choices?.[0]
      const delta = choice?.delta
      if (delta) {
        for (const field of REASONING_FIELDS) {
          const text = delta[field]
          if (typeof text === 'string' && text) yield { type: 'reasoning', text, field }
        }
        if (typeof delta.content === 'string' && delta.content) {
          if (splitter) {
            for (const piece of splitter.push(delta.content)) yield toEvent(piece)
          } else {
            yield { type: 'text', text: delta.content }
          }
        }
        for (const [position, call] of (delta.tool_calls ?? []).entries()) {
          yield {
            type: 'tool_call',
            index: call.index ?? position,
            ...(call.id ? { id: call.id } : {}),
            ...(call.function?.name ? { name: call.function.name } : {}),
            ...(typeof call.function?.arguments === 'string'
              ? { arguments: call.function.arguments }
              : {}),
          }
        }
      }
      if (chunk.usage) {
        yield {
          type: 'usage',
          usage: {
            ...(chunk.usage.prompt_tokens !== undefined
              ? { prompt: chunk.usage.prompt_tokens }
              : {}),
            ...(chunk.usage.completion_tokens !== undefined
              ? { completion: chunk.usage.completion_tokens }
              : {}),
            ...(chunk.usage.total_tokens !== undefined ? { total: chunk.usage.total_tokens } : {}),
            ...(typeof chunk.usage.cost === 'number' ? { cost: chunk.usage.cost } : {}),
          },
        }
      }
      if (choice?.finish_reason) yield { type: 'finish', reason: choice.finish_reason }
    }
    if (splitter) for (const piece of splitter.flush()) yield toEvent(piece)
  }

  return { listModels, streamCompletion }
}

function toEvent(piece: { kind: 'text' | 'reasoning'; text: string }): StreamEvent {
  return piece.kind === 'text'
    ? { type: 'text', text: piece.text }
    : { type: 'reasoning', text: piece.text }
}
