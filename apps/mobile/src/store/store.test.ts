import { memoryStore } from '@fx/chat-agent'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeEndpoint, sseBody } from '../test-helpers'
import { AppStore } from './store'
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

  it('runs the assistant on its own model, else on the active endpoint', async () => {
    const { store } = await ready()
    expect(store.assistantModel()).toBeUndefined()
    await store.saveProfile(profile)
    await store.saveProfile({ ...profile, id: 'p2', model: 'm2' })
    expect(store.assistantModel()).toEqual({ profile, model: profile.model })
    await store.updateSettings({ assistant: { profileId: 'p2' } })
    expect(store.assistantModel()?.model).toBe('m2')
    await store.setAssistantModel({ profileId: 'p1', model: profile.model })
    expect(store.getState().settings.assistant).toEqual({})
    expect(store.assistantMatchesNewChats()).toBe(true)
    await store.setAssistantModel({ profileId: 'p2', model: 'm3' })
    expect(store.assistantMatchesNewChats()).toBe(false)
    expect(await store.createAssistantConversation()).toMatchObject({
      profileId: 'p2',
      model: 'm3',
    })
    // Deleting its endpoint puts it back on the active one.
    await store.deleteProfile('p2')
    expect(store.getState().settings.assistant).toEqual({})
    await store.deleteProfile('p1')
    expect(await store.createAssistantConversation()).toMatchObject({ profileId: undefined })
  })

  it('runs the assistant on the active endpoint when its stored endpoint is gone', async () => {
    const kv = memoryStore({
      settings: { profiles: [profile], assistant: { profileId: 'gone', model: 'm9' } },
    })
    const store = new AppStore({ kv, fetch: fakeEndpoint([]).fetch })
    await store.load()
    expect(store.assistantModel()).toEqual({ profile, model: profile.model })
    expect(await store.createAssistantConversation()).toMatchObject({
      profileId: profile.id,
      model: profile.model,
    })
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

  it('reports a missing profile or model instead of running', async () => {
    const { store } = await ready()
    const meta = await store.createConversation()
    expect(await store.send(meta.id, 'hi')).toBeUndefined()
    expect(store.getState().errors[meta.id]?.message).toMatch(/Set up an endpoint/)
    await store.saveProfile({ ...profile, model: '' })
    const unset = await store.createConversation()
    expect(await store.send(unset.id, 'hi')).toBeUndefined()
    expect(store.getState().errors[unset.id]?.message).toMatch(/Choose a model/)
  })

  it('is loaded only once both settings and conversations are read', async () => {
    const store = new AppStore({ kv: memoryStore(), fetch: vi.fn() })
    const states: boolean[] = []
    store.subscribe(() => states.push(store.getState().loaded))
    await store.load()
    expect(states.at(0)).toBe(false)
    expect(states.at(-1)).toBe(true)
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
})
