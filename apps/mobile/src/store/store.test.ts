import type { ChatMessage } from '@fx/chat-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { memoryStore } from '../platform/storage'
import { fakeEndpoint, sseBody } from '../test-helpers'
import { AppStore, newId, titleFrom } from './store'
import type { Profile } from './types'

const profile: Profile = {
  id: 'p1',
  name: 'Fake',
  baseUrl: 'https://fake.test/v1',
  apiKey: 'sk-1',
  model: 'fake-1',
}

async function ready(completions: string[] = [], kvInit: Record<string, unknown> = {}) {
  const kv = memoryStore(kvInit)
  const endpoint = fakeEndpoint(completions)
  const store = new AppStore({ kv, fetch: endpoint.fetch })
  await store.load()
  return { store, kv, endpoint }
}

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

describe('AppStore', () => {
  it('loads defaults and merges stored settings', async () => {
    const { store } = await ready([], {
      settings: { profiles: [profile], systemPrompt: 'hi', tools: { fetch_url: true } },
      conversations: [
        { id: 'a', title: 'A', createdAt: 1, updatedAt: 1 },
        { id: 'b', title: 'B', createdAt: 2, updatedAt: 2 },
      ],
    })
    const state = store.getState()
    expect(state.loaded).toBe(true)
    expect(state.settings.tools).toEqual({ current_time: true, calculator: true, fetch_url: true })
    expect(state.settings.approvals.fetch_url).toBe(true)
    expect(state.conversations.map((c) => c.id)).toEqual(['b', 'a'])
    expect(store.activeProfile()).toEqual(profile)
  })

  it('manages profiles and the active profile', async () => {
    const { store, kv } = await ready()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    await store.saveProfile(profile)
    await store.saveProfile({ ...profile, id: 'p2', name: 'Two' })
    await store.saveProfile({ ...profile, name: 'Renamed' })
    expect(store.getState().settings.activeProfileId).toBe('p1')
    expect(store.getState().settings.profiles.map((p) => p.name)).toEqual(['Renamed', 'Two'])
    await store.deleteProfile('p2')
    expect(store.getState().settings.activeProfileId).toBe('p1')
    await store.deleteProfile('p1')
    expect(store.getState().settings.activeProfileId).toBeUndefined()
    expect(store.activeProfile()).toBeUndefined()
    expect(listener).toHaveBeenCalled()
    unsubscribe()
    expect((kv.data.get('settings') as { profiles: unknown[] }).profiles).toEqual([])
  })

  it('lists models through the injected fetch with the key', async () => {
    const { store, endpoint } = await ready()
    expect(await store.listModels(profile)).toEqual(['fake-1', 'fake-2'])
    expect(endpoint.requests[0]?.headers.get('authorization')).toBe('Bearer sk-1')
    await store.listModels({ ...profile, apiKey: '' })
    expect(endpoint.requests[1]?.headers.get('authorization')).toBeNull()
  })

  it('creates, renames and deletes conversations', async () => {
    const { store, kv } = await ready([], { settings: { profiles: [profile] } })
    const meta = await store.createConversation()
    expect(meta).toMatchObject({ title: 'New chat', profileId: 'p1', model: 'fake-1' })
    await store.updateConversation(meta.id, { title: 'Renamed' })
    expect(store.conversation(meta.id)?.title).toBe('Renamed')
    kv.data.set(`messages:${meta.id}`, [])
    await store.deleteConversation(meta.id)
    expect(store.getState().conversations).toEqual([])
    expect(kv.data.has(`messages:${meta.id}`)).toBe(false)
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
    const { store } = await ready([], { 'messages:c1': stored })
    await store.openConversation('c1')
    const [first, second] = store.getState().messages.c1 ?? []
    expect(first?.blocks.map((b) => (b as { status: string }).status)).toEqual([
      'error',
      'error',
      'success',
    ])
    expect((first?.blocks[0] as { result: unknown }).result).toEqual({ error: 'Interrupted.' })
    expect((first?.blocks[1] as { result: unknown }).result).toBe('kept')
    expect(second).toBe(stored[1] === second ? second : second)
    await store.openConversation('c1')
    await store.openConversation('empty')
    expect(store.getState().messages.empty).toEqual([])
  })

  it('sends a message, streams the answer, titles the chat and persists it', async () => {
    const { store, kv, endpoint } = await ready(
      [sseBody([{ reasoning_content: 'hmm' }, { content: 'Hello!' }])],
      { settings: { profiles: [profile], systemPrompt: 'Be nice.' } },
    )
    const meta = await store.createConversation()
    const result = await store.send(meta.id, 'Hi there', [
      { url: 'data:image/png;base64,AA', mediaType: 'image/png', kind: 'image' },
    ])
    expect(result?.outcome).toBe('complete')
    const messages = store.getState().messages[meta.id] ?? []
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(messages[0]?.attachments).toHaveLength(1)
    expect(messages[1]?.blocks.map((b) => b.type)).toEqual(['reasoning', 'text'])
    expect(store.conversation(meta.id)?.title).toBe('Hi there')
    expect(store.getState().runs[meta.id]).toBeUndefined()
    expect(kv.data.get(`messages:${meta.id}`)).toEqual(messages)
    const body = endpoint.requests.at(-1)?.body as {
      messages: Array<{ role: string }>
      tools: unknown[]
    }
    expect(body.messages[0]).toEqual({ role: 'system', content: 'Be nice.' })
    expect(body.tools).toHaveLength(2)
  })

  it('ignores sends to unknown conversations and while a run is active', async () => {
    let finish: (value: unknown) => void = () => {}
    const run = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const store = new AppStore({
      kv: memoryStore({ settings: { profiles: [profile] } }),
      fetch: vi.fn(),
      run: run as never,
    })
    await store.load()
    expect(await store.send('missing', 'hi')).toBeUndefined()
    const meta = await store.createConversation()
    const first = store.send(meta.id, 'one')
    await vi.waitFor(() => expect(store.getState().runs[meta.id]).toBeDefined())
    expect(await store.send(meta.id, 'two')).toBeUndefined()
    expect(await store.regenerate(meta.id)).toBeUndefined()
    finish({ outcome: 'complete', message: { id: 'a', role: 'assistant', blocks: [] } })
    await first
    expect(store.conversation(meta.id)?.title).toBe('one')
    expect(store.getState().runs[meta.id]).toBeUndefined()
  })

  it('keeps run errors on the message outcome, not in the store', async () => {
    const { store } = await ready([], { settings: { profiles: [profile] } })
    const meta = await store.createConversation()
    const result = await store.send(meta.id, 'hi')
    expect(result?.outcome).toBe('error')
    expect(store.getState().messages[meta.id]?.at(-1)?.outcome).toEqual({
      kind: 'error',
      message: 'HTTP 500: no more',
      retryable: true,
    })
    expect(store.getState().errors[meta.id]).toBeUndefined()
  })

  it('reports a missing profile or model instead of running', async () => {
    const { store } = await ready()
    const meta = await store.createConversation()
    expect(await store.send(meta.id, 'hi')).toBeUndefined()
    expect(store.getState().errors[meta.id]?.message).toMatch(/Set up an endpoint/)
  })

  it("never sends a conversation to another profile's endpoint", async () => {
    const other: Profile = { ...profile, id: 'p2', baseUrl: 'https://other.test/v1' }
    const { store, endpoint } = await ready([sseBody([{ content: 'a' }])], {
      settings: { profiles: [profile, other], activeProfileId: 'p1' },
    })
    const meta = await store.createConversation()
    await store.send(meta.id, 'q')
    const transcript = store.getState().messages[meta.id]
    expect(transcript).toHaveLength(2)
    await store.updateSettings({ activeProfileId: 'p2' })
    await store.deleteProfile('p1')
    const sent = endpoint.requests.length

    expect(store.conversationProfile({ ...meta, profileId: 'p1' })).toBeUndefined()
    expect(await store.regenerate(meta.id)).toBeUndefined()
    expect(await store.send(meta.id, 'again')).toBeUndefined()
    expect(endpoint.requests).toHaveLength(sent)
    // The blocked regenerate kept the answer it would have replaced.
    expect(store.getState().messages[meta.id]).toEqual(transcript)
    expect(store.getState().errors[meta.id]?.message).toMatch(/profile is unavailable/)

    // An explicit re-bind is the only way back to a working conversation.
    await store.updateConversation(meta.id, { profileId: 'p2', model: 'fake-2' })
    await store.regenerate(meta.id)
    expect(endpoint.requests.at(-1)?.url).toBe('https://other.test/v1/chat/completions')
    expect(store.getState().errors[meta.id]).toBeUndefined()
  })

  it('asks for a profile when a conversation was never bound to one', async () => {
    const { store, endpoint } = await ready([], {
      settings: { profiles: [profile] },
      conversations: [{ id: 'c1', title: 'Old', createdAt: 1, updatedAt: 1, model: 'fake-1' }],
    })
    expect(await store.send('c1', 'hi')).toBeUndefined()
    expect(endpoint.requests).toHaveLength(0)
    expect(store.getState().errors.c1?.message).toMatch(/Choose a profile/)
  })

  it('regenerates the last turn or a given assistant message', async () => {
    const { store } = await ready(
      [
        sseBody([{ content: 'first' }]),
        sseBody([{ content: 'second' }]),
        sseBody([{ content: 'third' }]),
      ],
      { settings: { profiles: [profile] } },
    )
    const meta = await store.createConversation()
    await store.send(meta.id, 'q')
    await store.regenerate(meta.id)
    let messages = store.getState().messages[meta.id] ?? []
    expect(messages).toHaveLength(2)
    expect((messages[1]?.blocks[0] as { text: string }).text).toBe('second')
    await store.regenerate(meta.id, messages[1]?.id)
    messages = store.getState().messages[meta.id] ?? []
    expect((messages[1]?.blocks[0] as { text: string }).text).toBe('third')
  })

  it('does not regenerate when no user message precedes', async () => {
    const { store } = await ready([], { settings: { profiles: [profile] } })
    const meta = await store.createConversation()
    expect(await store.regenerate(meta.id)).toBeUndefined()
  })

  it('stops a run and resolves pending approvals as denied', async () => {
    const { store } = await ready(
      [
        sseBody(
          [
            {
              tool_calls: [
                {
                  index: 0,
                  id: 'c1',
                  function: { name: 'fetch_url', arguments: '{"url":"https://x.test"}' },
                },
              ],
            },
          ],
          'tool_calls',
        ),
      ],
      { settings: { profiles: [profile], tools: { fetch_url: true } } },
    )
    const meta = await store.createConversation()
    const running = store.send(meta.id, 'fetch it')
    await vi.waitFor(() => expect(store.getState().approvals).toHaveLength(1))
    expect(store.getState().approvals[0]?.call.name).toBe('fetch_url')
    store.stop(meta.id)
    const result = await running
    expect(result?.outcome).toBe('aborted')
    expect(store.getState().approvals).toEqual([])
  })

  it('keeps a conversation deleted while its run ends', async () => {
    const { store, kv } = await ready(
      [
        sseBody(
          [
            {
              tool_calls: [
                {
                  index: 0,
                  id: 'c1',
                  function: { name: 'fetch_url', arguments: '{"url":"https://x.test"}' },
                },
              ],
            },
          ],
          'tool_calls',
        ),
      ],
      { settings: { profiles: [profile], tools: { fetch_url: true } } },
    )
    const meta = await store.createConversation()
    const running = store.send(meta.id, 'fetch it')
    await vi.waitFor(() => expect(store.getState().approvals).toHaveLength(1))
    await store.deleteConversation(meta.id)
    expect((await running)?.outcome).toBe('aborted')
    await vi.runAllTimersAsync()
    await store.flush(meta.id)
    await store.openConversation(meta.id)
    const state = store.getState()
    expect(state.messages[meta.id]).toBeUndefined()
    expect(state.runs[meta.id]).toBeUndefined()
    expect(state.conversations.some((c) => c.id === meta.id)).toBe(false)
    expect(kv.data.has(`messages:${meta.id}`)).toBe(false)
    expect((kv.data.get('conversations') as { id: string }[]).some((c) => c.id === meta.id)).toBe(
      false,
    )
  })

  it('does not start a run for a conversation deleted mid-send', async () => {
    const { store, kv, endpoint } = await ready([sseBody([{ content: 'hi' }])], {
      settings: { profiles: [profile] },
    })
    const meta = await store.createConversation()
    const sending = store.send(meta.id, 'hi')
    const deleting = store.deleteConversation(meta.id)
    expect(await sending).toBeUndefined()
    await deleting
    await vi.runAllTimersAsync()
    expect(endpoint.requests).toHaveLength(0)
    expect(store.getState().messages[meta.id]).toBeUndefined()
    expect(kv.data.has(`messages:${meta.id}`)).toBe(false)
  })

  it('runs an approved tool and continues', async () => {
    const { store, endpoint } = await ready(
      [
        sseBody(
          [
            {
              tool_calls: [
                {
                  index: 0,
                  id: 'c1',
                  function: { name: 'fetch_url', arguments: '{"url":"https://x.test/"}' },
                },
              ],
            },
          ],
          'tool_calls',
        ),
        sseBody([{ content: 'done' }]),
      ],
      { settings: { profiles: [profile], tools: { fetch_url: true } } },
    )
    const meta = await store.createConversation()
    const running = store.send(meta.id, 'fetch it')
    await vi.waitFor(() => expect(store.getState().approvals).toHaveLength(1))
    store.getState().approvals[0]?.resolve(true)
    expect((await running)?.outcome).toBe('complete')
    expect(endpoint.requests.some((r) => r.url === 'https://x.test/')).toBe(true)
  })

  it('debounces transcript writes and flushes on demand', async () => {
    const { store, kv } = await ready([], { settings: { profiles: [profile] } })
    const meta = await store.createConversation()
    await store.send(meta.id, 'hi')
    kv.data.delete(`messages:${meta.id}`)
    await store.flush(meta.id)
    expect(kv.data.has(`messages:${meta.id}`)).toBe(true)
    await store.flush('unknown')
    expect(kv.data.has('messages:unknown')).toBe(false)
  })
})
