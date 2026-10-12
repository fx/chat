import { memoryStore } from '@fx/chat-agent'
import { act, cleanup, render, screen, within } from '@testing-library/react'
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

  it('lists every endpoint at once, filters by any of them, and binds to the chosen one', async () => {
    const user = userEvent.setup()
    const other: Profile = { ...profile, id: 'p2', name: 'Other', baseUrl: 'https://other.test/v1' }
    const { onChoose } = await setup(fakeEndpoint([], listing).fetch, [profile, other])
    await screen.findByRole('list', { name: 'Models' })
    await screen.findByText('6 models · updated just now')
    // The same model on each endpoint, each row naming its endpoint.
    expect(rows().filter((r) => r?.startsWith('llama'))).toEqual(['llamaFake', 'llamaOther'])
    expect(screen.getByRole('button', { name: 'llama Fake' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'llama Other' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    const endpoints = () => within(screen.getByRole('group', { name: 'Endpoint' }))
    expect(endpoints().getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(endpoints().getByRole('button', { name: 'Other' }))
    await user.click(screen.getByRole('button', { name: 'Show 3 models' }))
    expect(screen.getByText('Other · 3 of 3 · updated just now')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Filters, 1 on' })).toBeTruthy()
    // Stars are per endpoint.
    await user.click(screen.getByRole('button', { name: 'Star llama on Other' }))
    await user.click(screen.getByRole('button', { name: 'llama Other' }))
    expect(onChoose).toHaveBeenCalledWith({ profileId: 'p2', model: 'llama' })
    // Typing an id binds to the one endpoint in view.
    await user.click(screen.getByRole('button', { name: /isn’t listed/ }))
    expect(screen.getByRole('textbox', { name: 'Model id' })).toHaveAttribute(
      'placeholder',
      'Model id on Other',
    )
  })

  it('lists what it can when an endpoint fails, with a retry', async () => {
    const user = userEvent.setup()
    const other: Profile = { ...profile, id: 'p2', name: 'Other', baseUrl: 'https://other.test/v1' }
    const ok = fakeEndpoint([], listing)
    let down = true
    const fetch: typeof ok.fetch = async (url, init) =>
      down && url.startsWith('https://other.test')
        ? Response.json({ error: { message: 'offline' } }, { status: 503 })
        : ok.fetch(url, init)
    await setup(fetch, [profile, other])
    expect(await screen.findByText(/Couldn’t list Other: .*offline/)).toBeTruthy()
    expect(rows()).toHaveLength(3)
    down = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('6 models · updated just now')
    expect(screen.queryByText(/Couldn’t list/)).toBeNull()
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
    expect(await screen.findByText('No models listed.')).toBeTruthy()
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

  it('lists every endpoint for a conversation with none, and asks for one with no endpoints', async () => {
    const { onChoose } = await setup()
    cleanup()
    const store = new AppStore({
      kv: memoryStore({ settings: { profiles: [profile] } }),
      fetch: fakeEndpoint([], listing).fetch,
    })
    await act(() => store.load())
    const user = userEvent.setup()
    const { unmount } = render(
      <StoreProvider store={store}>
        <ModelPicker profile={undefined} model={undefined} onChoose={onChoose} />
      </StoreProvider>,
    )
    await user.click(await screen.findByRole('button', { name: 'llama' }))
    expect(onChoose).toHaveBeenCalledWith({ profileId: 'p1', model: 'llama' })
    unmount()
    const empty = new AppStore({ kv: memoryStore(), fetch: fakeEndpoint([]).fetch })
    await act(() => empty.load())
    render(
      <StoreProvider store={empty}>
        <ModelPicker profile={undefined} model={undefined} onChoose={onChoose} />
      </StoreProvider>,
    )
    expect(screen.getByText('Set up an endpoint in Settings first.')).toBeTruthy()
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
