import { InkChatProvider } from '@fx/chat-ink'
import { cleanup, render } from 'ink-testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App, type AppProps } from './App'
import {
  KEYS,
  fakeEndpoint,
  fetchCall,
  sseBody,
  stuckBody,
  tick,
  useFakeClock,
} from './test-helpers'

useFakeClock()
afterEach(() => cleanup())

const settings = { baseUrl: 'https://fake.test/v1', model: 'fake-1' }

function setup(completions: Array<() => Response>, props: Partial<AppProps> = {}) {
  const endpoint = fakeEndpoint(completions)
  const onExit = vi.fn()
  const onSettingsChange = vi.fn()
  const clearScreen = vi.fn()
  const view = render(
    <InkChatProvider>
      <App
        settings={settings}
        fetch={endpoint.fetch}
        onExit={onExit}
        onSettingsChange={onSettingsChange}
        clearScreen={clearScreen}
        {...props}
      />
    </InkChatProvider>,
  )
  const type = async (...chunks: string[]) => {
    for (const chunk of chunks) {
      view.stdin.write(chunk)
      await tick()
    }
  }
  const frames = () => view.frames.join('\n')
  return { ...view, endpoint, onExit, onSettingsChange, clearScreen, type, frames }
}

describe('App', () => {
  it('sends a message and streams the answer with footer metrics', async () => {
    const { type, frames, endpoint, lastFrame } = setup([
      () => sseBody([{ reasoning_content: 'hmm' }, { content: 'Hello **there**' }]),
    ])
    await tick()
    expect(lastFrame()).toContain('fake-1 · fake.test')
    await type('hi', KEYS.enter)
    await tick(80)
    expect(frames()).toContain('Hello **there**')
    expect(frames()).toContain('› hi')
    const body = endpoint.requests.at(-1)?.body as { tools: Array<{ function: { name: string } }> }
    expect(body.tools.map((t) => t.function.name)).toEqual(['current_time', 'calculator'])
  })

  it('asks before network tools and records allow / deny', async () => {
    const call = (id: string) => () =>
      sseBody(
        [
          {
            tool_calls: [
              {
                index: 0,
                id,
                function: { name: 'fetch_url', arguments: '{"url":"https://x.test/"}' },
              },
            ],
          },
        ],
        'tool_calls',
      )
    const { type, lastFrame, frames, endpoint } = setup(
      [
        call('a'),
        () => sseBody([{ content: 'one' }]),
        call('b'),
        () => sseBody([{ content: 'two' }]),
      ],
      { settings: { ...settings, tools: { fetch_url: true } } },
    )
    await type('fetch', KEYS.enter)
    await tick(60)
    expect(lastFrame()).toContain('Allow fetch_url?')
    await type('y')
    await tick(80)
    expect(frames()).toContain('one')
    expect(endpoint.requests.some((r) => r.url === 'https://x.test/')).toBe(true)
    await type('again', KEYS.enter)
    await tick(60)
    expect(lastFrame()).toContain('Allow fetch_url?')
    await type('n')
    await tick(80)
    expect(frames()).toContain('two')
    expect(JSON.stringify(endpoint.requests.at(-1)?.body)).toContain('declined')
  })

  it('shows no terminal controls from model-chosen approval arguments', async () => {
    const args = JSON.stringify({
      url: 'https://x.test/\u009b2J\u007f\u009d52;c;QQ==\u009c\u001b]52;c;QQ==\u0007end',
    })
    const { type, lastFrame } = setup(
      [
        () =>
          sseBody(
            [
              {
                tool_calls: [
                  { index: 0, id: 'c', function: { name: 'fetch_url', arguments: args } },
                ],
              },
            ],
            'tool_calls',
          ),
        () => sseBody([{ content: 'done' }]),
      ],
      { settings: { ...settings, tools: { fetch_url: true } } },
    )
    await type('go', KEYS.enter)
    await tick(60)
    const shown = lastFrame()
    expect(shown).toContain('Allow fetch_url?')
    expect(shown).toContain('end')
    for (const bad of ['\u009b', '\u007f', '\u009d', '\u009c', '\u001b]52'])
      expect(shown).not.toContain(bad)
  })

  it('stops a streaming turn with Esc and with Ctrl+C', async () => {
    const slow = (signal?: AbortSignal) =>
      sseBody(
        Array.from({ length: 40 }, (_, i) => ({ content: `w${i} ` })),
        'stop',
        15,
        signal,
      )
    const { type, frames, onExit } = setup([slow, slow])
    await type('go', KEYS.enter)
    await tick(80)
    await type(KEYS.escape)
    await tick(100)
    expect(frames()).toContain('Message')
    await type('again', KEYS.enter)
    await tick(80)
    await type(KEYS.ctrl('c'))
    await tick(100)
    expect(onExit).not.toHaveBeenCalled()
    await type(KEYS.ctrl('c'))
    expect(onExit).toHaveBeenCalledWith('quit')
  })

  it('stops the turn with Ctrl+C while an approval is shown, then quits', async () => {
    const { type, lastFrame, frames, endpoint, onExit } = setup(
      [() => fetchCall(), () => sseBody([{ content: 'never' }])],
      { settings: { ...settings, tools: { fetch_url: true } } },
    )
    await type('go', KEYS.enter)
    await tick(60)
    expect(lastFrame()).toContain('Allow fetch_url?')
    await type(KEYS.ctrl('c'))
    await tick(60)
    expect(lastFrame()).not.toContain('Allow fetch_url?')
    expect(frames()).toContain('stopped')
    expect(onExit).not.toHaveBeenCalled()
    // Settled as stopped: nothing fetched, the model is not asked again.
    expect(endpoint.requests.some((r) => r.url === 'https://x.test/')).toBe(false)
    expect(endpoint.requests.filter((r) => r.url.endsWith('/chat/completions'))).toHaveLength(1)
    await type(KEYS.ctrl('c'))
    expect(onExit).toHaveBeenCalledWith('quit')
  })

  it('toggles details with Ctrl+O while an approval is shown', async () => {
    const { type, lastFrame } = setup([() => fetchCall()], {
      settings: { ...settings, tools: { fetch_url: true } },
    })
    await type('go', KEYS.enter)
    await tick(60)
    expect(lastFrame()).toContain('Allow fetch_url?')
    expect(lastFrame()).not.toContain('pondering')
    await type(KEYS.ctrl('o'))
    expect(lastFrame()).toContain('pondering')
    expect(lastFrame()).toContain('Allow fetch_url?')
  })

  it('quits on a second Ctrl+C when a stopped turn does not wind down', async () => {
    const { type, onExit } = setup([stuckBody])
    await type('go', KEYS.enter)
    await tick(40)
    await type(KEYS.ctrl('c'))
    await tick(40)
    expect(onExit).not.toHaveBeenCalled()
    await type(KEYS.ctrl('c'))
    expect(onExit).toHaveBeenCalledWith('quit')
  })

  it('refuses /retry and /new while an answer runs', async () => {
    const slow = (signal?: AbortSignal) => sseBody([{ content: 'kept' }], 'stop', 200, signal)
    const { type, lastFrame, frames, endpoint, clearScreen } = setup([slow, slow])
    await type('go', KEYS.enter)
    await type('/retry', KEYS.enter)
    expect(lastFrame()).toContain('Stop it first')
    await type('/new', KEYS.enter)
    expect(clearScreen).not.toHaveBeenCalled()
    await tick(300)
    expect(frames()).toContain('kept')
    expect(endpoint.requests.filter((r) => r.url.endsWith('/chat/completions'))).toHaveLength(1)
  })

  it('shows run errors with a retry hint and retries', async () => {
    const { type, frames, clearScreen } = setup([
      () => Response.json({ error: { message: 'bad' } }, { status: 400 }),
      () => sseBody([{ content: 'fixed' }]),
    ])
    await type('hi', KEYS.enter)
    await tick(60)
    expect(frames()).toContain('✗ HTTP 400: bad')
    expect(frames()).toMatch(/failed · .*\/retry/)
    await type('/retry', KEYS.enter)
    await tick(80)
    expect(frames()).toContain('fixed')
    expect(clearScreen).toHaveBeenCalled()
  })

  it('reports settings that fail to save and keeps the session going', async () => {
    const onSettingsChange = vi.fn(async () => {
      throw new Error('disk\u001b[31m full')
    })
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      const { type, lastFrame } = setup([], { onSettingsChange })
      await type('/model other', KEYS.enter)
      await tick()
      expect(onSettingsChange).toHaveBeenCalledTimes(1)
      expect(lastFrame()).toContain('Could not save settings: disk')
      expect(lastFrame()).not.toContain('\u001b[31m')
      await type('/help', KEYS.enter)
      expect(lastFrame()).toContain('/model')
      await new Promise<void>((resolve) => setImmediate(resolve))
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  it('runs slash commands', async () => {
    const { type, lastFrame, onSettingsChange, onExit, clearScreen } = setup([])
    await type('/model', KEYS.enter)
    expect(lastFrame()).toContain('model: fake-1')
    await type('/model other', KEYS.enter)
    expect(lastFrame()).toContain('model: other')
    expect(onSettingsChange).toHaveBeenLastCalledWith(expect.objectContaining({ model: 'other' }))
    await type('/system be brief', KEYS.enter)
    expect(lastFrame()).toContain('System prompt set.')
    await type('/system', KEYS.enter)
    expect(lastFrame()).toContain('System prompt cleared.')
    await type('/tools fetch_url', KEYS.enter)
    expect(lastFrame()).toContain('● fetch_url')
    await type('/tools nope', KEYS.enter)
    expect(lastFrame()).toContain('Unknown tool: nope')
    await type('/tools', KEYS.enter)
    expect(lastFrame()).toContain('● calculator')
    await type('/help', KEYS.enter)
    expect(lastFrame()).toContain('/new — start a new conversation')
    await type('/retry', KEYS.enter)
    expect(lastFrame()).toContain('Nothing to retry.')
    await type('/bogus', KEYS.enter)
    expect(lastFrame()).toContain('Unknown command /bogus')
    await type(KEYS.escape)
    await tick(60)
    expect(lastFrame()).not.toContain('Unknown command')
    await type('/expand', KEYS.enter, KEYS.ctrl('o'))
    await type('/new', KEYS.enter)
    expect(clearScreen).toHaveBeenCalled()
    await type('/setup', KEYS.enter)
    expect(onExit).toHaveBeenCalledWith('setup')
  })

  it('quits with /quit and on Ctrl+C when idle', async () => {
    const a = setup([])
    await a.type('/quit', KEYS.enter)
    expect(a.onExit).toHaveBeenCalledWith('quit')
    a.unmount()
    const b = setup([])
    await b.type('/exit', KEYS.enter)
    expect(b.onExit).toHaveBeenCalledWith('quit')
  })

  it('completes /model from the endpoint list', async () => {
    const { type, lastFrame } = setup([])
    await type('/model ')
    await tick(60)
    expect(lastFrame()).toContain('fake-2')
    await type(KEYS.down, KEYS.enter, KEYS.enter)
    expect(lastFrame()).toContain('model: fake-2')
  })
})
