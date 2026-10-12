// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { AgentError, type CompletionRequest, type FetchLike, createClient } from './client'
import { delta, sse, sseResponse } from './test-helpers'
import type { StreamEvent } from './types'

function fakeFetch(...responses: Response[]) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fn: FetchLike = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} })
    const next = responses.shift()
    if (!next) throw new Error('no response queued')
    return next
  })
  return { fn, calls }
}

async function events(
  body: string,
  request: Partial<CompletionRequest> = {},
  splitEvery?: number,
): Promise<StreamEvent[]> {
  const { fn } = fakeFetch(sseResponse(body, splitEvery))
  const client = createClient({ baseUrl: 'https://api.test/v1', fetch: fn })
  const out: StreamEvent[] = []
  for await (const e of client.streamCompletion({ model: 'm', messages: [], ...request }))
    out.push(e)
  return out
}

const json = (body: unknown, status = 200, statusText = '') =>
  new Response(JSON.stringify(body), { status, statusText })

describe('createClient().listModels', () => {
  it('GETs {base}/models with the bearer key and returns sorted ids', async () => {
    const { fn, calls } = fakeFetch(json({ data: [{ id: 'b' }, { id: 'a' }, { id: 3 }, {}] }))
    const client = createClient({
      baseUrl: ' https://api.test/v1/ ',
      apiKey: 'sk-test',
      headers: { 'X-Extra': '1' },
      fetch: fn,
    })
    const signal = new AbortController().signal
    expect(await client.listModels(signal)).toEqual(['a', 'b'])
    expect(calls[0]?.url).toBe('https://api.test/v1/models')
    expect(calls[0]?.init.signal).toBe(signal)
    expect(calls[0]?.init.headers).toEqual({
      Accept: 'application/json',
      'X-Extra': '1',
      Authorization: 'Bearer sk-test',
    })
  })

  it('omits the auth header without a key and the signal when none is given', async () => {
    const { fn, calls } = fakeFetch(json({ data: [] }))
    await createClient({ baseUrl: 'http://x', fetch: fn }).listModels()
    expect(calls[0]?.init.headers).toEqual({ Accept: 'application/json' })
    expect('signal' in (calls[0]?.init ?? {})).toBe(false)
  })

  it('throws on an unexpected body', async () => {
    const { fn } = fakeFetch(json({ models: [] }))
    await expect(createClient({ baseUrl: 'http://x', fetch: fn }).listModels()).rejects.toThrow(
      'Unexpected models response',
    )
  })

  it.each([
    [
      json({ error: { message: 'bad key' } }, 401, 'Unauthorized'),
      'HTTP 401 Unauthorized: bad key',
      401,
    ],
    [json({ error: 'plain' }, 500), 'HTTP 500: plain', 500],
    [json({ message: 'top' }, 404), 'HTTP 404: top', 404],
    [json({ error: { code: 1 } }, 400), 'HTTP 400: {"error":{"code":1}}', 400],
    [new Response('not json', { status: 502 }), 'HTTP 502: not json', 502],
    [new Response('', { status: 503 }), 'HTTP 503', 503],
  ])('surfaces HTTP errors (%#)', async (response, message, status) => {
    const { fn } = fakeFetch(response)
    const error = await createClient({ baseUrl: 'http://x', fetch: fn })
      .listModels()
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AgentError)
    expect((error as AgentError).message).toBe(message)
    expect((error as AgentError).status).toBe(status)
  })

  it('treats an unreadable error body as empty', async () => {
    const response = new Response('x', { status: 500 })
    vi.spyOn(response, 'text').mockRejectedValue(new Error('gone'))
    const { fn } = fakeFetch(response)
    await expect(createClient({ baseUrl: 'http://x', fetch: fn }).listModels()).rejects.toThrow(
      /^HTTP 500$/,
    )
  })

  it('defaults to the global fetch', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ data: [{ id: 'g' }] }))
    expect(await createClient({ baseUrl: 'http://x' }).listModels()).toEqual(['g'])
    spy.mockRestore()
  })
})

describe('createClient().streamCompletion', () => {
  it('POSTs a streaming request with usage, tools and extra body fields', async () => {
    const { fn, calls: all } = fakeFetch(json({ data: [{ id: 'm' }] }), sseResponse(sse([])))
    const client = createClient({ baseUrl: 'https://api.test/v1', apiKey: 'k', fetch: fn })
    const signal = new AbortController().signal
    const tools = [
      { type: 'function' as const, function: { name: 't', description: 'd', parameters: {} } },
    ]
    for await (const _ of client.streamCompletion({
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      tools,
      body: { temperature: 0 },
      signal,
    })) {
      // drain
    }
    expect(all[0]?.url).toBe('https://api.test/v1/models')
    const calls = all.slice(1)
    expect(calls[0]?.url).toBe('https://api.test/v1/chat/completions')
    expect(calls[0]?.init.method).toBe('POST')
    expect(calls[0]?.init.signal).toBe(signal)
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe('Bearer k')
    expect((calls[0]?.init.headers as Record<string, string>).Accept).toBe('text/event-stream')
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
      stream_options: { include_usage: true },
      tools,
      temperature: 0,
    })
  })

  it('omits an empty tools list', async () => {
    const { fn, calls } = fakeFetch(sseResponse(sse([])))
    const client = createClient({ baseUrl: 'http://x', fetch: fn })
    for await (const _ of client.streamCompletion({ model: 'm', messages: [], tools: [] })) {
      // drain
    }
    expect(JSON.parse(calls[0]?.init.body as string)).not.toHaveProperty('tools')
    expect('signal' in (calls[0]?.init ?? {})).toBe(false)
  })

  it('normalizes content, both reasoning fields, usage, finish and the model once', async () => {
    const body = sse([
      delta({ role: 'assistant', reasoning_content: 'r1' }),
      delta({ reasoning: 'r2', content: null }),
      delta({ content: 'Hi' }),
      delta({ content: '' }, 'stop'),
      {
        model: 'm-1',
        choices: [],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      },
      { choices: [], usage: { completion_tokens: 1 } },
      { choices: [], usage: { total_tokens: 4, cost: 0.5 } },
      { choices: [], usage: null },
    ])
    expect(await events(body, {}, 7)).toEqual([
      { type: 'model', model: 'm-1' },
      { type: 'reasoning', text: 'r1', field: 'reasoning_content' },
      { type: 'reasoning', text: 'r2', field: 'reasoning' },
      { type: 'text', text: 'Hi' },
      { type: 'finish', reason: 'stop' },
      { type: 'usage', usage: { prompt: 3, completion: 2, total: 5 } },
      { type: 'usage', usage: { completion: 1 } },
      { type: 'usage', usage: { total: 4, cost: 0.5 } },
    ])
  })

  it('parses think tags in content by default and passes them through when disabled', async () => {
    const body = sse([delta({ content: '<think>p</think>A' }), delta({ content: '<thi' })])
    expect(await events(body)).toEqual([
      { type: 'model', model: 'm-1' },
      { type: 'reasoning', text: 'p' },
      { type: 'text', text: 'A' },
      { type: 'text', text: '<thi' },
    ])
    expect(await events(body, { thinkTags: false })).toEqual([
      { type: 'model', model: 'm-1' },
      { type: 'text', text: '<think>p</think>A' },
      { type: 'text', text: '<thi' },
    ])
  })

  it('normalizes tool-call deltas, defaulting the index to the array position', async () => {
    const body = sse([
      delta({
        tool_calls: [
          { index: 0, id: 'c1', type: 'function', function: { name: 'calc', arguments: '' } },
          { id: 'c2', function: { name: 'time' } },
        ],
      }),
      delta({ tool_calls: [{ index: 0, function: { arguments: '{"a":1}' } }] }, 'tool_calls'),
      { model: '', choices: [{ delta: { tool_calls: [{}] } }] },
    ])
    expect(await events(body)).toEqual([
      { type: 'model', model: 'm-1' },
      { type: 'tool_call', index: 0, id: 'c1', name: 'calc', arguments: '' },
      { type: 'tool_call', index: 1, id: 'c2', name: 'time' },
      { type: 'tool_call', index: 0, arguments: '{"a":1}' },
      { type: 'finish', reason: 'tool_calls' },
      { type: 'tool_call', index: 0 },
    ])
  })

  it('stops at [DONE] and tolerates chunks without choices or deltas', async () => {
    const body = `${sse([{ id: 'x' }, { choices: [{ finish_reason: null }] }], true)}data: ${JSON.stringify(delta({ content: 'late' }))}\n\n`
    expect(await events(body)).toEqual([])
  })

  it.each([
    [sse([{ error: 'boom' }]), 'boom'],
    [sse([{ error: { message: 'bad' } }]), 'bad'],
    [sse([{ error: {} }]), 'Stream error'],
    ['data: {nope\n\n', 'Malformed stream chunk: {nope'],
  ])('throws on stream errors (%#)', async (body, message) => {
    await expect(events(body)).rejects.toThrow(message)
  })

  it('retries once without stream_options when the endpoint rejects it', async () => {
    const { fn, calls } = fakeFetch(
      json({ error: { message: 'Unknown field stream_options' } }, 400),
      sseResponse(sse([delta({ content: 'ok' })])),
    )
    const client = createClient({ baseUrl: 'http://x', fetch: fn })
    const out: StreamEvent[] = []
    for await (const e of client.streamCompletion({ model: 'm', messages: [] })) out.push(e)
    expect(out.at(-1)).toEqual({ type: 'text', text: 'ok' })
    expect(JSON.parse(calls[1]?.init.body as string)).not.toHaveProperty('stream_options')
  })

  it('throws other 4xx errors without retrying, and errors from the retry', async () => {
    const first = fakeFetch(json({ error: { message: 'model not found' } }, 422))
    const gen = createClient({ baseUrl: 'http://x', fetch: first.fn }).streamCompletion({
      model: 'm',
      messages: [],
    })
    await expect(gen.next()).rejects.toThrow('HTTP 422: model not found')
    expect(first.calls).toHaveLength(1)

    const second = fakeFetch(
      json({ error: { message: 'include_usage unsupported' } }, 400),
      json({ error: { message: 'still bad' } }, 400),
    )
    const gen2 = createClient({ baseUrl: 'http://x', fetch: second.fn }).streamCompletion({
      model: 'm',
      messages: [],
    })
    await expect(gen2.next()).rejects.toThrow('HTTP 400: still bad')

    const third = fakeFetch(json({ error: 'nope' }, 500))
    const gen3 = createClient({ baseUrl: 'http://x', fetch: third.fn }).streamCompletion({
      model: 'm',
      messages: [],
    })
    await expect(gen3.next()).rejects.toThrow('HTTP 500: nope')
  })

  it('throws when the response has no body', async () => {
    const { fn } = fakeFetch(new Response(null, { status: 200 }))
    const gen = createClient({ baseUrl: 'http://x', fetch: fn }).streamCompletion({
      model: 'm',
      messages: [],
    })
    await expect(gen.next()).rejects.toThrow('Response has no body')
  })
})

describe('createClient() redirects', () => {
  const base = 'https://api.test/v1'
  const text = vi.fn()
  const fake = (init: Record<string, unknown>) =>
    ({
      type: 'basic',
      status: 200,
      ok: true,
      redirected: false,
      url: '',
      headers: new Headers(),
      body: null,
      text,
      json: text,
      ...init,
    }) as unknown as Response
  const cases: Array<[string, () => Response, string, number | undefined]> = [
    [
      '3xx with a location',
      () => fake({ status: 307, ok: false, headers: new Headers({ location: '/v2/x?q=1' }) }),
      'https://api.test/v2/x?q=1',
      307,
    ],
    [
      '3xx with a malformed location',
      () => fake({ status: 302, ok: false, headers: new Headers({ location: 'http://[' }) }),
      'an unknown location',
      302,
    ],
    [
      'opaque redirect',
      () => fake({ type: 'opaqueredirect', status: 0, ok: false }),
      'an unknown location',
      undefined,
    ],
    [
      'followed anyway (different url)',
      () => fake({ url: 'https://evil.test/v1/models' }),
      'https://evil.test/v1/models',
      undefined,
    ],
    [
      'followed anyway (redirected flag)',
      () => fake({ redirected: true }),
      'an unknown location',
      undefined,
    ],
  ]

  const sites: Array<[string, (client: ReturnType<typeof createClient>) => Promise<unknown>]> = [
    ['listModels', (client) => client.listModels()],
    ['streamCompletion', (client) => client.streamCompletion({ model: 'm', messages: [] }).next()],
  ]

  for (const [site, call] of sites) {
    it.each(cases)(
      `${site}: never follows a redirect (%s)`,
      async (_, response, target, status) => {
        const { fn, calls } = fakeFetch(response())
        const error = await call(createClient({ baseUrl: base, apiKey: 'sk', fetch: fn })).catch(
          (e: unknown) => e,
        )
        expect(calls).toHaveLength(1)
        expect(calls[0]?.init.redirect).toBe('manual')
        expect(error).toBeInstanceOf(AgentError)
        expect((error as AgentError).message).toBe(
          `The endpoint redirects to ${target}. Redirects are not followed so the API key stays on the configured endpoint; set the redirect target as the base URL directly.`,
        )
        expect((error as AgentError).status).toBe(status)
        expect(text).not.toHaveBeenCalled()
      },
    )
  }

  it('accepts a response whose url is the requested url', async () => {
    const { fn } = fakeFetch(fake({ url: `${base}/models#x`, json: async () => ({ data: [] }) }))
    expect(await createClient({ baseUrl: base, fetch: fn }).listModels()).toEqual([])
  })
})

describe('createClient() with hostile host and endpoint values', () => {
  it.each([
    ['a BigInt body field', { body: { seed: 1n } }],
    [
      'a circular body field',
      {
        body: (() => {
          const loop: Record<string, unknown> = {}
          loop.self = loop
          return { loop }
        })(),
      },
    ],
    [
      'a throwing toJSON',
      {
        body: {
          x: {
            toJSON: () => {
              throw new Error('nope')
            },
          },
        },
      },
    ],
    ['a body with no JSON form', { body: { toJSON: () => undefined } }],
    [
      'a BigInt in a tool schema',
      {
        tools: [
          {
            type: 'function' as const,
            function: { name: 't', description: 'd', parameters: { max: 1n } },
          },
        ],
      },
    ],
  ])('reports %s as an AgentError without sending', async (_label, request) => {
    const { fn, calls } = fakeFetch()
    const client = createClient({ baseUrl: 'http://x', fetch: fn })
    const error = await (async () => {
      for await (const _ of client.streamCompletion({ model: 'm', messages: [], ...request })) {
        // drain
      }
    })().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AgentError)
    expect((error as AgentError).message).toMatch(/^The request could not be serialized as JSON/)
    expect(calls).toHaveLength(0)
  })

  it.each([
    ['a non-JSON body', new Response('nope', { status: 200 })],
    ['a null body', json(null)],
  ])('rejects %s from /models as unexpected', async (_label, response) => {
    const { fn } = fakeFetch(response)
    await expect(createClient({ baseUrl: 'http://x', fetch: fn }).listModels()).rejects.toThrow(
      new AgentError('Unexpected models response'),
    )
  })

  it('skips null model entries', async () => {
    const { fn } = fakeFetch(json({ data: [null, { id: 'a' }] }))
    expect(await createClient({ baseUrl: 'http://x', fetch: fn }).listModels()).toEqual(['a'])
  })

  it.each(['null', '42', '"text"'])(
    'rejects the non-object chunk %s as malformed',
    async (chunk) => {
      await expect(events(sse([chunk]))).rejects.toThrow(`Malformed stream chunk: ${chunk}`)
    },
  )

  it.each([
    [{ error: { message: { toString: 1 } } }, 'Stream error'],
    [{ error: { message: '' } }, 'Stream error'],
    [{ error: 7 }, 'Stream error'],
  ])('reports a stream error without a usable message (%#)', async (chunk, message) => {
    await expect(events(sse([chunk]))).rejects.toThrow(new AgentError(message))
  })

  it('ignores mistyped delta, tool-call, usage and finish fields', async () => {
    const hostile = { toString: 1 }
    const out = await events(
      sse([
        delta({ tool_calls: { 0: { index: 0 } } }),
        delta({
          tool_calls: [
            null,
            7,
            { index: hostile, id: hostile, function: { name: hostile, arguments: '{}' } },
            { index: 1.5, id: '', function: 'x' },
          ],
        }),
        {
          choices: [{ delta: {}, finish_reason: hostile }],
          usage: { prompt_tokens: hostile, completion_tokens: '3', total_tokens: 4, cost: hostile },
        },
      ]),
    )
    expect(out).toEqual([
      { type: 'model', model: 'm-1' },
      { type: 'tool_call', index: 2, arguments: '{}' },
      { type: 'tool_call', index: 3 },
      { type: 'usage', usage: { total: 4 } },
    ])
  })
})

describe('createClient() tool capability', () => {
  const tools = [
    { type: 'function' as const, function: { name: 'calc', description: 'd', parameters: {} } },
  ]
  const history: CompletionRequest['messages'] = [
    { role: 'user', content: 'sum' },
    {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'calc', arguments: '{}' } }],
    },
    { role: 'tool', tool_call_id: 'c1', content: '4' },
    { role: 'assistant', content: 'It is 4.' },
    { role: 'user', content: 'thanks' },
  ]
  const flat = [
    { role: 'user', content: 'sum' },
    { role: 'assistant', content: '[called calc({})]\n\n[calc returned]\n4\n\nIt is 4.' },
    { role: 'user', content: 'thanks' },
  ]
  const drain = async (
    client: ReturnType<typeof createClient>,
    request: Partial<CompletionRequest>,
  ) => {
    for await (const _ of client.streamCompletion({ model: 'm', messages: history, ...request })) {
      // drain
    }
  }
  const body = (call: { init: RequestInit } | undefined) => JSON.parse(call?.init.body as string)

  it('bounds the shared listing cache', async () => {
    const urls: string[] = []
    const fn: FetchLike = async (url) => {
      urls.push(url)
      return url.endsWith('/models') ? json({ data: [] }) : sseResponse(sse([]))
    }
    for (let i = 0; i <= 256; i++)
      await createClient({ baseUrl: `http://cap-bound-${i}`, fetch: fn }).listModelInfo()
    urls.length = 0
    // The first endpoint's listing was dropped when the cache filled, so it is fetched again.
    await drain(createClient({ baseUrl: 'http://cap-bound-0', fetch: fn }), { tools })
    expect(urls).toEqual(['http://cap-bound-0/models', 'http://cap-bound-0/chat/completions'])
  })

  it('lists what models declare', async () => {
    const { fn } = fakeFetch(
      json({ data: [{ id: 'b', supported_parameters: ['tools', 7] }, { id: 'a' }] }),
    )
    expect(await createClient({ baseUrl: 'http://cap-list', fetch: fn }).listModelInfo()).toEqual([
      { id: 'a' },
      { id: 'b', supportedParameters: ['tools'] },
    ])
  })

  it('sends no tools, and the tool history as text, to a model declaring none', async () => {
    const { fn, calls } = fakeFetch(
      json({ data: [{ id: 'm', supported_parameters: ['temperature'] }] }),
      sseResponse(sse([])),
      sseResponse(sse([])),
    )
    const client = createClient({ baseUrl: 'http://cap-none', fetch: fn })
    await drain(client, { tools })
    expect(body(calls[1])).not.toHaveProperty('tools')
    expect(body(calls[1]).messages).toEqual(flat)
    // The listing is fetched once per endpoint, by any client.
    await drain(createClient({ baseUrl: 'http://cap-none', fetch: fn }), { tools })
    expect(calls.map((c) => c.url.split('/').pop())).toEqual([
      'models',
      'completions',
      'completions',
    ])
  })

  it('lists afresh on every explicit call, refreshing what the tool check reads', async () => {
    const { fn, calls } = fakeFetch(
      json({ data: [{ id: 'm', supported_parameters: ['temperature'] }] }),
      json({ data: [{ id: 'm', supported_parameters: ['tools'] }] }),
      sseResponse(sse([])),
    )
    const client = createClient({ baseUrl: 'http://cap-refresh', fetch: fn })
    await client.listModelInfo()
    expect(await client.listModels()).toEqual(['m'])
    await drain(client, { tools })
    expect(calls.map((c) => c.url.split('/').pop())).toEqual(['models', 'models', 'completions'])
    // The second listing replaced the first: the model now takes tools.
    expect(body(calls[2]).tools).toEqual(tools)
  })

  it('sends tools to a model declaring them, and to one the listing does not describe', async () => {
    const { fn, calls } = fakeFetch(
      json({ data: [{ id: 'm', supported_parameters: ['tools'] }] }),
      sseResponse(sse([])),
    )
    await drain(createClient({ baseUrl: 'http://cap-yes', fetch: fn }), { tools })
    expect(body(calls[1]).tools).toEqual(tools)
    expect(body(calls[1]).messages).toEqual(history)

    const unknown = fakeFetch(json({ error: 'no listing' }, 404), sseResponse(sse([])))
    await drain(createClient({ baseUrl: 'http://cap-unknown', fetch: unknown.fn }), { tools })
    expect(body(unknown.calls[1]).tools).toEqual(tools)
  })

  it('skips the listing when nothing is tool-related', async () => {
    const { fn, calls } = fakeFetch(sseResponse(sse([])))
    await drain(createClient({ baseUrl: 'http://cap-plain', fetch: fn }), {
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(calls).toHaveLength(1)
  })

  it('retries without tools when the endpoint rejects them, and remembers the model', async () => {
    const { fn, calls } = fakeFetch(
      json({ data: [{ id: 'm' }] }),
      json({ error: { message: 'the field "tools" is not supported' } }, 400),
      sseResponse(sse([delta({ content: 'ok' })])),
      sseResponse(sse([])),
    )
    const client = createClient({ baseUrl: 'http://cap-reject', fetch: fn })
    await drain(client, { tools })
    expect(body(calls[2])).not.toHaveProperty('tools')
    expect(body(calls[2]).messages).toEqual(flat)
    await drain(client, { tools })
    expect(calls).toHaveLength(4)
    expect(body(calls[3])).not.toHaveProperty('tools')
  })

  it('sends tool history alone as text once a tool rejection names it', async () => {
    const { fn, calls } = fakeFetch(
      json({ data: [] }),
      json({ error: { message: 'a message carries the role "tool"' } }, 400),
      sseResponse(sse([])),
    )
    await drain(createClient({ baseUrl: 'http://cap-history', fetch: fn }), {})
    expect(body(calls[1]).messages).toEqual(history)
    expect(body(calls[2]).messages).toEqual(flat)
  })

  it('throws a tool rejection that dropping tools cannot fix', async () => {
    const { fn, calls } = fakeFetch(
      json({ data: [] }),
      json({ error: { message: 'tools rejected' } }, 400),
      json({ error: { message: 'tool still rejected' } }, 400),
    )
    await expect(
      drain(createClient({ baseUrl: 'http://cap-twice', fetch: fn }), { tools }),
    ).rejects.toThrow('HTTP 400: tool still rejected')
    expect(calls).toHaveLength(3)
  })

  it('lists again after an aborted listing', async () => {
    const controller = new AbortController()
    const { fn, calls } = fakeFetch(
      json({ data: [{ id: 'm', supported_parameters: [] }] }),
      sseResponse(sse([])),
    )
    const aborting: FetchLike = async (url, init) => {
      if (url.endsWith('/models') && calls.length === 0 && !controller.signal.aborted) {
        controller.abort()
        throw new DOMException('aborted', 'AbortError')
      }
      if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError')
      return fn(url, init)
    }
    const client = createClient({ baseUrl: 'http://cap-abort', fetch: aborting })
    await expect(drain(client, { tools, signal: controller.signal })).rejects.toThrow()
    await drain(client, { tools })
    expect(calls.map((c) => c.url.split('/').pop())).toEqual(['models', 'completions'])
    expect(body(calls[1])).not.toHaveProperty('tools')
  })
})
