import type { ModelInfo } from '@fx/chat-agent'
import { describe, expect, it } from 'vitest'
import {
  declares,
  filterModels,
  formatContext,
  knownCapabilities,
  providerOf,
  providers,
} from './model-filter'

const models: ModelInfo[] = [
  {
    id: 'openrouter/acme/vision-pro',
    name: 'Acme: Vision Pro',
    contextLength: 131072,
    inputModalities: ['text', 'image'],
    supportedParameters: ['tools', 'include_reasoning'],
  },
  { id: 'openrouter/acme/plain', supportedParameters: ['temperature'], inputModalities: ['text'] },
  { id: 'anthropic/claude', name: 'Claude', supportedParameters: ['tools', 'reasoning'] },
  { id: 'local-model', ownedBy: 'llamacpp' },
  { id: 'bare' },
]

describe('model filters', () => {
  it('reads capabilities from the listing, undefined where it says nothing', () => {
    const [vision, plain, , local] = models as [ModelInfo, ModelInfo, ModelInfo, ModelInfo]
    expect(['tools', 'reasoning', 'vision'].map((c) => declares(vision, c as never))).toEqual([
      true,
      true,
      true,
    ])
    expect(['tools', 'reasoning', 'vision'].map((c) => declares(plain, c as never))).toEqual([
      false,
      false,
      false,
    ])
    expect(declares(local, 'tools')).toBeUndefined()
    expect(declares(local, 'vision')).toBeUndefined()
  })

  it('takes the provider from the id, else the owner', () => {
    expect(models.map(providerOf)).toEqual([
      'openrouter',
      'openrouter',
      'anthropic',
      'llamacpp',
      undefined,
    ])
    expect(providers(models)).toEqual(['openrouter', 'anthropic', 'llamacpp'])
    expect(knownCapabilities(models)).toEqual(['tools', 'reasoning', 'vision'])
    expect(knownCapabilities([{ id: 'x' }])).toEqual([])
  })

  it('matches every search term in the id or name, the provider and all capabilities', () => {
    const ids = (filter: Parameters<typeof filterModels>[1]) =>
      filterModels(models, filter).map((m) => m.id)
    expect(ids({ query: '', capabilities: [] })).toHaveLength(5)
    expect(ids({ query: ' ACME  pro ', capabilities: [] })).toEqual(['openrouter/acme/vision-pro'])
    expect(ids({ query: 'claude', capabilities: [] })).toEqual(['anthropic/claude'])
    expect(ids({ query: '', providers: ['openrouter'], capabilities: ['tools'] })).toEqual([
      'openrouter/acme/vision-pro',
    ])
    expect(ids({ query: '', providers: ['anthropic', 'llamacpp'], capabilities: [] })).toEqual([
      'anthropic/claude',
      'local-model',
    ])
    expect(ids({ query: '', providers: [], capabilities: [] })).toHaveLength(5)
    expect(ids({ query: '', capabilities: ['reasoning'] })).toEqual([
      'openrouter/acme/vision-pro',
      'anthropic/claude',
    ])
  })

  it('lists favorites first, or only them', () => {
    const favorites = new Set(['bare', 'anthropic/claude'])
    const isFavorite = (m: ModelInfo) => favorites.has(m.id)
    const ids = (favoritesOnly: boolean) =>
      filterModels(models, { query: '', capabilities: [], isFavorite, favoritesOnly }).map(
        (m) => m.id,
      )
    expect(ids(false)).toEqual([
      'anthropic/claude',
      'bare',
      'openrouter/acme/vision-pro',
      'openrouter/acme/plain',
      'local-model',
    ])
    expect(ids(true)).toEqual(['anthropic/claude', 'bare'])
    expect(filterModels(models, { query: '', capabilities: [], favoritesOnly: true })).toEqual([])
  })

  it('shortens context windows', () => {
    expect([200, 8192, 131072, 1_000_000, 1_500_000].map(formatContext)).toEqual([
      '1K',
      '8K',
      '131K',
      '1M',
      '1.5M',
    ])
  })
})
