import type { Config } from '@fx/tx/config'
import type { Dialogs } from '@fx/tx/dialogs'
import type { Theming } from '@fx/tx/theme'
import * as ink from 'ink'
import type { ReactElement } from 'react'
import * as React from 'react'
import { describe, expect, it, vi } from 'vitest'
import plugin, { inkMajor } from '../index'
import { CONFIG_KEY } from './settings'
import { runSetup } from './setup'
import { NOT_CONFIGURED, type StartOptions, startChat } from './start'
import { fakeEndpoint } from './test-helpers'

function fakeConfig(initial?: unknown) {
  const data = new Map<string, unknown>(initial ? [[CONFIG_KEY, initial]] : [])
  const config: Config & { data: Map<string, unknown> } = {
    data,
    define: vi.fn(),
    read: async <T,>(key: string) => data.get(key) as T | undefined,
    write: async (key: string, value: unknown) => {
      data.set(key, value)
    },
  }
  return config
}

const theming: Theming = { theme: () => ({ appearance: () => ({}) }) }
const tty = { isTTY: true, write: vi.fn() }

function context(env: Record<string, string> = {}): StartOptions['context'] {
  return { stdin: tty, stdout: tty, stderr: tty, env } as unknown as StartOptions['context']
}

/** A renderApp fake that exits with the reason App reports. */
function fakeRender(reasons: Array<'quit' | 'setup'>, settingsChange?: unknown) {
  const rendered: ReactElement[] = []
  const renderApp = vi.fn((element: ReactElement) => {
    rendered.push(element)
    const app = (
      element.props as {
        children: ReactElement<{
          onExit: (r: string) => void
          onSettingsChange: (s: unknown) => void
          clearScreen?: () => void
        }>
      }
    ).children
    if (settingsChange) app.props.onSettingsChange(settingsChange)
    app.props.clearScreen?.()
    app.props.onExit(reasons.shift() ?? 'quit')
    return { waitUntilExit: async () => {} }
  })
  return {
    renderApp: renderApp as unknown as StartOptions['renderApp'] & typeof renderApp,
    rendered,
  }
}

function dialogs(answers: { inputs: Array<string | undefined>; select?: unknown }): Dialogs {
  return {
    input: vi.fn(async () => answers.inputs.shift()),
    select: vi.fn(async () => answers.select) as Dialogs['select'],
  }
}

describe('startChat', () => {
  it('starts from env settings and persists in-session changes without the key', async () => {
    const config = fakeConfig()
    const { renderApp } = fakeRender(['quit'], {
      baseUrl: 'https://e.test/v1',
      model: 'm2',
      apiKey: 'secret',
      system: 'sys',
    })
    await startChat({
      context: context({
        OPENAI_BASE_URL: 'https://e.test/v1',
        OPENAI_MODEL: 'm1',
        OPENAI_API_KEY: 'secret',
      }),
      config,
      theming,
      flags: {},
      setup: false,
      inline: true,
      renderApp,
    })
    expect(renderApp).toHaveBeenCalledTimes(1)
    expect(config.data.get(CONFIG_KEY)).toEqual({
      baseUrl: 'https://e.test/v1',
      model: 'm2',
      system: 'sys',
    })
    expect(tty.write).toHaveBeenCalledWith('\u001b[2J\u001b[3J\u001b[H')
  })

  it('runs fullscreen on the alternate screen by default, with kitty images when supported', async () => {
    const write = vi.fn()
    const kittyContext = {
      ...context({
        OPENAI_BASE_URL: 'https://e.test/v1',
        OPENAI_MODEL: 'm',
        TERM_PROGRAM: 'kitty',
      }),
      stdout: { isTTY: true, write },
    } as unknown as StartOptions['context']
    const { renderApp, rendered } = fakeRender(['quit'])
    await startChat({
      context: kittyContext,
      config: fakeConfig(),
      theming,
      flags: {},
      setup: false,
      renderApp,
    })
    expect(renderApp.mock.calls[0]?.[1]).toMatchObject({ alternateScreen: true })
    const app = (
      rendered[0]?.props as {
        children: ReactElement<{ images?: unknown; write: (d: string) => void }>
      }
    ).children
    expect(app.props.images).toBeDefined()
    app.props.write('x')
    expect(write).toHaveBeenLastCalledWith('x')
    const plain = fakeRender(['quit'])
    await startChat({
      context: context({ OPENAI_BASE_URL: 'https://e.test/v1', OPENAI_MODEL: 'm' }),
      config: fakeConfig(),
      theming,
      flags: {},
      setup: false,
      renderApp: plain.renderApp,
    })
    const second = (plain.rendered[0]?.props as { children: ReactElement<{ images?: unknown }> })
      .children
    expect(second.props.images).toBeUndefined()
  })

  it('keeps the stored key and drops a cleared system prompt', async () => {
    const config = fakeConfig({ baseUrl: 'https://s.test', model: 'm', apiKey: 'k', system: 'old' })
    const { renderApp } = fakeRender(['quit'], {
      baseUrl: 'https://s.test',
      model: 'n',
      tools: { fetch_url: true },
    })
    await startChat({ context: context(), config, theming, flags: {}, setup: false, renderApp })
    expect(config.data.get(CONFIG_KEY)).toEqual({
      baseUrl: 'https://s.test',
      model: 'n',
      apiKey: 'k',
      tools: { fetch_url: true },
    })
  })

  it('refuses without settings, dialogs or a terminal', async () => {
    await expect(
      startChat({ context: context(), config: fakeConfig(), theming, flags: {}, setup: false }),
    ).rejects.toThrow(NOT_CONFIGURED)
    const noTty = {
      ...context({ OPENAI_BASE_URL: 'u', OPENAI_MODEL: 'm' }),
      stdout: { isTTY: false },
    } as unknown as StartOptions['context']
    await expect(
      startChat({ context: noTty, config: fakeConfig(), theming, flags: {}, setup: false }),
    ).rejects.toThrow('interactive terminal')
  })

  it('runs setup first when asked, restarts after /setup, and stops when setup is cancelled', async () => {
    const config = fakeConfig({ baseUrl: 'https://s.test', model: 'm' })
    const endpoint = fakeEndpoint([])
    const { renderApp } = fakeRender(['setup'])
    const d = dialogs({
      inputs: ['https://new.test/v1/', '', undefined],
      select: { value: 'fake-2', values: {} },
    })
    await startChat({
      context: context(),
      config,
      theming,
      dialogs: d,
      flags: {},
      setup: true,
      renderApp,
      fetch: endpoint.fetch,
    })
    expect(config.data.get(CONFIG_KEY)).toMatchObject({
      baseUrl: 'https://new.test/v1',
      model: 'fake-2',
      apiKey: '',
    })
    expect(renderApp).toHaveBeenCalledTimes(1)
  })

  it('defaults fetch to the global one', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ data: [{ id: 'g' }] }))
    const config = fakeConfig()
    const d = dialogs({ inputs: ['https://g.test', 'key'], select: { value: 'g', values: {} } })
    const { renderApp } = fakeRender(['quit'])
    await startChat({
      context: context(),
      config,
      theming,
      dialogs: d,
      flags: {},
      setup: false,
      renderApp,
    })
    expect(config.data.get(CONFIG_KEY)).toMatchObject({ model: 'g', apiKey: 'key' })
    spy.mockRestore()
  })
})

describe('runSetup', () => {
  const ok = fakeEndpoint([])
  it('returns undefined when any step is cancelled', async () => {
    expect(await runSetup(dialogs({ inputs: [undefined] }), ok.fetch, {})).toBeUndefined()
    expect(await runSetup(dialogs({ inputs: ['  '] }), ok.fetch, {})).toBeUndefined()
    expect(await runSetup(dialogs({ inputs: ['u', undefined] }), ok.fetch, {})).toBeUndefined()
    expect(
      await runSetup(dialogs({ inputs: ['https://a.test', ''], select: undefined }), ok.fetch, {}),
    ).toBeUndefined()
  })

  it('offers typing a model when listing fails', async () => {
    const failing = async () => Response.json({ error: 'nope' }, { status: 500 })
    const typed = Symbol.for('ignored')
    const d = dialogs({ inputs: ['https://a.test', 'k'] })
    ;(d.select as ReturnType<typeof vi.fn>).mockImplementation(
      async (request: { message: string; options: Array<{ value: unknown }> }) => {
        expect(request.message).toContain('listing failed: HTTP 500: nope')
        return { value: request.options.at(-1)?.value, values: { model: ' typed-1 ' } }
      },
    )
    expect(await runSetup(d, failing, { model: 'old' })).toEqual({
      baseUrl: 'https://a.test',
      apiKey: 'k',
      model: 'typed-1',
    })
    const empty = dialogs({ inputs: ['https://a.test', 'k'] })
    ;(empty.select as ReturnType<typeof vi.fn>).mockImplementation(
      async (request: { options: Array<{ value: unknown }> }) => ({
        value: request.options.at(-1)?.value,
        values: {},
      }),
    )
    expect(
      await runSetup(
        empty,
        async () => {
          throw 'offline'
        },
        {},
      ),
    ).toBeUndefined()
    void typed
  })
})

describe('plugin entry', () => {
  it('registers `tx chat` and passes capabilities and flags to startChat', async () => {
    let action: ((options: Record<string, unknown>) => Promise<void>) | undefined
    const ns = {
      description: () => ns,
      option: () => ns,
      action: (fn: typeof action) => {
        action = fn
        return ns
      },
    }
    const registrations = vi.fn((key: string) =>
      key === '@fx/tx/dialogs' ? [] : key === '@fx/tx/theme' ? [theming] : [fakeConfig()],
    )
    const dependencies = { react: React, ink, versions: { ink: '8.0.0', react: '19.3.0' } }
    plugin({
      command: (build: (n: typeof ns) => void) => build(ns),
      registrations,
      dependencies,
      context: { ...context(), stdout: { isTTY: false } },
    } as never)
    await expect(
      action?.({ baseUrl: 'u', apiKey: 'k', model: 'm', system: 's', setup: false }),
    ).rejects.toThrow('interactive terminal')
    registrations.mockImplementation(() => [])
    await expect(action?.({})).rejects.toThrow('exactly one @fx/tx/config capability (found 0)')
    // A tx that hands plugins Ink 7 cannot run the chat.
    dependencies.versions.ink = '^7.0.0'
    await expect(action?.({})).rejects.toThrow('needs a tx that provides Ink 8')
  })

  it('reads the major version from a dependency spec', () => {
    expect(inkMajor('8.0.0')).toBe(8)
    expect(inkMajor('^7.2.1')).toBe(7)
    expect(inkMajor('latest')).toBe(0)
  })
})
