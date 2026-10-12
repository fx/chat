import { memoryStore } from '@fx/chat-agent'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { App } from './App'
import { StoreProvider } from './store/context'
import { AppStore } from './store/store'
import { fakeEndpoint, sseBody } from './test-helpers'

function setup(completions: string[], kvInit: Record<string, unknown> = {}) {
  const endpoint = fakeEndpoint(completions)
  const store = new AppStore({ kv: memoryStore(kvInit), fetch: endpoint.fetch })
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
    expect(screen.getByText('Choose a profile for this conversation.')).toBeTruthy()
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
    expect(screen.getByText('Endpoints')).toBeTruthy()
    await user.click(screen.getByRole('switch', { name: /Fetch web page/ }))
    expect(store.getState().settings.tools.fetch_url).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await user.click(screen.getByText('Old chat'))
    expect(await screen.findByRole('button', { name: 'Change model' })).toBeTruthy()
  })
})
