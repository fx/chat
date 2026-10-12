import { memoryStore } from '@fx/chat-agent'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App, parentRoute } from './App'
import { StoreProvider } from './store/context'
import { AppStore } from './store/store'
import { fakeEndpoint, sseBody } from './test-helpers'

function setup(
  completions: string[],
  kvInit: Record<string, unknown> = {},
  failWrites: (key: string) => boolean = () => false,
) {
  const endpoint = fakeEndpoint(completions)
  const memory = memoryStore(kvInit)
  const kv = {
    ...memory,
    set: (key: string, value: unknown) =>
      failWrites(key) ? Promise.reject(new Error('disk full')) : memory.set(key, value),
  }
  const store = new AppStore({ kv, fetch: endpoint.fetch })
  const view = render(
    <StoreProvider store={store}>
      <App />
    </StoreProvider>,
  )
  return { store, endpoint, view }
}

const profile = {
  id: 'p1',
  name: 'Fake',
  baseUrl: 'https://fake.test/v1',
  apiKey: '',
  model: 'fake-1',
}

describe('App', () => {
  it('walks first-launch setup into a chat and streams an answer', async () => {
    const user = userEvent.setup()
    const { store, endpoint } = setup([
      sseBody([{ reasoning_content: 'Let me think.' }, { content: 'Hello **there**' }]),
    ])
    await act(() => store.load())

    expect(screen.getByText('Connect a model')).toBeTruthy()
    await user.type(screen.getByLabelText('Base URL'), 'https://fake.test/v1/')
    await user.click(screen.getByRole('button', { name: 'Load models' }))
    await waitFor(() => expect(screen.getByText('2 models available')).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const textbox = await screen.findByRole('textbox', { name: 'Message' })
    await user.type(textbox, 'Hi{Enter}')

    await waitFor(() => expect(screen.getByText('there')).toBeTruthy())
    expect(screen.getAllByText('Hi').length).toBeGreaterThan(0)
    const saved = store.getState().settings.profiles[0]
    expect(saved).toMatchObject({
      baseUrl: 'https://fake.test/v1',
      model: 'fake-1',
      name: 'fake.test',
    })
    expect(endpoint.requests.at(-1)?.url).toBe('https://fake.test/v1/chat/completions')
  })

  it('shows run errors inline with a retry that re-runs the turn', async () => {
    const user = userEvent.setup()
    const { store } = setup([], { settings: { profiles: [profile] } })
    await act(() => store.load())
    await user.click(screen.getByRole('button', { name: /New chat/ }))
    const textbox = await screen.findByRole('textbox', { name: 'Message' })
    await user.type(textbox, 'Hi{Enter}')
    // The failure is the message's own outcome row; the footer's regenerate
    // action retries the turn.
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('HTTP 500: no more')
    // The last answer's footer always shows.
    await user.click(screen.getByRole('button', { name: 'Regenerate' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('HTTP 500'))
  })

  it("withholds regenerate when a conversation's profile is gone, until re-bound", async () => {
    const user = userEvent.setup()
    const other = { ...profile, id: 'p2', name: 'Other', baseUrl: 'https://other.test/v1' }
    const { store, endpoint } = setup([sseBody([{ content: 'answer' }])], {
      settings: { profiles: [profile, other], activeProfileId: 'p2' },
      conversations: [
        { id: 'c1', title: 'Old chat', createdAt: 1, updatedAt: 1, profileId: 'gone' },
      ],
      'messages:c1': [
        {
          id: 'u1',
          role: 'user',
          blocks: [{ type: 'text', id: 't1', text: 'secret' }],
          createdAt: 1,
        },
        {
          id: 'a1',
          role: 'assistant',
          blocks: [{ type: 'text', id: 't2', text: 'reply' }],
          createdAt: 2,
        },
      ],
    })
    await act(() => store.load())
    await user.click(screen.getByText('Old chat'))
    const textbox = await screen.findByPlaceholderText(/profile is unavailable/)
    expect((textbox as HTMLTextAreaElement).disabled).toBe(true)
    await user.click(await screen.findByText('reply'))
    expect(screen.queryByRole('button', { name: 'Regenerate' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Change model' }))
    expect(screen.getByText('Choose an endpoint.')).toBeTruthy()
    expect(endpoint.requests).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Other' }))
    expect(store.conversation('c1')).toMatchObject({ profileId: 'p2', model: 'fake-1' })
    // Still selected from the tap above: its footer now offers regenerate.
    await user.click(await screen.findByRole('button', { name: 'Regenerate' }))
    await waitFor(() => expect(screen.getByText('answer')).toBeTruthy())
    expect(endpoint.requests.at(-1)?.url).toBe('https://other.test/v1/chat/completions')
  })

  it('lists conversations, opens settings, and navigates back', async () => {
    const user = userEvent.setup()
    const { store } = setup([], {
      settings: { profiles: [profile] },
      conversations: [{ id: 'c1', title: 'Old chat', createdAt: 1, updatedAt: 1, model: 'fake-1' }],
    })
    await act(() => store.load())
    expect(screen.getByText('Old chat')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    const menu = screen.getByRole('navigation', { name: 'Settings' })
    expect(within(menu).getByRole('button', { name: /Endpoints Fake · fake-1/ })).toBeTruthy()
    await user.click(within(menu).getByRole('button', { name: /Tools 2 of 3 on/ }))
    await user.click(screen.getByRole('switch', { name: /Fetch web page/ }))
    expect(store.getState().settings.tools.fetch_url).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await user.click(screen.getByRole('button', { name: /Tools 3 of 3 on/ }))
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await user.click(screen.getByRole('button', { name: /Endpoints/ }))
    await user.click(screen.getByRole('button', { name: /^Fake fake-1/ }))
    expect(screen.getByRole('heading', { name: 'Edit endpoint' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await user.click(screen.getByRole('button', { name: 'Add endpoint' }))
    expect(screen.getByRole('heading', { name: 'Add endpoint' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))
    for (const page of ['System prompt', 'About']) {
      await user.click(screen.getByRole('button', { name: new RegExp(`^${page}`) }))
      expect(screen.getByRole('heading', { name: page })).toBeTruthy()
      await user.click(screen.getByRole('button', { name: 'Back' }))
    }
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await user.click(screen.getByText('Old chat'))
    expect(await screen.findByRole('button', { name: 'Change model' })).toBeTruthy()
  })

  it('starts a new chat with a prompt spoken to it as the assistant', async () => {
    const parked: (string | null)[] = []
    const w = window as { FxAssist?: unknown }
    w.FxAssist = { takePrompt: () => parked.shift() ?? null }
    try {
      const { store, endpoint } = setup([sseBody([{ content: 'It is noon.' }])], {
        settings: { profiles: [profile] },
      })
      await act(() => store.load())
      parked.push('what time is it')
      act(() => {
        window.dispatchEvent(new Event('fx-assist'))
      })
      await waitFor(() => expect(screen.getByText('It is noon.')).toBeTruthy())
      expect(screen.getAllByText('what time is it').length).toBeGreaterThan(0)
      expect(store.getState().conversations).toHaveLength(1)
      expect(endpoint.requests).toHaveLength(1)
    } finally {
      w.FxAssist = undefined
    }
  })

  it('shows a spoken prompt that could not start a chat, until dismissed', async () => {
    const user = userEvent.setup()
    const parked: (string | null)[] = []
    const w = window as { FxAssist?: unknown }
    w.FxAssist = { takePrompt: () => parked.shift() ?? null }
    try {
      const { store, endpoint } = setup(
        [],
        { settings: { profiles: [profile] } },
        (key) => key === 'conversations',
      )
      await act(() => store.load())
      parked.push('what time is it')
      act(() => {
        window.dispatchEvent(new Event('fx-assist'))
      })
      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain('“what time is it”: disk full')
      expect(endpoint.requests).toHaveLength(0)
      await user.click(within(alert).getByRole('button', { name: 'Dismiss' }))
      expect(screen.queryByRole('alert')).toBeNull()
    } finally {
      w.FxAssist = undefined
    }
  })

  it('says when the assistant model could not be saved', async () => {
    const user = userEvent.setup()
    let fail = false
    const { store } = setup([], { settings: { profiles: [profile] } }, (key) =>
      fail ? key === 'settings' : false,
    )
    await act(() => store.load())
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: /Assistant Fake · fake-1/ }))
    fail = true
    await user.click(screen.getByRole('switch', { name: /Same as new chats/ }))
    expect((await screen.findByRole('alert')).textContent).toBe(
      "Couldn't save the assistant model: disk full",
    )
    // A later save clears it.
    fail = false
    await user.click(await screen.findByRole('button', { name: 'fake-2' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    expect(store.getState().settings.assistant).toEqual({ profileId: 'p1', model: 'fake-2' })
  })

  it('sets the assistant model, and runs spoken prompts on it', async () => {
    const user = userEvent.setup()
    const parked: (string | null)[] = []
    const openSettings = vi.fn()
    let held = false
    const w = window as { FxAssist?: unknown }
    w.FxAssist = {
      takePrompt: () => parked.shift() ?? null,
      isAssistant: () => held,
      openAssistantSettings: openSettings,
    }
    try {
      const other = { ...profile, id: 'p2', name: 'Other', baseUrl: 'https://other.test/v1' }
      const { store, endpoint } = setup([sseBody([{ content: 'Sure.' }])], {
        settings: { profiles: [profile, other] },
      })
      await act(() => store.load())
      await user.click(screen.getByRole('button', { name: 'Settings' }))
      await user.click(screen.getByRole('button', { name: /Assistant Fake · fake-1/ }))
      expect(screen.getByText(/Make this app your digital assistant/)).toBeTruthy()
      await user.click(screen.getByRole('button', { name: 'Choose assistant app' }))
      expect(openSettings).toHaveBeenCalledOnce()
      held = true
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      expect(screen.getByRole('button', { name: 'Change assistant app' })).toBeTruthy()

      await user.click(screen.getByRole('switch', { name: /Same as new chats/ }))
      expect(store.getState().settings.assistant).toEqual({ profileId: 'p1', model: 'fake-1' })
      await user.click(screen.getByRole('button', { name: 'Other' }))
      await user.click(await screen.findByRole('button', { name: 'fake-2' }))
      expect(store.getState().settings.assistant).toEqual({ profileId: 'p2', model: 'fake-2' })

      parked.push('hello')
      act(() => {
        window.dispatchEvent(new Event('fx-assist'))
      })
      await waitFor(() => expect(screen.getByText('Sure.')).toBeTruthy())
      expect(store.getState().conversations[0]).toMatchObject({ profileId: 'p2', model: 'fake-2' })
      expect(endpoint.requests.at(-1)?.url).toBe('https://other.test/v1/chat/completions')
    } finally {
      w.FxAssist = undefined
    }
  })

  it('goes back up the settings menu with the Android back action', () => {
    expect(parentRoute({ name: 'settings', path: ['endpoints', 'p1'] })).toEqual({
      name: 'settings',
      path: ['endpoints'],
    })
    expect(parentRoute({ name: 'settings', path: ['tools'] })).toEqual({
      name: 'settings',
      path: [],
    })
    expect(parentRoute({ name: 'settings', path: [] })).toEqual({ name: 'list' })
    expect(parentRoute({ name: 'chat', id: 'c1' })).toEqual({ name: 'list' })
  })
})
