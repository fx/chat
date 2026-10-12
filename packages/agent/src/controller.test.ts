import type { ChatMessage } from '@fx/chat-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ChatController,
  type ControllerOptions,
  type ConversationMeta,
  type RunConfig,
  newId,
  titleFrom,
} from './controller'
import type { RunOptions, RunResult } from './run'
import { type KeyValueStore, memoryStore } from './storage'
import { fakeEndpoint, sseBody } from './test-helpers'

interface Meta extends ConversationMeta {
  endpoint?: string | undefined
}

const config: RunConfig = {
  baseUrl: 'https://fake.test/v1',
  apiKey: 'sk-1',
  model: 'fake-1',
  system: 'Be nice.',
  tools: { current_time: true, calculator: true, fetch_url: true },
  approvals: { fetch_url: true },
}

/** Conversations bound to `endpoint: 'ok'` run; others are blocked. */
const resolveRun = (meta: Meta) =>
  meta.endpoint === 'ok' ? config : { blocked: `No endpoint for ${meta.id}.` }

function setup(
  completions: string[] = [],
  kvInit: Record<string, unknown> = {},
  options: Partial<ControllerOptions<Meta>> = {},
) {
  const kv = memoryStore(kvInit)
  const endpoint = fakeEndpoint(completions)
  const chat = new ChatController<Meta>({ kv, fetch: endpoint.fetch, resolveRun, ...options })
  return { chat, kv, endpoint }
}

/**
 * A store whose operations on keys matching `hold(match)` wait until
 * `release()`, so a test can dispose while the controller awaits storage.
 */
function gatedStore(init: Record<string, unknown> = {}) {
  const inner = memoryStore(init)
  let match: ((key: string) => boolean) | undefined
  let gate = Promise.resolve()
  let open = () => {}
  let close: (error: Error) => void = () => {}
  const wait = (key: string) => (match?.(key) ? gate : undefined)
  const kv: KeyValueStore = {
    get: async <T>(key: string) => {
      await wait(key)
      return inner.get<T>(key)
    },
    set: async (key, value) => {
      await wait(key)
      return inner.set(key, value)
    },
    delete: async (key) => {
      await wait(key)
      return inner.delete(key)
    },
  }
  return {
    kv,
    inner,
    hold(keys: (key: string) => boolean) {
      match = keys
      gate = new Promise((resolve, reject) => {
        open = resolve
        close = reject
      })
    },
    release() {
      match = undefined
      open()
    },
    /** Release the held operations as failures. */
    reject(error = new Error('store down')) {
      match = undefined
      close(error)
    },
  }
}

/**
 * A store whose operations fail while `broken` holds a prefix of
 * `<op>:<key>` (e.g. `set:conversations`, `get:messages:`).
 */
function flakyStore(init: Record<string, unknown> = {}) {
  const inner = memoryStore(init)
  const broken = new Set<string>()
  const check = (op: string, key: string) => {
    for (const prefix of broken)
      if (`${op}:${key}`.startsWith(prefix)) throw new Error(`${op} failed`)
  }
  const kv: KeyValueStore = {
    get: async <T>(key: string) => {
      check('get', key)
      return inner.get<T>(key)
    },
    set: async (key, value) => {
      check('set', key)
      return inner.set(key, value)
    },
    delete: async (key) => {
      check('delete', key)
      return inner.delete(key)
    },
  }
  return { kv, inner, broken }
}

const toolCall = (url = 'https://x.test/') =>
  sseBody(
    [
      {
        tool_calls: [
          { index: 0, id: 'c1', function: { name: 'fetch_url', arguments: `{"url":"${url}"}` } },
        ],
      },
    ],
    'tool_calls',
  )

/** A run that waits until `finish` is called, recording its options. */
function heldRun() {
  const calls: RunOptions[] = []
  let finish: (result?: Partial<RunResult>) => void = () => {}
  const run = vi.fn(
    (options: RunOptions) =>
      new Promise<RunResult>((resolve) => {
        calls.push(options)
        finish = (result = {}) =>
          resolve({
            outcome: 'complete',
            message: { id: options.messageId ?? 'a', role: 'assistant', blocks: [] },
            ...result,
          })
      }),
  )
  return { run, calls, finish: (result?: Partial<RunResult>) => finish(result) }
}

const text = (message: ChatMessage | undefined) =>
  (message?.blocks[0] as { text?: string } | undefined)?.text

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(1_000_000)
})
afterEach(() => vi.useRealTimers())

describe('helpers', () => {
  it('titles from the first line of text', () => {
    expect(titleFrom('  hello\n  world ')).toBe('hello world')
    expect(titleFrom('   ')).toBe('New chat')
    expect(titleFrom('x'.repeat(60))).toBe(`${'x'.repeat(47)}…`)
  })

  it('makes unique-ish ids with a prefix', () => {
    expect(newId('c')).toMatch(/^c[a-z0-9]+$/)
    expect(newId()).not.toBe(newId())
  })
})

describe('ChatController conversations', () => {
  it('loads the stored list newest first, or nothing', async () => {
    const { chat } = setup([], {
      conversations: [
        { id: 'a', title: 'A', createdAt: 1, updatedAt: 1 },
        { id: 'b', title: 'B', createdAt: 2, updatedAt: 2 },
      ],
    })
    expect(chat.getState().loaded).toBe(false)
    await chat.load()
    expect(chat.getState().loaded).toBe(true)
    expect(chat.getState().conversations.map((c) => c.id)).toEqual(['b', 'a'])
    const empty = setup().chat
    await empty.load()
    expect(empty.getState().conversations).toEqual([])
  })

  it('creates, renames and deletes conversations, notifying subscribers', async () => {
    const { chat, kv } = setup()
    const listener = vi.fn()
    const unsubscribe = chat.subscribe(listener)
    const meta = await chat.createConversation({ endpoint: 'ok' })
    expect(meta).toMatchObject({ title: 'New chat', endpoint: 'ok', createdAt: 1_000_000 })
    expect(meta.id).toMatch(/^c/)
    expect(chat.getState().messages[meta.id]).toEqual([])
    const named = chat.createConversation({ id: 'fixed' })
    // In place before the list is stored.
    expect(chat.conversation('fixed')).toBeDefined()
    await named
    await chat.updateConversation(meta.id, { title: 'Renamed' })
    expect(chat.conversation(meta.id)?.title).toBe('Renamed')
    kv.data.set(`messages:${meta.id}`, [])
    await chat.deleteConversation(meta.id)
    expect(chat.getState().conversations.map((c) => c.id)).toEqual(['fixed'])
    expect(kv.data.has(`messages:${meta.id}`)).toBe(false)
    expect(listener).toHaveBeenCalled()
    unsubscribe()
  })

  it('opens stored transcripts once, settling interrupted tool calls', async () => {
    const stored: ChatMessage[] = [
      {
        id: 'a',
        role: 'assistant',
        blocks: [
          { type: 'tool_call', id: 't1', name: 'x', arguments: {}, status: 'running' },
          {
            type: 'tool_call',
            id: 't2',
            name: 'x',
            arguments: {},
            status: 'pending',
            result: 'kept',
          },
          { type: 'tool_call', id: 't3', name: 'x', arguments: {}, status: 'success' },
        ],
      },
      { id: 'u', role: 'user', blocks: [{ type: 'text', id: 'x', text: 'hi' }] },
    ]
    const { chat } = setup([], { 'messages:c1': stored })
    await chat.openConversation('c1')
    const [first, second] = chat.getState().messages.c1 ?? []
    expect(first?.blocks.map((b) => (b as { status: string }).status)).toEqual([
      'error',
      'error',
      'success',
    ])
    expect((first?.blocks[0] as { result: unknown }).result).toEqual({ error: 'Interrupted.' })
    expect((first?.blocks[1] as { result: unknown }).result).toBe('kept')
    expect(second).toEqual(stored[1])
    const opened = chat.getState().messages.c1
    await chat.openConversation('c1')
    expect(chat.getState().messages.c1).toBe(opened)
    await chat.openConversation('empty')
    expect(chat.getState().messages.empty).toEqual([])
  })

  it('does not reopen a conversation deleted while its transcript loads', async () => {
    const { chat } = setup([], { 'messages:c1': [] })
    const opening = chat.openConversation('c1')
    await chat.deleteConversation('c1')
    await opening
    expect(chat.getState().messages.c1).toBeUndefined()
  })

  it('debounces transcript writes and flushes on demand', async () => {
    const { chat, kv } = setup([], {}, { saveDelayMs: 50 })
    const meta = await chat.createConversation({ endpoint: 'ok' })
    await chat.send(meta.id, 'hi')
    kv.data.delete(`messages:${meta.id}`)
    chat.clear(meta.id)
    expect(kv.data.has(`messages:${meta.id}`)).toBe(false)
    await vi.advanceTimersByTimeAsync(50)
    expect(kv.data.get(`messages:${meta.id}`)).toEqual([])
    await chat.flush('unknown')
    expect(kv.data.has('messages:unknown')).toBe(false)
  })

  it('clears a transcript, its error and queue, but not while running', async () => {
    const held = heldRun()
    const { chat } = setup([], {}, { run: held.run, queue: true })
    const meta = await chat.createConversation({ endpoint: 'ok' })
    const running = chat.send(meta.id, 'one')
    await vi.waitFor(() => expect(held.run).toHaveBeenCalled())
    await chat.send(meta.id, 'two')
    expect(chat.clear(meta.id)).toBe(false)
    chat.unqueue(meta.id)
    held.finish()
    await running
    expect(chat.clear(meta.id)).toBe(true)
    expect(chat.getState().messages[meta.id]).toEqual([])
    expect(chat.getState().queued[meta.id]).toBeUndefined()
  })
})

describe('ChatController runs', () => {
  it('sends a message, streams the answer, titles the chat and persists it', async () => {
    const { chat, kv, endpoint } = setup([
      sseBody([{ reasoning_content: 'hmm' }, { content: 'Hello!' }]),
    ])
    const meta = await chat.createConversation({ endpoint: 'ok' })
    const result = await chat.send(meta.id, 'Hi there', [
      { url: 'data:image/png;base64,AA', mediaType: 'image/png', kind: 'image' },
    ])
    expect(result?.outcome).toBe('complete')
    const messages = chat.getState().messages[meta.id] ?? []
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(messages[0]?.attachments).toHaveLength(1)
    expect(messages[1]?.blocks.map((b) => b.type)).toEqual(['reasoning', 'text'])
    expect(chat.conversation(meta.id)?.title).toBe('Hi there')
    expect(chat.getState().runs[meta.id]).toBeUndefined()
    expect(kv.data.get(`messages:${meta.id}`)).toEqual(messages)
    const request = endpoint.requests.at(-1)
    expect(request?.headers.get('authorization')).toBe('Bearer sk-1')
    const body = request?.body as { messages: Array<{ role: string }>; tools: unknown[] }
    expect(body.messages[0]).toEqual({ role: 'system', content: 'Be nice.' })
    expect(body.tools).toHaveLength(3)
  })

  it('keeps the title after the first turn and sends without tools when none are set', async () => {
    const { chat, endpoint } = setup(
      [sseBody([{ content: 'a' }]), sseBody([{ content: 'b' }])],
      {},
      {
        resolveRun: () => ({ baseUrl: 'https://fake.test/v1', model: 'fake-1' }),
      },
    )
    const meta = await chat.createConversation()
    await chat.send(meta.id, 'first')
    await chat.send(meta.id, 'second')
    expect(chat.conversation(meta.id)?.title).toBe('first')
    expect((endpoint.requests.at(-1)?.body as { tools?: unknown }).tools).toBeUndefined()
  })

  it('runs in memory with an injected clock, the run in place as send returns', async () => {
    const endpoint = fakeEndpoint([sseBody([{ content: 'a' }])])
    const chat = new ChatController({
      fetch: endpoint.fetch,
      resolveRun: () => config,
      now: () => 42,
    })
    const meta = await chat.createConversation()
    expect(meta.createdAt).toBe(42)
    const sending = chat.send(meta.id, 'q')
    expect(chat.getState().messages[meta.id]).toHaveLength(1)
    expect(chat.getState().runs[meta.id]?.startedAt).toBe(42)
    expect((await sending)?.outcome).toBe('complete')
    expect(chat.getState().messages[meta.id]?.at(-1)?.createdAt).toBe(42)
  })

  it('does not start a run stopped before it began, but keeps the message', async () => {
    const { chat, endpoint } = setup([sseBody([{ content: 'a' }])])
    const meta = await chat.createConversation({ endpoint: 'ok' })
    const sending = chat.send(meta.id, 'q')
    expect(chat.stop(meta.id)).toBe(true)
    expect(await sending).toBeUndefined()
    expect(endpoint.requests).toHaveLength(0)
    expect(chat.getState().runs[meta.id]).toBeUndefined()
    expect(chat.getState().messages[meta.id]?.map((m) => m.role)).toEqual(['user'])
  })

  it('offers app-defined tools after the built-ins', async () => {
    const { chat, endpoint } = setup(
      [sseBody([{ content: 'a' }])],
      {},
      {
        resolveRun: () => ({
          ...config,
          tools: {},
          extraTools: [
            {
              name: 'ping',
              description: 'Ping.',
              parameters: { type: 'object' },
              execute: () => 1,
            },
          ],
        }),
      },
    )
    const meta = await chat.createConversation()
    await chat.send(meta.id, 'q')
    const body = endpoint.requests.at(-1)?.body as { tools: Array<{ function: { name: string } }> }
    expect(body.tools.map((t) => t.function.name)).toEqual(['ping'])
  })

  it('ignores sends to unknown conversations and drops them while a run is active', async () => {
    const held = heldRun()
    const { chat } = setup([], {}, { run: held.run })
    expect(await chat.send('missing', 'hi')).toBeUndefined()
    const meta = await chat.createConversation({ endpoint: 'ok' })
    const first = chat.send(meta.id, 'one')
    await vi.waitFor(() => expect(held.run).toHaveBeenCalled())
    expect(chat.getState().runs[meta.id]).toMatchObject({
      messageId: held.calls[0]?.messageId,
      startedAt: expect.any(Number),
      stopping: false,
    })
    expect(await chat.send(meta.id, 'two')).toBeUndefined()
    expect(chat.getState().queued[meta.id]).toBeUndefined()
    expect(await chat.regenerate(meta.id)).toBeUndefined()
    held.finish()
    await first
    expect(chat.getState().runs[meta.id]).toBeUndefined()
    expect(held.run).toHaveBeenCalledTimes(1)
  })

  it('keeps run failures on the message outcome, not as an error', async () => {
    const { chat } = setup()
    const meta = await chat.createConversation({ endpoint: 'ok' })
    const result = await chat.send(meta.id, 'hi')
    expect(result?.outcome).toBe('error')
    expect(chat.getState().messages[meta.id]?.at(-1)?.outcome).toEqual({
      kind: 'error',
      message: 'HTTP 500: no more',
      retryable: true,
    })
    expect(chat.getState().errors[meta.id]).toBeUndefined()
  })

  it('records a run that throws as the conversation error', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('boom')).mockRejectedValueOnce('plain')
    const { chat } = setup([], {}, { run })
    const meta = await chat.createConversation({ endpoint: 'ok' })
    expect(await chat.send(meta.id, 'hi')).toBeUndefined()
    expect(chat.getState().errors[meta.id]?.message).toBe('boom')
    expect(chat.getState().runs[meta.id]).toBeUndefined()
    await chat.regenerate(meta.id)
    expect(chat.getState().errors[meta.id]?.message).toBe('plain')
  })

  it('reports a blocked conversation instead of running, keeping its transcript', async () => {
    const { chat, endpoint } = setup([sseBody([{ content: 'a' }])])
    const meta = await chat.createConversation({ endpoint: 'ok' })
    await chat.send(meta.id, 'q')
    const transcript = chat.getState().messages[meta.id]
    const sent = endpoint.requests.length
    await chat.updateConversation(meta.id, { endpoint: undefined })
    expect(await chat.regenerate(meta.id)).toBeUndefined()
    expect(await chat.send(meta.id, 'again')).toBeUndefined()
    expect(endpoint.requests).toHaveLength(sent)
    expect(chat.getState().messages[meta.id]).toEqual(transcript)
    expect(chat.getState().errors[meta.id]).toEqual({
      message: `No endpoint for ${meta.id}.`,
      at: 1_000_000,
    })
  })

  it('regenerates the last turn or a given assistant message', async () => {
    const { chat } = setup([
      sseBody([{ content: 'first' }]),
      sseBody([{ content: 'second' }]),
      sseBody([{ content: 'third' }]),
    ])
    const meta = await chat.createConversation({ endpoint: 'ok' })
    await chat.send(meta.id, 'q')
    await chat.regenerate(meta.id)
    let messages = chat.getState().messages[meta.id] ?? []
    expect(messages).toHaveLength(2)
    expect(text(messages[1])).toBe('second')
    await chat.regenerate(meta.id, messages[1]?.id)
    messages = chat.getState().messages[meta.id] ?? []
    expect(text(messages[1])).toBe('third')
  })

  it('does not regenerate when no user message precedes', async () => {
    const { chat } = setup()
    const meta = await chat.createConversation({ endpoint: 'ok' })
    expect(await chat.regenerate(meta.id)).toBeUndefined()
    expect(await chat.regenerate('missing')).toBeUndefined()
  })

  it('stops a run once and resolves pending approvals as denied', async () => {
    const { chat } = setup([toolCall()])
    const meta = await chat.createConversation({ endpoint: 'ok' })
    expect(chat.stop(meta.id)).toBe(false)
    const running = chat.send(meta.id, 'fetch it')
    await vi.waitFor(() => expect(chat.getState().approvals).toHaveLength(1))
    expect(chat.getState().approvals[0]?.call.name).toBe('fetch_url')
    expect(chat.stop(meta.id)).toBe(true)
    expect(chat.getState().runs[meta.id]?.stopping).toBe(true)
    expect(chat.stop(meta.id)).toBe(false)
    expect((await running)?.outcome).toBe('aborted')
    expect(chat.getState().approvals).toEqual([])
  })

  it('runs an approved tool through the injected HTML-to-text and continues', async () => {
    const htmlToText = vi.fn(() => 'converted')
    const { chat, endpoint } = setup(
      [toolCall(), sseBody([{ content: 'done' }])],
      {},
      {
        htmlToText,
      },
    )
    const meta = await chat.createConversation({ endpoint: 'ok' })
    const running = chat.send(meta.id, 'fetch it')
    await vi.waitFor(() => expect(chat.getState().approvals).toHaveLength(1))
    const approval = chat.getState().approvals[0]
    approval?.resolve(true)
    // A second answer to the same question is ignored.
    approval?.resolve(false)
    expect((await running)?.outcome).toBe('complete')
    expect(endpoint.requests.some((r) => r.url === 'https://x.test/')).toBe(true)
    expect(htmlToText).toHaveBeenCalled()
  })

  it('keeps a conversation deleted while its run ends', async () => {
    const { chat, kv } = setup([toolCall()])
    const meta = await chat.createConversation({ endpoint: 'ok' })
    const running = chat.send(meta.id, 'fetch it')
    await vi.waitFor(() => expect(chat.getState().approvals).toHaveLength(1))
    await chat.deleteConversation(meta.id)
    expect((await running)?.outcome).toBe('aborted')
    await vi.runAllTimersAsync()
    await chat.flush(meta.id)
    await chat.openConversation(meta.id)
    const state = chat.getState()
    expect(state.messages[meta.id]).toBeUndefined()
    expect(state.runs[meta.id]).toBeUndefined()
    expect(state.conversations.some((c) => c.id === meta.id)).toBe(false)
    expect(kv.data.has(`messages:${meta.id}`)).toBe(false)
    expect((kv.data.get('conversations') as Meta[]).some((c) => c.id === meta.id)).toBe(false)
  })

  it('does not start a run for a conversation deleted mid-send', async () => {
    const { chat, kv, endpoint } = setup([sseBody([{ content: 'hi' }])])
    const meta = await chat.createConversation({ endpoint: 'ok' })
    const sending = chat.send(meta.id, 'hi')
    const deleting = chat.deleteConversation(meta.id)
    expect(await sending).toBeUndefined()
    await deleting
    await vi.runAllTimersAsync()
    expect(endpoint.requests).toHaveLength(0)
    expect(chat.getState().messages[meta.id]).toBeUndefined()
    expect(kv.data.has(`messages:${meta.id}`)).toBe(false)
  })

  it('does not run a conversation deleted while its transcript loads', async () => {
    const kv = memoryStore({
      conversations: [{ id: 'c1', title: 'C', createdAt: 1, updatedAt: 1, endpoint: 'ok' }],
      'messages:c1': [{ id: 'u', role: 'user', blocks: [{ type: 'text', id: 't', text: 'q' }] }],
    })
    // The delete's storage write stays pending, so the list still has it.
    kv.delete = () => new Promise(() => {})
    const run = vi.fn()
    const chat = new ChatController<Meta>({ kv, fetch: vi.fn(), resolveRun, run })
    await chat.load()
    const sending = chat.send('c1', 'hi')
    const regenerating = chat.regenerate('c1')
    void chat.deleteConversation('c1')
    expect(await sending).toBeUndefined()
    expect(await regenerating).toBeUndefined()
    expect(run).not.toHaveBeenCalled()
    expect(chat.conversation('c1')).toBeDefined()
  })

  it('does not regenerate a conversation deleted mid-regenerate', async () => {
    const held = heldRun()
    const { chat } = setup([], {}, { run: held.run })
    const meta = await chat.createConversation({ endpoint: 'ok' })
    const first = chat.send(meta.id, 'q')
    await vi.waitFor(() => expect(held.run).toHaveBeenCalled())
    held.finish()
    await first
    const regenerating = chat.regenerate(meta.id)
    const deleting = chat.deleteConversation(meta.id)
    expect(await regenerating).toBeUndefined()
    await deleting
    expect(held.run).toHaveBeenCalledTimes(1)
  })
})

describe('ChatController queue', () => {
  it('queues messages sent while a run is active and sends them in order', async () => {
    const held = heldRun()
    const { chat } = setup([], {}, { run: held.run, queue: true })
    const meta = await chat.createConversation({ endpoint: 'ok' })
    const first = chat.send(meta.id, 'one')
    await vi.waitFor(() => expect(held.run).toHaveBeenCalledTimes(1))
    const image = {
      url: 'data:image/png;base64,AA',
      mediaType: 'image/png',
      kind: 'image' as const,
    }
    await chat.send(meta.id, 'two', [image])
    await chat.send(meta.id, 'three')
    await chat.send(meta.id, 'four', [])
    expect(chat.getState().queued[meta.id]).toEqual([
      { text: 'two', attachments: [image] },
      { text: 'three' },
      { text: 'four' },
    ])
    expect(chat.unqueue(meta.id)).toEqual({ text: 'four' })
    expect(chat.unqueue('none')).toBeUndefined()
    held.finish()
    await first
    await vi.waitFor(() => expect(held.run).toHaveBeenCalledTimes(2))
    expect(chat.getState().queued[meta.id]).toEqual([{ text: 'three' }])
    const second = held.calls[1]?.history.at(-1)
    expect(text(second)).toBe('two')
    expect(second?.attachments).toEqual([image])
  })
})

describe('ChatController streamed updates', () => {
  it('applies updates at most once per interval, and before approvals and the end', async () => {
    const message = (n: number): ChatMessage => ({
      id: 'a1',
      role: 'assistant',
      blocks: [{ type: 'text', id: 't', text: `v${n}` }],
    })
    let approve: RunOptions['approve']
    let update: (message: ChatMessage) => void = () => {}
    let finish: () => void = () => {}
    const run = vi.fn(
      (options: RunOptions) =>
        new Promise<RunResult>((resolve) => {
          approve = options.approve
          update = (m) => options.onUpdate?.(m)
          finish = () => resolve({ outcome: 'complete', message: message(9) })
        }),
    )
    const { chat } = setup([], {}, { run, updateIntervalMs: 1000, newId: (p) => `${p}1` })
    const meta = await chat.createConversation({ endpoint: 'ok' })
    const running = chat.send(meta.id, 'go')
    await vi.waitFor(() => expect(run).toHaveBeenCalled())
    const last = () => text(chat.getState().messages[meta.id]?.at(-1))
    update(message(1))
    expect(last()).toBe('v1')
    update(message(2))
    update({ ...message(3), id: 'a2' })
    expect(last()).toBe('v1')
    await vi.advanceTimersByTimeAsync(1000)
    expect(chat.getState().messages[meta.id]?.map(text)).toEqual(['go', 'v2', 'v3'])
    update(message(4))
    const asked = approve?.(
      { type: 'tool_call', id: 'x', name: 'x', arguments: {}, status: 'pending' },
      new AbortController().signal,
    )
    expect(text(chat.getState().messages[meta.id]?.[1])).toBe('v4')
    chat.getState().approvals[0]?.resolve(true)
    expect(await asked).toBe(true)
    update(message(5))
    update(message(6))
    finish()
    await running
    expect(text(chat.getState().messages[meta.id]?.[1])).toBe('v6')
  })

  it('applies pending updates, starts pending saves, then stops runs on dispose', async () => {
    let update: (message: ChatMessage) => void = () => {}
    const run = vi.fn(
      (options: RunOptions) =>
        new Promise<RunResult>((resolve) => {
          update = (m) => options.onUpdate?.(m)
          options.signal?.addEventListener('abort', () =>
            resolve({ outcome: 'aborted', message: { id: 'a', role: 'assistant', blocks: [] } }),
          )
        }),
    )
    const { chat, kv } = setup([], {}, { run, updateIntervalMs: 1000, queue: true })
    const meta = await chat.createConversation({ endpoint: 'ok' })
    const running = chat.send(meta.id, 'go')
    await vi.waitFor(() => expect(run).toHaveBeenCalled())
    await chat.send(meta.id, 'queued')
    const msg = (t: string): ChatMessage => ({
      id: 'b',
      role: 'assistant',
      blocks: [{ type: 'text', id: 't', text: t }],
    })
    update(msg('v1'))
    update(msg('v2'))
    const set = vi.spyOn(kv, 'set')
    chat.dispose()
    // The throttled update is applied and the debounced save started at once.
    expect(text(chat.getState().messages[meta.id]?.[1])).toBe('v2')
    expect(set).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledWith(`messages:${meta.id}`, chat.getState().messages[meta.id])
    expect((await running)?.outcome).toBe('aborted')
    await vi.runAllTimersAsync()
    // The stopped run writes nothing more, and the queued message is not sent.
    expect(set).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    expect(chat.getState().runs).toEqual({})
    chat.dispose()
    expect(set).toHaveBeenCalledTimes(1)
  })

  it('writes, schedules and runs nothing once disposed', async () => {
    const { chat, kv } = setup([], {}, { run: heldRun().run })
    const meta = await chat.createConversation({ endpoint: 'ok' })
    const set = vi.spyOn(kv, 'set')
    const del = vi.spyOn(kv, 'delete')
    chat.dispose()
    expect(chat.clear(meta.id)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    await chat.flush(meta.id)
    expect(await chat.send(meta.id, 'hi')).toBeUndefined()
    expect(await chat.regenerate(meta.id)).toBeUndefined()
    const other = await chat.createConversation({ endpoint: 'ok' })
    await chat.updateConversation(other.id, { title: 'T' })
    await chat.deleteConversation(meta.id)
    expect(set).not.toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
    expect(chat.getState().conversations.map((c) => c.id)).toEqual([other.id])
    expect(chat.getState().runs).toEqual({})
  })

  it('neither shows nor asks about a run that outlives dispose', async () => {
    let approved: Promise<boolean> | undefined
    const run = vi.fn(
      (options: RunOptions) =>
        new Promise<RunResult>((resolve) => {
          options.signal?.addEventListener('abort', () => {
            const late: ChatMessage = { id: 'late', role: 'assistant', blocks: [] }
            options.onUpdate?.(late)
            approved = options.approve?.(
              { type: 'tool_call', id: 'c1', name: 'fetch_url', arguments: {}, status: 'pending' },
              new AbortController().signal,
            )
            resolve({ outcome: 'aborted', message: late })
          })
        }),
    )
    const { chat } = setup([], {}, { run })
    const meta = await chat.createConversation({ endpoint: 'ok' })
    const running = chat.send(meta.id, 'go')
    await vi.waitFor(() => expect(run).toHaveBeenCalled())
    chat.dispose()
    await running
    expect(await approved).toBe(false)
    expect(chat.getState().approvals).toEqual([])
    expect(chat.getState().messages[meta.id]?.map((m) => m.id)).not.toContain('late')
    expect(vi.getTimerCount()).toBe(0)
  })

  describe('dispose while awaiting storage or a run', () => {
    const transcript = (id: string): Record<string, unknown> => ({
      conversations: [{ id, title: 'T', createdAt: 1, updatedAt: 1, endpoint: 'ok' }],
      [`messages:${id}`]: [
        { id: 'u1', role: 'user', blocks: [{ type: 'text', id: 't1', text: 'hi' }] },
      ],
    })

    it('load: the list read does not land', async () => {
      const store = gatedStore(transcript('c1'))
      const chat = new ChatController<Meta>({ kv: store.kv, fetch: vi.fn(), resolveRun })
      store.hold(() => true)
      const loading = chat.load()
      chat.dispose()
      store.release()
      await loading
      expect(chat.getState().loaded).toBe(false)
      expect(chat.getState().conversations).toEqual([])
    })

    it('openConversation: the transcript read does not land', async () => {
      const store = gatedStore(transcript('c1'))
      const chat = new ChatController<Meta>({ kv: store.kv, fetch: vi.fn(), resolveRun })
      await chat.load()
      store.hold((key) => key.startsWith('messages:'))
      const opening = chat.openConversation('c1')
      chat.dispose()
      store.release()
      await opening
      expect(chat.getState().messages.c1).toBeUndefined()
    })

    it.each(['send', 'regenerate'] as const)(
      '%s on an unloaded transcript starts no run',
      async (action) => {
        const { run } = heldRun()
        const store = gatedStore(transcript('c1'))
        const chat = new ChatController<Meta>({ kv: store.kv, fetch: vi.fn(), resolveRun, run })
        await chat.load()
        store.hold((key) => key.startsWith('messages:'))
        const pending = action === 'send' ? chat.send('c1', 'again') : chat.regenerate('c1')
        chat.dispose()
        store.release()
        expect(await pending).toBeUndefined()
        expect(run).not.toHaveBeenCalled()
        expect(chat.getState().runs).toEqual({})
        expect(chat.getState().messages.c1).toBeUndefined()
      },
    )

    it('send: a run waiting on the list write never starts the agent', async () => {
      const { run } = heldRun()
      const store = gatedStore()
      const chat = new ChatController<Meta>({ kv: store.kv, fetch: vi.fn(), resolveRun, run })
      const meta = await chat.createConversation({ endpoint: 'ok' })
      store.hold((key) => key === 'conversations')
      const sending = chat.send(meta.id, 'go')
      expect(chat.getState().runs[meta.id]).toBeDefined()
      chat.dispose()
      expect(chat.getState().runs).toEqual({})
      store.release()
      expect(await sending).toBeUndefined()
      expect(run).not.toHaveBeenCalled()
    })

    it('deleteConversation: the list write is skipped', async () => {
      const store = gatedStore()
      const chat = new ChatController<Meta>({ kv: store.kv, fetch: vi.fn(), resolveRun })
      const meta = await chat.createConversation({ endpoint: 'ok' })
      store.hold((key) => key.startsWith('messages:'))
      const deleting = chat.deleteConversation(meta.id)
      chat.dispose()
      store.release()
      await deleting
      expect(chat.conversation(meta.id)).toBeDefined()
      expect((store.inner.data.get('conversations') as Meta[]).map((c) => c.id)).toEqual([meta.id])
    })

    it('a run that throws after dispose records no error', async () => {
      const run = vi.fn(
        (options: RunOptions) =>
          new Promise<RunResult>((_, reject) => {
            options.signal?.addEventListener('abort', () => reject(new Error('boom')))
          }),
      )
      const { chat } = setup([], {}, { run })
      const meta = await chat.createConversation({ endpoint: 'ok' })
      const running = chat.send(meta.id, 'go')
      await vi.waitFor(() => expect(run).toHaveBeenCalled())
      chat.dispose()
      expect(await running).toBeUndefined()
      expect(chat.getState().errors).toEqual({})
    })

    it.each([
      ['the list write', (key: string) => key === 'conversations'],
      ['the transcript write', (key: string) => key.startsWith('messages:')],
    ])('a run ending while %s is pending sends no queued message', async (_, keys) => {
      const held = heldRun()
      const store = gatedStore()
      const chat = new ChatController<Meta>({
        kv: store.kv,
        fetch: vi.fn(),
        resolveRun,
        run: held.run,
        queue: true,
      })
      const meta = await chat.createConversation({ endpoint: 'ok' })
      const running = chat.send(meta.id, 'go')
      await vi.waitFor(() => expect(held.run).toHaveBeenCalled())
      await chat.send(meta.id, 'queued')
      store.hold(keys)
      held.finish()
      await vi.waitFor(() => expect(chat.getState().runs).toEqual({}))
      chat.dispose()
      store.release()
      expect((await running)?.outcome).toBe('complete')
      await vi.runAllTimersAsync()
      expect(held.run).toHaveBeenCalledTimes(1)
      expect(chat.getState().queued[meta.id]).toHaveLength(1)
    })
  })

  describe('storage failures', () => {
    const stored = (id: string): Record<string, unknown> => ({
      conversations: [{ id, title: 'T', createdAt: 1, updatedAt: 1, endpoint: 'ok' }],
      [`messages:${id}`]: [
        { id: 'u1', role: 'user', blocks: [{ type: 'text', id: 't1', text: 'hi' }] },
      ],
    })

    it('send: a failed list write ends the run with an error, and a retry works', async () => {
      const held = heldRun()
      const store = flakyStore()
      const chat = new ChatController<Meta>({
        kv: store.kv,
        fetch: vi.fn(),
        resolveRun,
        run: held.run,
      })
      const meta = await chat.createConversation({ endpoint: 'ok' })
      store.broken.add('set:conversations')
      expect(await chat.send(meta.id, 'go')).toBeUndefined()
      expect(held.run).not.toHaveBeenCalled()
      expect(chat.getState().runs).toEqual({})
      expect(chat.stop(meta.id)).toBe(false)
      expect(chat.getState().errors[meta.id]?.message).toBe(
        'Could not save this conversation: set failed',
      )
      store.broken.clear()
      const again = chat.send(meta.id, 'again')
      await vi.waitFor(() => expect(held.run).toHaveBeenCalled())
      expect(chat.getState().errors[meta.id]).toBeUndefined()
      held.finish()
      expect((await again)?.outcome).toBe('complete')
    })

    it.each(['send', 'regenerate'] as const)(
      '%s: a failed transcript load is the conversation error',
      async (action) => {
        const { run } = heldRun()
        const store = flakyStore(stored('c1'))
        const chat = new ChatController<Meta>({ kv: store.kv, fetch: vi.fn(), resolveRun, run })
        await chat.load()
        store.broken.add('get:messages:')
        const result = action === 'send' ? chat.send('c1', 'x') : chat.regenerate('c1')
        expect(await result).toBeUndefined()
        expect(run).not.toHaveBeenCalled()
        expect(chat.getState().runs).toEqual({})
        expect(chat.getState().errors.c1?.message).toBe(
          'Could not load this conversation: get failed',
        )
      },
    )

    it('a transcript load failing after dispose records nothing', async () => {
      const store = gatedStore(stored('c1'))
      const chat = new ChatController<Meta>({ kv: store.kv, fetch: vi.fn(), resolveRun })
      await chat.load()
      store.hold((key) => key.startsWith('messages:'))
      const sending = chat.send('c1', 'x')
      chat.dispose()
      store.reject()
      expect(await sending).toBeUndefined()
      expect(chat.getState().errors).toEqual({})
    })

    it.each([
      ['list', 'set:conversations'],
      ['transcript', 'set:messages:'],
    ])('a failed %s write at run end is the error, and the queue waits', async (_, prefix) => {
      const held = heldRun()
      const store = flakyStore()
      const chat = new ChatController<Meta>({
        kv: store.kv,
        fetch: vi.fn(),
        resolveRun,
        run: held.run,
        queue: true,
      })
      const meta = await chat.createConversation({ endpoint: 'ok' })
      const running = chat.send(meta.id, 'go')
      await vi.waitFor(() => expect(held.run).toHaveBeenCalled())
      await chat.send(meta.id, 'queued')
      store.broken.add(prefix)
      held.finish()
      expect((await running)?.outcome).toBe('complete')
      expect(chat.getState().runs).toEqual({})
      expect(chat.getState().errors[meta.id]?.message).toBe(
        'Could not save this conversation: set failed',
      )
      expect(held.run).toHaveBeenCalledTimes(1)
      expect(chat.getState().queued[meta.id]).toHaveLength(1)
    })

    it('keeps a thrown run error over a later failed write', async () => {
      const run = vi.fn(async () => {
        throw new Error('agent broke')
      })
      const store = flakyStore()
      const chat = new ChatController<Meta>({ kv: store.kv, fetch: vi.fn(), resolveRun, run })
      const meta = await chat.createConversation({ endpoint: 'ok' })
      const running = chat.send(meta.id, 'go')
      store.broken.add('set:')
      expect(await running).toBeUndefined()
      expect(chat.getState().errors[meta.id]?.message).toBe('agent broke')
    })

    it('a run-end write failing after dispose records nothing', async () => {
      const held = heldRun()
      const store = gatedStore()
      const chat = new ChatController<Meta>({
        kv: store.kv,
        fetch: vi.fn(),
        resolveRun,
        run: held.run,
      })
      const meta = await chat.createConversation({ endpoint: 'ok' })
      const running = chat.send(meta.id, 'go')
      await vi.waitFor(() => expect(held.run).toHaveBeenCalled())
      store.hold((key) => key === 'conversations')
      held.finish()
      await vi.waitFor(() => expect(chat.getState().runs).toEqual({}))
      chat.dispose()
      store.reject()
      expect((await running)?.outcome).toBe('complete')
      expect(chat.getState().errors).toEqual({})
    })

    it('a failed debounced save is the conversation error', async () => {
      const store = flakyStore()
      const chat = new ChatController<Meta>({ kv: store.kv, fetch: vi.fn(), resolveRun })
      const meta = await chat.createConversation({ endpoint: 'ok' })
      store.broken.add('set:messages:')
      chat.clear(meta.id)
      await vi.runAllTimersAsync()
      expect(chat.getState().errors[meta.id]?.message).toBe(
        'Could not save this conversation: set failed',
      )
    })

    it('a save failing at dispose is swallowed', async () => {
      const store = flakyStore()
      const chat = new ChatController<Meta>({ kv: store.kv, fetch: vi.fn(), resolveRun })
      const meta = await chat.createConversation({ endpoint: 'ok' })
      chat.clear(meta.id)
      store.broken.add('set:messages:')
      chat.dispose()
      await vi.runAllTimersAsync()
      expect(chat.getState().errors).toEqual({})
    })

    it('a failed transcript delete still drops the conversation, then rejects', async () => {
      const store = flakyStore(stored('c1'))
      const chat = new ChatController<Meta>({ kv: store.kv, fetch: vi.fn(), resolveRun })
      await chat.load()
      store.broken.add('delete:')
      await expect(chat.deleteConversation('c1')).rejects.toThrow('delete failed')
      expect(chat.getState().conversations).toEqual([])
      expect(store.inner.data.get('conversations')).toEqual([])
    })

    it('direct calls reject to the caller and can be retried', async () => {
      const store = flakyStore(stored('c1'))
      const chat = new ChatController<Meta>({ kv: store.kv, fetch: vi.fn(), resolveRun })
      store.broken.add('get:')
      await expect(chat.load()).rejects.toThrow('get failed')
      await expect(chat.openConversation('c1')).rejects.toThrow('get failed')
      expect(chat.getState().loaded).toBe(false)
      expect(chat.getState().messages.c1).toBeUndefined()
      store.broken.clear()
      await chat.load()
      await chat.openConversation('c1')
      expect(chat.getState().messages.c1).toHaveLength(1)
      store.broken.add('set:')
      await expect(chat.createConversation({ endpoint: 'ok' })).rejects.toThrow('set failed')
      await expect(chat.flush('c1')).rejects.toThrow('set failed')
      expect(chat.getState().conversations).toHaveLength(2)
    })
  })

  describe('host callbacks that throw', () => {
    it.each(['send', 'regenerate'] as const)(
      '%s: a throwing resolveRun is the conversation error',
      async (action) => {
        const { run } = heldRun()
        const transcript: ChatMessage[] = [
          { id: 'u1', role: 'user', blocks: [{ type: 'text', id: 't1', text: 'q' }] },
        ]
        const resolveRun = () => {
          throw new Error('no config')
        }
        const { chat } = setup(
          [],
          {
            conversations: [{ id: 'c1', title: 'C', createdAt: 1, updatedAt: 1 }],
            'messages:c1': transcript,
          },
          { run, resolveRun },
        )
        await chat.load()
        const result = action === 'send' ? chat.send('c1', 'x') : chat.regenerate('c1')
        expect(await result).toBeUndefined()
        expect(chat.getState().errors.c1?.message).toBe('Could not start this run: no config')
        expect(chat.getState().messages.c1).toEqual(transcript)
        expect(chat.getState().runs).toEqual({})
        expect(run).not.toHaveBeenCalled()
      },
    )

    it('a resolveRun answering a promise is an error, and its rejection is handled', async () => {
      const { run } = heldRun()
      const asyncResolve = (() => Promise.reject(new Error('later'))) as never
      const { chat } = setup([], {}, { run, resolveRun: asyncResolve })
      const meta = await chat.createConversation()
      expect(await chat.send(meta.id, 'x')).toBeUndefined()
      await vi.runAllTimersAsync()
      expect(chat.getState().errors[meta.id]?.message).toBe(
        'Could not start this run: resolveRun must answer synchronously',
      )
      expect(run).not.toHaveBeenCalled()
    })

    it('a queued send whose resolveRun throws is recorded, not unhandled', async () => {
      const held = heldRun()
      let calls = 0
      const resolveOnce = () => {
        calls++
        if (calls > 1) throw new Error('gone')
        return config
      }
      const { chat } = setup([], {}, { run: held.run, resolveRun: resolveOnce, queue: true })
      const meta = await chat.createConversation()
      const running = chat.send(meta.id, 'go')
      await vi.waitFor(() => expect(held.run).toHaveBeenCalled())
      await chat.send(meta.id, 'queued')
      held.finish()
      await running
      await vi.runAllTimersAsync()
      expect(chat.getState().errors[meta.id]?.message).toBe('Could not start this run: gone')
      expect(held.run).toHaveBeenCalledTimes(1)
      expect(chat.getState().runs).toEqual({})
    })

    it.each([
      [
        'throws synchronously',
        () => {
          throw new Error('sync boom')
        },
      ],
      ['rejects', () => Promise.reject(new Error('sync boom'))],
    ])('a run that %s ends with its error', async (_, run) => {
      const { chat } = setup([], {}, { run: run as never })
      const meta = await chat.createConversation({ endpoint: 'ok' })
      expect(await chat.send(meta.id, 'x')).toBeUndefined()
      expect(chat.getState().errors[meta.id]?.message).toBe('sync boom')
      expect(chat.getState().runs).toEqual({})
    })

    it('a throwing listener neither stops the others nor the controller', async () => {
      const thrown: unknown[] = []
      vi.stubGlobal('queueMicrotask', (task: () => void) => {
        try {
          task()
        } catch (error) {
          thrown.push(error)
        }
      })
      try {
        const held = heldRun()
        const { chat } = setup([], {}, { run: held.run })
        const seen = vi.fn()
        chat.subscribe(() => {
          throw new Error('listener broke')
        })
        chat.subscribe(seen)
        const meta = await chat.createConversation({ endpoint: 'ok' })
        const running = chat.send(meta.id, 'go')
        await vi.waitFor(() => expect(held.run).toHaveBeenCalled())
        held.finish()
        expect((await running)?.outcome).toBe('complete')
        expect(chat.getState().runs).toEqual({})
        expect(seen).toHaveBeenCalled()
        expect(thrown.length).toBeGreaterThan(0)
        expect((thrown[0] as Error).message).toBe('listener broke')
      } finally {
        vi.unstubAllGlobals()
      }
    })
  })
})
