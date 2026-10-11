import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TOOLS,
  apiKeySource,
  hostOf,
  isChatSettings,
  isComplete,
  resolveSettings,
} from './settings'

describe('settings', () => {
  it('validates stored values', () => {
    expect(isChatSettings({ baseUrl: 'u', model: 'm' })).toBe(true)
    expect(
      isChatSettings({
        baseUrl: 'u',
        model: 'm',
        apiKey: 'k',
        system: 's',
        tools: { calculator: false },
      }),
    ).toBe(true)
    expect(isChatSettings({ baseUrl: 'u' })).toBe(false)
    expect(isChatSettings({ baseUrl: 'u', model: 'm', tools: { x: 'yes' } })).toBe(false)
    expect(isChatSettings({ baseUrl: 'u', model: 'm', tools: null })).toBe(false)
    expect(isChatSettings({ baseUrl: 'u', model: 'm', apiKey: 3 })).toBe(false)
    expect(isChatSettings(null)).toBe(false)
  })

  it('resolves flags over environment over the stored profile', () => {
    const stored = {
      baseUrl: 'stored',
      model: 'sm',
      apiKey: 'sk',
      system: 'ss',
      tools: { fetch_url: true },
    }
    expect(
      resolveSettings({ model: 'flag' }, { OPENAI_BASE_URL: 'env', OPENAI_API_KEY: '' }, stored),
    ).toEqual({
      baseUrl: 'env',
      apiKey: 'sk',
      model: 'flag',
      system: 'ss',
      tools: { ...DEFAULT_TOOLS, fetch_url: true },
    })
    expect(resolveSettings({}, {}, undefined)).toEqual({ tools: DEFAULT_TOOLS })
    expect(
      resolveSettings({ system: 'x' }, { OPENAI_MODEL: 'em', OPENAI_BASE_URL: 'b' }, undefined),
    ).toMatchObject({
      model: 'em',
      system: 'x',
    })
  })

  it('reports where the API key comes from', () => {
    const stored = { baseUrl: 'b', model: 'm', apiKey: 'sk' }
    expect(apiKeySource({ apiKey: 'f' }, { OPENAI_API_KEY: 'e' }, stored)).toBe('flag')
    expect(apiKeySource({}, { OPENAI_API_KEY: 'e' }, stored)).toBe('env')
    expect(apiKeySource({ apiKey: '' }, { OPENAI_API_KEY: '' }, stored)).toBe('stored')
    expect(apiKeySource({}, {}, undefined)).toBeUndefined()
  })

  it('knows when a profile is usable and extracts the host', () => {
    expect(isComplete({ baseUrl: 'u', model: 'm' })).toBe(true)
    expect(isComplete({ baseUrl: 'u' })).toBe(false)
    expect(hostOf('https://api.example.test/v1')).toBe('api.example.test')
    expect(hostOf('not a url')).toBe('not a url')
  })
})
