import { memoryStore } from '@fx/chat-agent'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StoreProvider } from '../store/context'
import { AppStore } from '../store/store'
import type { Profile } from '../store/types'
import { fakeEndpoint } from '../test-helpers'
import { ModelPicker } from './ModelPicker'

const profile: Profile = {
  id: 'p1',
  name: 'Fake',
  baseUrl: 'https://fake.test/v1',
  apiKey: '',
  model: 'fake-1',
}

const listing = [
  {
    id: 'openrouter/acme/vision',
    name: 'Acme Vision',
    context_length: 131072,
    architecture: { input_modalities: ['text', 'image'] },
    supported_parameters: ['tools'],
  },
  { id: 'openrouter/acme/plain', supported_parameters: ['temperature'] },
  { id: 'llama', owned_by: 'llamacpp' },
]

async function setup(fetch = fakeEndpoint([], listing).fetch, profiles = [profile]) {
  const store = new AppStore({ kv: memoryStore({ settings: { profiles } }), fetch })
  await store.load()
  const onChoose = vi.fn()
  render(
    <StoreProvider store={store}>
      <ModelPicker profile={profiles[0]} model="llama" onChoose={onChoose} />
    </StoreProvider>,
  )
  return { onChoose }
}

const rows = () =>
  within(screen.getByRole('list', { name: 'Models' }))
    .getAllByRole('button')
    .map((b) => b.textContent)

describe('ModelPicker', () => {
  it('lists models by name with their facts and capabilities, the current one pressed', async () => {
    await setup()
    expect(await screen.findByRole('searchbox', { name: 'Search models' })).toHaveAttribute(
      'placeholder',
      'Search 3 models',
    )
    expect(rows()).toEqual([
      'llama',
      'openrouter/acme/plain',
      'Acme Visionopenrouter/acme/vision · 131K',
    ])
    expect(screen.getByRole('img', { name: 'Tools' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'llama' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('searches, filters by capability and provider, and picks', async () => {
    const user = userEvent.setup()
    const { onChoose } = await setup()
    const search = await screen.findByRole('searchbox', { name: 'Search models' })
    await user.type(search, 'acme')
    expect(rows()).toHaveLength(2)
    expect(screen.getByText('2 of 3')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Tools' }))
    expect(rows()).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Tools' }))
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    const filters = screen.getByRole('group', { name: 'Filters' })
    await user.click(within(filters).getByRole('button', { name: 'llamacpp' }))
    expect(rows()).toEqual(['llama'])
    await user.click(within(filters).getByRole('button', { name: 'llamacpp' }))
    await user.type(search, 'nothing')
    expect(screen.getByText('No models match.')).toBeTruthy()
    await user.clear(search)
    await user.click(screen.getByRole('button', { name: /^Acme Vision/ }))
    expect(onChoose).toHaveBeenCalledWith({ profileId: 'p1', model: 'openrouter/acme/vision' })
  })

  it('tucks typing an id away, and uses it', async () => {
    const user = userEvent.setup()
    const { onChoose } = await setup()
    await screen.findByRole('list', { name: 'Models' })
    expect(screen.queryByRole('textbox', { name: 'Model id' })).toBeNull()
    await user.click(screen.getByRole('button', { name: /isn’t listed/ }))
    await user.click(screen.getByRole('button', { name: 'Use' }))
    expect(onChoose).not.toHaveBeenCalled()
    await user.type(screen.getByRole('textbox', { name: 'Model id' }), ' custom {Enter}')
    expect(onChoose).toHaveBeenCalledWith({ profileId: 'p1', model: 'custom' })
  })

  it('offers typing an id up front when there is no list', async () => {
    await setup(fakeEndpoint([], []).fetch)
    expect(await screen.findByText('The endpoint lists no models.')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Model id' })).toBeTruthy()
    expect(screen.queryByRole('searchbox')).toBeNull()
  })

  it('shows a listing failure with the id field', async () => {
    await setup(async () => Response.json({ error: { message: 'nope' } }, { status: 401 }))
    expect(await screen.findByText(/nope/)).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Model id' })).toBeTruthy()
  })

  it('asks for an endpoint when there is none chosen', async () => {
    const store = new AppStore({
      kv: memoryStore({ settings: { profiles: [profile] } }),
      fetch: fakeEndpoint([]).fetch,
    })
    await act(() => store.load())
    render(
      <StoreProvider store={store}>
        <ModelPicker profile={undefined} model={undefined} onChoose={() => {}} />
      </StoreProvider>,
    )
    expect(screen.getByText('Choose an endpoint.')).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Endpoint' })).toBeTruthy()
  })
})
