/**
 * OpenAI-compatible Chat Completions client.
 *
 * Talks to any endpoint that implements `GET {base}/models` and streaming
 * `POST {base}/chat/completions`. The transport is injectable so hosts can
 * supply a CORS-exempt native fetch (e.g. on mobile); the API key is sent only
 * to the configured base URL and never logged. Redirects from the endpoint are
 * never followed, so the key cannot reach another URL.
 */
import { flattenToolHistory } from './encode'
import { redirectOf } from './redirect'
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

/**
 * A model the endpoint lists, with what it declares about itself. Beyond the
 * OpenAI fields (`id`, `owned_by`, `created`), the rest follow the
 * OpenRouter listing convention that many gateways share; each is present
 * only when the endpoint gives it.
 */
export interface ModelInfo {
  id: string
  /** A display name. */
  name?: string
  /** Who owns or serves it (`owned_by`). */
  ownedBy?: string
  /** When it was added, in Unix seconds. */
  created?: number
  /** Its context window, in tokens (`context_length`). */
  contextLength?: number
  /** What it takes as input, e.g. `text`, `image` (`architecture.input_modalities`). */
  inputModalities?: readonly string[]
  /**
   * The request parameters the model takes, when the endpoint says (the
   * OpenRouter `supported_parameters` convention). Without `tools`, the
   * client sends the model no tools.
   */
  supportedParameters?: readonly string[]
}

export interface Client {
  /** List model ids offered by the endpoint, sorted. */
  listModels(signal?: AbortSignal): Promise<string[]>
  /** List the endpoint's models with what they declare about themselves, sorted by id. */
  listModelInfo(signal?: AbortSignal): Promise<ModelInfo[]>
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

const UNSERIALIZABLE_REQUEST =
  'The request could not be serialized as JSON: the extra request body fields or a tool parameter schema contain a value JSON cannot represent (such as a BigInt or a circular reference).'

/** `value` when it is a number, else `undefined` (stream fields are endpoint-controlled). */
function numberOr(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

/** `value` when it is a non-empty string, else `undefined`. */
function textOr(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

const REASONING_FIELDS: ReasoningField[] = ['reasoning_content', 'reasoning']

/** An error message blaming the request's tools (or tool calling in general). */
const TOOLS_REJECTED = /\btools?\b|tool[_ ]choice|function[_ ]call/i

/**
 * Endpoint + model pairs that rejected client tools, shared by every client:
 * whether a model takes tools is the endpoint's property, not the client's.
 */
const toolless = new Set<string>()
/** Model listings per endpoint and key, fetched once and shared by every client. */
const catalogs = new Map<string, Promise<ModelInfo[]>>()
const CACHE_LIMIT = 256

/** Start a process-wide cache over when it is full. */
function bound(cache: { size: number; clear(): void }) {
  if (cache.size >= CACHE_LIMIT) cache.clear()
}

function remember(key: string, models: Promise<ModelInfo[]>) {
  bound(catalogs)
  catalogs.set(key, models)
}

/** A model as an endpoint lists it; any field may be missing or mistyped. */
interface RawModel {
  id?: unknown
  name?: unknown
  owned_by?: unknown
  created?: unknown
  context_length?: unknown
  architecture?: { input_modalities?: unknown } | null
  supported_parameters?: unknown
}

const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined)
const count = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
const texts = (value: unknown) =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : undefined

/** Keep the fields a listing gives with the expected types; drop the rest. */
function modelInfo(raw: RawModel, id: string): ModelInfo {
  const fields: { [K in keyof Omit<ModelInfo, 'id'>]-?: ModelInfo[K] | undefined } = {
    name: text(raw.name),
    ownedBy: text(raw.owned_by),
    created: count(raw.created),
    contextLength: count(raw.context_length),
    inputModalities: texts(raw.architecture?.input_modalities),
    supportedParameters: texts(raw.supported_parameters),
  }
  const info: ModelInfo = { id }
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) Object.assign(info, { [key]: value })
  }
  return info
}

export function createClient(options: ClientOptions): Client {
  const base = options.baseUrl.trim().replace(/\/+$/, '')
  const doFetch: FetchLike = options.fetch ?? ((input, init) => globalThis.fetch(input, init))

  const catalogKey = `${base}\n${options.apiKey ?? ''}`

  function headers(json: boolean): Record<string, string> {
    return {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      Accept: json ? 'text/event-stream' : 'application/json',
      ...options.headers,
      ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
    }
  }

  /**
   * Request `url` without following redirects: a redirect would carry the key
   * to a URL other than the configured base, so it is an error instead.
   */
  async function send(url: string, init: RequestInit): Promise<Response> {
    const response = await doFetch(url, { ...init, redirect: 'manual' })
    const redirect = redirectOf(response, url)
    if (redirect) {
      const target = redirect.target ?? 'an unknown location'
      throw new AgentError(
        `The endpoint redirects to ${target}. Redirects are not followed so the API key stays on the configured endpoint; set the redirect target as the base URL directly.`,
        response.status >= 300 && response.status < 400 ? response.status : undefined,
      )
    }
    return response
  }

  async function listModelInfo(signal?: AbortSignal): Promise<ModelInfo[]> {
    const response = await send(`${base}/models`, {
      method: 'GET',
      headers: headers(false),
      ...(signal ? { signal } : {}),
    })
    if (!response.ok) throw await errorFrom(response)
    // The body is the endpoint's: anything but `{ data: [...] }` is unexpected.
    const body = (await response.json().catch(() => undefined)) as
      | { data?: Array<RawModel | null> }
      | null
      | undefined
    if (!Array.isArray(body?.data)) throw new AgentError('Unexpected models response')
    const models: ModelInfo[] = []
    for (const model of body.data) {
      if (typeof model?.id === 'string') models.push(modelInfo(model, model.id))
    }
    models.sort((a, b) => a.id.localeCompare(b.id))
    remember(catalogKey, Promise.resolve(models))
    return models
  }

  async function listModels(signal?: AbortSignal): Promise<string[]> {
    return (await listModelInfo(signal)).map((model) => model.id)
  }

  /**
   * Whether `model` takes tools by the endpoint's own account: false or true
   * when its listing says, undefined when it does not (or cannot be listed).
   * The listing is fetched once per endpoint and key, and only when needed.
   */
  async function declaresTools(model: string, signal?: AbortSignal): Promise<boolean | undefined> {
    let models = catalogs.get(catalogKey)
    if (!models) {
      models = listModelInfo(signal).catch(() => {
        // An aborted listing says nothing about the endpoint: try again next time.
        if (signal?.aborted) catalogs.delete(catalogKey)
        return []
      })
      remember(catalogKey, models)
    }
    const params = (await models).find((m) => m.id === model)?.supportedParameters
    return params ? params.includes('tools') : undefined
  }

  async function post(
    request: CompletionRequest,
    includeUsage: boolean,
    includeTools: boolean,
  ): Promise<Response> {
    const body = {
      model: request.model,
      messages: includeTools ? request.messages : flattenToolHistory(request.messages),
      stream: true,
      ...(includeUsage ? { stream_options: { include_usage: true } } : {}),
      ...(includeTools && request.tools?.length ? { tools: request.tools } : {}),
      ...request.body,
    }
    // `request.body` and the tool schemas are host values: one with no JSON
    // form (a BigInt, a cycle, a throwing or empty `toJSON`) is reported as an
    // error rather than thrown raw or sent rewritten.
    let payload: string | undefined
    try {
      payload = JSON.stringify(body)
    } catch {
      payload = undefined
    }
    if (typeof payload !== 'string') throw new AgentError(UNSERIALIZABLE_REQUEST)
    return send(`${base}/chat/completions`, {
      method: 'POST',
      headers: headers(true),
      body: payload,
      ...(request.signal ? { signal: request.signal } : {}),
    })
  }

  async function* streamCompletion(request: CompletionRequest): AsyncGenerator<StreamEvent> {
    const toolKey = `${base}\n${request.model}`
    // `tools` covers the tool history too: without tools, it is sent as text.
    let tools =
      Boolean(request.tools?.length) ||
      request.messages.some(
        (m) => m.role === 'tool' || (m.role === 'assistant' && m.tool_calls?.length),
      )
    if (
      tools &&
      (toolless.has(toolKey) || (await declaresTools(request.model, request.signal)) === false)
    )
      tools = false
    let usage = true
    let response = await post(request, usage, tools)
    // Some servers reject `stream_options`, and some models (or ingresses) take
    // no client tools though their listing does not say so: retry without the
    // rejected feature, each at most once. A model that rejected tools is
    // remembered, so later turns skip them.
    while (!response.ok && (response.status === 400 || response.status === 422)) {
      const error = await errorFrom(response)
      if (usage && /stream_options|include_usage/i.test(error.message)) usage = false
      else if (tools && TOOLS_REJECTED.test(error.message)) {
        tools = false
        bound(toolless)
        toolless.add(toolKey)
      } else throw error
      response = await post(request, usage, tools)
    }
    if (!response.ok) throw await errorFrom(response)
    if (!response.body) throw new AgentError('Response has no body')

    const splitter = request.thinkTags === false ? undefined : new ThinkSplitter()
    let announcedModel = false
    for await (const data of parseSSE(response.body)) {
      if (data === '[DONE]') break
      // Every field below is endpoint-controlled: types are checked, never trusted.
      let chunk: WireChunk | null = null
      try {
        chunk = JSON.parse(data) as WireChunk | null
      } catch {
        // Reported below.
      }
      if (chunk === null || typeof chunk !== 'object') {
        throw new AgentError(`Malformed stream chunk: ${data.slice(0, 100)}`)
      }
      if (chunk.error) {
        const message = typeof chunk.error === 'string' ? chunk.error : textOr(chunk.error.message)
        throw new AgentError(message || 'Stream error')
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
        const calls = Array.isArray(delta.tool_calls) ? delta.tool_calls : []
        for (const [position, call] of calls.entries()) {
          if (call === null || typeof call !== 'object') continue
          const id = textOr(call.id)
          const name = textOr(call.function?.name)
          yield {
            type: 'tool_call',
            index: Number.isInteger(call.index) ? (call.index as number) : position,
            ...(id ? { id } : {}),
            ...(name ? { name } : {}),
            ...(typeof call.function?.arguments === 'string'
              ? { arguments: call.function.arguments }
              : {}),
          }
        }
      }
      if (chunk.usage) {
        const prompt = numberOr(chunk.usage.prompt_tokens)
        const completion = numberOr(chunk.usage.completion_tokens)
        const total = numberOr(chunk.usage.total_tokens)
        const cost = numberOr(chunk.usage.cost)
        yield {
          type: 'usage',
          usage: {
            ...(prompt !== undefined ? { prompt } : {}),
            ...(completion !== undefined ? { completion } : {}),
            ...(total !== undefined ? { total } : {}),
            ...(cost !== undefined ? { cost } : {}),
          },
        }
      }
      const reason = textOr(choice?.finish_reason)
      if (reason) yield { type: 'finish', reason }
    }
    if (splitter) for (const piece of splitter.flush()) yield toEvent(piece)
  }

  return { listModels, listModelInfo, streamCompletion }
}

function toEvent(piece: { kind: 'text' | 'reasoning'; text: string }): StreamEvent {
  return piece.kind === 'text'
    ? { type: 'text', text: piece.text }
    : { type: 'reasoning', text: piece.text }
}
