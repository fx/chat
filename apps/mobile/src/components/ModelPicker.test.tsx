import { memoryStore } from '@fx/chat-agent'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StoreProvider } from '../store/context'
import { AppStore } from '../store/store'
import type { Profile } from '../store/types'
import { fakeEndpoint } from '../test-helpers'
import { ModelPicker, ROW_HEIGHT, ago } from './ModelPicker'

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

async function setup(
  fetch = fakeEndpoint([], listing).fetch,
  profiles = [profile],
  kv = memoryStore({ settings: { profiles } }),
) {
  const store = new AppStore({ kv, fetch })
  await store.load()
  const onChoose = vi.fn()
  render(
    <StoreProvider store={store}>
      <ModelPicker profile={profiles[0]} model="llama" onChoose={onChoose} />
    </StoreProvider>,
  )
  return { onChoose, store }
}

const rows = () =>
  within(screen.getByRole('list', { name: 'Models' }))
    .getAllByRole('button')
    .filter((b) => !b.hasAttribute('aria-label'))
    .map((b) => b.textContent)

describe('ModelPicker', () => {
  it('lists models by name with their facts and capabilities, the current one pressed', async () => {
    await setup()
    await screen.findByRole('list', { name: 'Models' })
    expect(screen.getByText('3 models · updated just now')).toBeTruthy()
    expect(rows()).toEqual([
      'llama',
      'openrouter/acme/plain',
      'Acme Visionopenrouter/acme/vision · 131K',
    ])
    expect(screen.getByRole('img', { name: 'Tools' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'llama' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('searches, filters by capability icon, and picks', async () => {
    const user = userEvent.setup()
    const { onChoose } = await setup()
    const search = await screen.findByRole('searchbox', { name: 'Search models' })
    await user.type(search, 'acme')
    expect(rows()).toHaveLength(2)
    expect(screen.getByText('2 of 3 · updated just now')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Show filters' }))
    await user.click(screen.getByRole('button', { name: 'Tools' }))
    expect(screen.getByRole('button', { name: 'Tools' })).toHaveAttribute('aria-pressed', 'true')
    expect(rows()).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Tools' }))
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    await user.type(search, 'nothing')
    expect(screen.getByText('No models match.')).toBeTruthy()
    await user.clear(search)
    await user.click(screen.getByRole('button', { name: /^Acme Vision/ }))
    expect(onChoose).toHaveBeenCalledWith({ profileId: 'p1', model: 'openrouter/acme/vision' })
  })

  it('filters by provider in the filters panel', async () => {
    const user = userEvent.setup()
    await setup()
    await screen.findByRole('list', { name: 'Models' })
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    // One endpoint: nothing to switch.
    expect(screen.queryByRole('group', { name: 'Endpoint' })).toBeNull()
    const chip = (name: string) =>
      within(screen.getByRole('group', { name: 'Provider' })).getByRole('button', { name })
    await user.click(chip('llamacpp'))
    await user.click(screen.getByRole('button', { name: 'Show 1 models' }))
    expect(rows()).toEqual(['llama'])
    expect(screen.getByText('llamacpp · 1 of 3 · updated just now')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Filters, 1 on' }))
    // Several at once; tapping one again drops it, and All clears them.
    await user.click(chip('openrouter'))
    expect(chip('All')).toHaveAttribute('aria-pressed', 'false')
    await user.click(screen.getByRole('button', { name: 'Show 3 models' }))
    expect(screen.getByText('llamacpp, openrouter · 3 of 3 · updated just now')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Filters, 2 on' }))
    await user.click(chip('openrouter'))
    expect(screen.getByRole('button', { name: 'Show 1 models' })).toBeTruthy()
    await user.click(chip('All'))
    expect(chip('llamacpp')).toHaveAttribute('aria-pressed', 'false')
    await user.click(chip('llamacpp'))
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    await user.click(screen.getByRole('button', { name: 'Show 3 models' }))
    expect(rows()).toHaveLength(3)
  })

  it('shows the capability toggles in the panel too, and clears them with the rest', async () => {
    const user = userEvent.setup()
    await setup()
    await screen.findByRole('list', { name: 'Models' })
    await user.click(screen.getByRole('button', { name: 'Tools' }))
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    const caps = () => within(screen.getByRole('group', { name: 'Show' }))
    expect(caps().getByRole('button', { name: 'Tools' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(caps().getByRole('button', { name: 'Vision' }))
    expect(screen.getByRole('button', { name: 'Show 1 models' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(caps().getByRole('button', { name: 'Tools' })).toHaveAttribute('aria-pressed', 'false')
    await user.click(screen.getByRole('button', { name: 'Show 3 models' }))
    expect(screen.getByRole('button', { name: 'Vision' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('browses another endpoint from the filters, choosing a model there', async () => {
    const user = userEvent.setup()
    const other: Profile = { ...profile, id: 'p2', name: 'Other', baseUrl: 'https://other.test/v1' }
    const { onChoose } = await setup(fakeEndpoint([], listing).fetch, [profile, other])
    await screen.findByRole('list', { name: 'Models' })
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    const endpoints = screen.getByRole('group', { name: 'Endpoint' })
    await user.click(within(endpoints).getByRole('button', { name: /^Other/ }))
    expect(onChoose).not.toHaveBeenCalled()
    await user.click(await screen.findByRole('button', { name: 'Show 3 models' }))
    expect(screen.getByText('Other · 3 models · updated just now')).toBeTruthy()
    // The current model is the first endpoint's, so nothing is pressed here.
    expect(screen.getByRole('button', { name: 'llama' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Filters, 1 on' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'llama' }))
    expect(onChoose).toHaveBeenCalledWith({ profileId: 'p2', model: 'llama' })
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
  })

  it('shows a listing failure with the id field', async () => {
    await setup(async () => Response.json({ error: { message: 'nope' } }, { status: 401 }))
    expect(await screen.findByText(/nope/)).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Model id' })).toBeTruthy()
  })

  it('offers only the capabilities some model declares', async () => {
    await setup(fakeEndpoint([], [{ id: 'a', architecture: { input_modalities: ['text'] } }]).fetch)
    await screen.findByRole('list', { name: 'Models' })
    expect(screen.getByRole('button', { name: 'Vision' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Tools' })).toBeNull()
  })

  it('asks for an endpoint when there is none chosen', async () => {
    const user = userEvent.setup()
    const store = new AppStore({
      kv: memoryStore({ settings: { profiles: [profile] } }),
      fetch: fakeEndpoint([], listing).fetch,
    })
    await act(() => store.load())
    render(
      <StoreProvider store={store}>
        <ModelPicker profile={undefined} model={undefined} onChoose={() => {}} />
      </StoreProvider>,
    )
    expect(screen.getByText('Choose an endpoint.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /^Fake/ }))
    expect(await screen.findByRole('list', { name: 'Models' })).toBeTruthy()
  })

  it('stars models: favorites first, and a favorites-only filter', async () => {
    const user = userEvent.setup()
    const { store } = await setup()
    await screen.findByRole('list', { name: 'Models' })
    await user.click(screen.getByRole('button', { name: 'Favorites' }))
    expect(screen.getByText('No favorites yet. Star a model to keep it here.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Favorites' }))
    await user.click(screen.getByRole('button', { name: 'Star Acme Vision' }))
    expect(store.getState().settings.favorites).toEqual({ p1: ['openrouter/acme/vision'] })
    expect(rows()[0]).toMatch(/^Acme Vision/)
    expect(screen.getByRole('button', { name: 'Unstar Acme Vision' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(screen.getByRole('button', { name: 'Favorites' }))
    expect(rows()).toHaveLength(1)
    expect(screen.getByText('1 of 3 · updated just now')).toBeTruthy()
    // The panel shows it too, and Clear turns it off.
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    const show = within(screen.getByRole('group', { name: 'Show' }))
    expect(show.getByRole('button', { name: 'Favorites' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    await user.click(screen.getByRole('button', { name: 'Show 3 models' }))
    expect(rows()).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: 'Unstar Acme Vision' }))
    expect(store.getState().settings.favorites).toEqual({ p1: [] })
  })

  it('gives the search the whole row while it has focus, and a caret to leave it', async () => {
    const user = userEvent.setup()
    await setup()
    const search = await screen.findByRole('searchbox', { name: 'Search models' })
    await user.click(search)
    expect(screen.queryByRole('button', { name: 'Filters' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Tools' })).toBeNull()
    await user.type(search, 'acme')
    // Clearing keeps the search focused and expanded.
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(search).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Show filters' }))
    expect(search).not.toHaveFocus()
    expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Show filters' })).toBeNull()
  })

  it('draws only the rows in view of a long list', async () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ id: `m${String(i).padStart(3, '0')}` }))
    await setup(fakeEndpoint([], many).fetch)
    const list = await screen.findByRole('list', { name: 'Models' })
    expect(list.style.height).toBe(`${500 * ROW_HEIGHT}px`)
    const drawn = within(list).getAllByRole('listitem')
    expect(drawn.length).toBeGreaterThan(10)
    expect(drawn.length).toBeLessThan(40)
    // Scrolling draws the rows there instead.
    const scroller = list.parentElement as HTMLElement
    scroller.scrollTop = 300 * ROW_HEIGHT
    act(() => {
      scroller.dispatchEvent(new Event('scroll'))
    })
    expect(within(list).getByRole('button', { name: 'm300' })).toBeTruthy()
    expect(within(list).queryByRole('button', { name: 'm000' })).toBeNull()
  })

  it('uses the cached listing, and refreshes it on demand', async () => {
    const user = userEvent.setup()
    const endpoint = fakeEndpoint([], listing)
    const kv = memoryStore({
      settings: { profiles: [profile] },
      'models:p1': {
        endpoint: 'https://fake.test/v1\n811c9dc5',
        fetchedAt: Date.now() - 2 * 60 * 60 * 1000,
        models: [{ id: 'cached' }],
      },
    })
    await setup(endpoint.fetch, [profile], kv)
    expect(await screen.findByRole('button', { name: 'cached' })).toBeTruthy()
    expect(screen.getByText('1 models · updated 2h ago')).toBeTruthy()
    expect(endpoint.requests).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Refresh models' }))
    expect(await screen.findByRole('button', { name: 'llama' })).toBeTruthy()
    expect(endpoint.requests.map((r) => r.url)).toEqual(['https://fake.test/v1/models'])
  })

  it('fetches again when the cached listing is old, showing it meanwhile', async () => {
    const endpoint = fakeEndpoint([], listing)
    const kv = memoryStore({
      settings: { profiles: [profile] },
      'models:p1': {
        endpoint: 'https://fake.test/v1\n811c9dc5',
        fetchedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
        models: [{ id: 'cached' }],
      },
    })
    await setup(endpoint.fetch, [profile], kv)
    expect(await screen.findByRole('button', { name: 'llama' })).toBeTruthy()
    expect(endpoint.requests).toHaveLength(1)
  })
})

describe('ago', () => {
  it('says how long ago, coarsely', () => {
    expect([0, 5 * 60_000, 3 * 3_600_000, 50 * 3_600_000].map(ago)).toEqual([
      'just now',
      '5m ago',
      '3h ago',
      '2d ago',
    ])
  })
})
