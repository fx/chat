import { InkChatProvider } from '@fx/chat-ink'
import { cleanup, render } from 'ink-testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Fullscreen, type FullscreenProps } from './Fullscreen'
import { KEYS, fakeEndpoint, sseBody, tick } from './test-helpers'

afterEach(() => cleanup())

const settings = { baseUrl: 'https://fake.test/v1', model: 'fake-1' }

function setup(
  completions: Array<(signal?: AbortSignal) => Response>,
  props: Partial<FullscreenProps> = {},
) {
  const endpoint = fakeEndpoint(completions)
  const onExit = vi.fn()
  const write = vi.fn()
  const view = render(
    <InkChatProvider>
      <Fullscreen
        settings={settings}
        fetch={endpoint.fetch}
        onExit={onExit}
        write={write}
        size={{ columns: 60, rows: 16 }}
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
  // Raw terminal writes (kitty keyboard push/pop) land in the frame log too.
  const frame = () => view.frames.filter((f) => !f.startsWith('\u001b[')).at(-1) ?? ''
  return { ...view, endpoint, onExit, write, type, frame }
}

const slow =
  (text: string, delayMs = 60) =>
  (signal?: AbortSignal) =>
    sseBody([{ content: text }], 'stop', delayMs, signal)

describe('Fullscreen', () => {
  it('shows the empty state, then streams an answer in the threaded frame', async () => {
    const { type, frame } = setup([() => sseBody([{ content: 'Hello **there**' }])])
    await tick()
    expect(frame()).toContain('tx chat')
    expect(frame()).toContain('fake-1 · fake.test')
    await type('hi', KEYS.enter)
    await tick(80)
    expect(frame()).toContain('Hello there')
    expect(frame()).toMatch(/╭─+ \d\d:\d\d ─╮/)
    expect(frame().split('\n')).toHaveLength(16)
  })

  it('queues messages typed while an answer streams and sends them in order', async () => {
    const { type, frame, endpoint } = setup([slow('first'), () => sseBody([{ content: 'second' }])])
    await type('one', KEYS.enter)
    await type('two', KEYS.enter)
    expect(frame()).toContain('⏸')
    expect(frame()).toContain('two')
    await tick(400)
    expect(frame()).toContain('second')
    expect(frame()).not.toContain('⏸')
    const chats = endpoint.requests.filter((r) => r.url.endsWith('/chat/completions'))
    expect(chats).toHaveLength(2)
  })

  it('layers Esc: close details, clear input, take back the queue, then stop', async () => {
    const { type, frame } = setup([slow('aaa', 2000)], { size: { columns: 90, rows: 24 } })
    await type('one', KEYS.enter, 'two', KEYS.enter)
    expect(frame()).toContain('⏸')
    // With details open, Esc only closes them.
    await type(KEYS.ctrl('t'), KEYS.escape)
    expect(frame()).toContain('⏸ two')
    await type('draft', KEYS.escape)
    expect(frame()).not.toContain('draft')
    expect(frame()).toContain('⏸ two')
    await type(KEYS.escape)
    expect(frame()).not.toContain('⏸')
    expect(frame()).toContain('› two')
    await type(KEYS.escape)
    await type(KEYS.escape)
    await tick(100)
    expect(frame()).toContain('stopped')
    await type(KEYS.escape, '/new', KEYS.enter)
    expect(frame()).toContain('tx chat')
  })

  it('retries a failed answer with Ctrl+R', async () => {
    const { type, frame, endpoint } = setup([
      () => Response.json({ error: { message: 'boom' } }, { status: 500 }),
      () => sseBody([{ content: 'recovered' }]),
    ])
    await type('hi', KEYS.enter)
    await tick(80)
    expect(frame()).toContain('^R again')
    await type(KEYS.ctrl('r'))
    await tick(80)
    expect(frame()).toContain('recovered')
    expect(endpoint.requests.filter((r) => r.url.endsWith('/chat/completions'))).toHaveLength(2)
    await type(KEYS.ctrl('r'))
    expect(endpoint.requests.filter((r) => r.url.endsWith('/chat/completions'))).toHaveLength(2)
  })

  it('asks before network tools', async () => {
    const { type, frame } = setup(
      [
        () =>
          sseBody(
            [
              {
                tool_calls: [
                  {
                    index: 0,
                    id: 'c',
                    function: { name: 'fetch_url', arguments: '{"url":"https://x.test/"}' },
                  },
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
    expect(frame()).toContain('Allow fetch_url?')
    await type('y')
    await tick(80)
    expect(frame()).toContain('done')
  })

  it('shows no terminal controls from model-chosen approval arguments', async () => {
    const args = JSON.stringify({
      url: 'https://x.test/\u009b2J\u007f\u009d52;c;QQ==\u009c\u001b]52;c;QQ==\u0007end',
    })
    const { type, frame } = setup(
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
    const shown = frame()
    expect(shown).toContain('Allow fetch_url?')
    expect(shown).toContain('end')
    for (const bad of ['\u009b', '\u007f', '\u009d', '\u009c', '\u001b]52'])
      expect(shown).not.toContain(bad)
  })

  it('denies with n, and Ctrl+C stops a run then quits', async () => {
    const call = () =>
      sseBody(
        [{ tool_calls: [{ index: 0, id: 'c', function: { name: 'fetch_url', arguments: '{}' } }] }],
        'tool_calls',
      )
    const { type, frame, onExit } = setup([call, slow('x'.repeat(5))], {
      settings: { ...settings, tools: { fetch_url: true } },
    })
    await type('go', KEYS.enter)
    await tick(60)
    await type('n')
    await tick(30)
    expect(frame()).not.toContain('Allow fetch_url?')
    await type(KEYS.ctrl('c'))
    await tick(100)
    expect(onExit).not.toHaveBeenCalled()
    await type(KEYS.ctrl('c'))
    expect(onExit).toHaveBeenCalledWith('quit')
  })

  it('cycles detail, scrolls, and toggles details with Ctrl+O', async () => {
    const { type, frame } = setup([
      () => sseBody([{ reasoning_content: 'pondering' }, { content: 'ok' }]),
    ])
    await type('hi', KEYS.enter)
    await tick(80)
    expect(frame()).not.toContain('pondering')
    await type(KEYS.ctrl('o'))
    expect(frame()).toContain('pondering')
    await type(KEYS.ctrl('o'))
    expect(frame()).not.toContain('pondering')
    await type('\u001b[1;2A', '\u001b[5~', '\u001b[6~')
    expect(frame()).toContain('ok')
  })

  it('copies a mouse selection and confirms it in the status line', async () => {
    const { type, frame, write } = setup([() => sseBody([{ content: 'copy me please' }])])
    await type('hi', KEYS.enter)
    await tick(80)
    const y = frame()
      .split('\n')
      .findIndex((l) => l.includes('copy me'))
    const x = frame().split('\n')[y]?.indexOf('copy') ?? 0
    await type(
      `\u001b[<0;${x + 1};${y + 1}M`,
      `\u001b[<32;${x + 7};${y + 1}M`,
      `\u001b[<0;${x + 7};${y + 1}m`,
    )
    expect(write).toHaveBeenCalledWith(expect.stringContaining(']52;c;'))
    expect(frame()).toContain('Copied 1 line')
    await type('a')
    expect(frame()).not.toContain('Copied')
  })

  it('hands terminal replies to the image provider', async () => {
    const takeReply = vi.fn(() => true)
    const images = {
      get: () => undefined,
      allow: vi.fn(),
      version: 0,
      subscribe: () => () => {},
      takeReply,
    }
    const { type } = setup([], { images })
    await type('\u001b[6;18;9t')
    expect(takeReply).toHaveBeenCalledWith('\u001b[6;18;9t')
  })

  it('fills the window when no size is given', async () => {
    const endpoint = fakeEndpoint([])
    const view = render(
      <InkChatProvider>
        <Fullscreen settings={settings} fetch={endpoint.fetch} />
      </InkChatProvider>,
    )
    await tick()
    expect(view.lastFrame()).toContain('tx chat')
  })
})
