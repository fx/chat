// @vitest-environment node
import type { ChatMessage, DetailLevel } from '@fx/chat-core'
import { cleanup, render } from 'ink-testing-library'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InkChatProvider } from '../registry'
import {
  TranscriptViewport,
  type TranscriptViewportProps,
  type ViewportMouse,
  scrollEnd,
} from './Viewport'
import type { ImageProvider, ImageState } from './images'
import { osc52 } from './mouse'

const actEnv = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
beforeEach(() => {
  actEnv.IS_REACT_ACT_ENVIRONMENT = true
})
afterEach(() => {
  cleanup()
  actEnv.IS_REACT_ACT_ENVIRONMENT = false
})

const answer = 'alpha beta gamma\n\n![pic](https://x/p.png)'
const messages: ChatMessage[] = [
  { id: 'u', role: 'user', blocks: [{ type: 'text', id: 'ut', text: 'hi' }] },
  {
    id: 'a',
    role: 'assistant',
    blocks: [
      {
        type: 'tool_call',
        id: 'tool',
        name: 'search',
        arguments: {},
        status: 'success',
        result: { items: [{ a: 1 }, { b: 2 }] },
      },
      {
        type: 'tool_call',
        id: 'plain',
        name: 'echo',
        arguments: {},
        status: 'success',
        result: 'plain output',
      },
      { type: 'text', id: 'at', text: answer },
    ],
  },
]

const sgr = (code: number, x: number, y: number, release = false) =>
  `\u001b[<${code};${x + 1};${y + 1}${release ? 'm' : 'M'}`

function setup(
  extra: Partial<TranscriptViewportProps> & { mouse?: ViewportMouse; detail?: DetailLevel } = {},
) {
  const write = vi.fn()
  const onCopy = vi.fn()
  const onScroll = vi.fn()
  const props: TranscriptViewportProps = {
    messages,
    width: 40,
    height: 30,
    scroll: scrollEnd,
    onScroll,
    mouse: { write, onCopy, ...extra.mouse },
    ...extra,
  }
  const view = render(
    <InkChatProvider>
      <TranscriptViewport {...props} mouse={{ write, onCopy, ...extra.mouse }} />
    </InkChatProvider>,
  )
  const rows = () => (view.lastFrame() ?? '').split('\n')
  const rowOf = (text: string) => rows().findIndex((r) => r.includes(text))
  const send = async (...events: string[]) => {
    await act(async () => {
      for (const e of events) view.stdin.write(e)
      await new Promise((r) => setTimeout(r, 20))
    })
  }
  const clickAt = (x: number, y: number, code = 0) => [sgr(code, x, y), sgr(code, x, y, true)]
  return { view, write, onCopy, onScroll, rows, rowOf, send, clickAt }
}

describe('TranscriptViewport mouse', () => {
  it('turns reporting on while focused and scrolls with the wheel', async () => {
    const { write, onScroll, send, view } = setup({ mouse: { wheelStep: 2 } })
    expect(write).toHaveBeenCalledWith(expect.stringContaining('?1002h'))
    await send(sgr(64, 0, 0), sgr(65, 0, 0))
    expect(onScroll).toHaveBeenCalledTimes(2)
    view.unmount()
    expect(write).toHaveBeenLastCalledWith(expect.stringContaining('?1002l'))
  })

  it('drag-selects and copies on release; a key clears the selection', async () => {
    const { send, rowOf, onCopy, write, view } = setup()
    const y = rowOf('alpha')
    await send(sgr(0, 2, y), sgr(32, 9, y), sgr(32, 13, y))
    expect(onCopy).not.toHaveBeenCalled()
    await send(sgr(0, 13, y, true))
    expect(onCopy).toHaveBeenCalledWith('alpha beta g', '1 line')
    expect(write).toHaveBeenCalledWith(osc52('alpha beta g'))
    await send('x')
    // Dragging below the transcript clamps to the last visible row.
    await send(sgr(0, 2, y), sgr(32, 2, 200), sgr(32, 2, 200, true))
    expect(onCopy.mock.lastCall?.[1]).toMatch(/lines$/)
    view.unmount()
  })

  it('ignores presses outside, other buttons and stray releases', async () => {
    const { send, onCopy, rowOf } = setup()
    const y = rowOf('alpha')
    await send(sgr(0, 2, 200), sgr(32, 3, y), sgr(0, 3, y, true))
    await send(sgr(2, 2, y), sgr(1, 2, y, true))
    expect(onCopy).not.toHaveBeenCalled()
  })

  it('toggles a tool row and its JSON members with clicks', async () => {
    const [user, reply] = messages as [ChatMessage, ChatMessage]
    const oneTool = [user, { ...reply, blocks: reply.blocks.filter((b) => b.id !== 'plain') }]
    const { send, rows, rowOf, clickAt } = setup({ messages: oneTool })
    expect(rows().join('\n')).not.toContain('items')
    await send(...clickAt(2, rowOf('search')))
    expect(rows().join('\n')).toContain('items')
    const member = rowOf('▸')
    await send(...clickAt(4, member))
    expect(rows()[member]).toContain('▾')
  })

  it('clamps a drag that starts in a tool output box, and double-click copies the output', async () => {
    const { send, rowOf, clickAt, onCopy } = setup({ detail: 'details' })
    const top = rowOf('items')
    await send(sgr(0, 4, top), sgr(32, 4, rowOf('alpha')), sgr(0, 4, rowOf('alpha'), true))
    expect(onCopy.mock.lastCall?.[0]).not.toContain('alpha')
    await send(...clickAt(6, top), ...clickAt(6, top))
    expect(onCopy).toHaveBeenLastCalledWith(
      JSON.stringify({ items: [{ a: 1 }, { b: 2 }] }, null, 2),
      'tool output',
    )
    const plain = rowOf('plain output')
    await send(...clickAt(6, plain), ...clickAt(6, plain))
    expect(onCopy).toHaveBeenLastCalledWith('plain output', 'tool output')
  })

  it('double-click copies the message as written; slow clicks do not', async () => {
    const { send, rowOf, clickAt, onCopy } = setup({ mouse: { doubleClickMs: 1000 } })
    const y = rowOf('alpha')
    await send(...clickAt(3, y), ...clickAt(3, y))
    expect(onCopy).toHaveBeenLastCalledWith(answer, 'message')
    onCopy.mockClear()
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(0)
    await send(...clickAt(3, y))
    now.mockReturnValue(5000)
    await send(...clickAt(3, y))
    now.mockRestore()
    expect(onCopy).not.toHaveBeenCalled()
  })

  it('allows, enlarges and opens images', async () => {
    let state: ImageState = { kind: 'ask' }
    const listeners = new Set<() => void>()
    const boxes: unknown[] = []
    const provider: ImageProvider = {
      get: (_src, box) => {
        boxes.push(box)
        return state
      },
      allow: vi.fn(() => {
        state = { kind: 'ready', rows: ['IMG'] }
        provider.version++
        for (const l of listeners) l()
      }),
      version: 0,
      subscribe: (l) => {
        listeners.add(l)
        return () => listeners.delete(l)
      },
    } as ImageProvider & { version: number }
    const onOpenUrl = vi.fn()
    const { send, rowOf, clickAt, rows } = setup({ images: provider, mouse: { onOpenUrl } })
    await send(...clickAt(3, rowOf('click to show')))
    expect(provider.allow).toHaveBeenCalledWith('https://x/p.png')
    expect(rows().join('\n')).toContain('IMG')
    await send(...clickAt(3, rowOf('IMG')))
    expect(rows().join('\n')).toContain('click to shrink')
    expect(boxes.at(-1)).toEqual({ columns: 38, rows: 22 })
    await send(...clickAt(3, rowOf('IMG')))
    expect(rows().join('\n')).toContain('click to enlarge')
    await send(...clickAt(3, rowOf('IMG'), 16))
    expect(onOpenUrl).toHaveBeenCalledWith('https://x/p.png')
    state = { kind: 'loading' }
    provider.allow('x')
    await send(...clickAt(3, rowOf('loading')))
  })

  it('does nothing with an empty transcript or without mouse support', async () => {
    const { send, onScroll } = setup({ messages: [] })
    await send(sgr(64, 0, 0))
    expect(onScroll).not.toHaveBeenCalled()
    const view = render(
      <InkChatProvider>
        <TranscriptViewport
          messages={messages}
          width={40}
          height={10}
          scroll={scrollEnd}
          onScroll={onScroll}
        />
      </InkChatProvider>,
    )
    await act(async () => {
      view.stdin.write(sgr(64, 0, 0))
    })
    expect(onScroll).not.toHaveBeenCalled()
    // Defaults: escapes go to stdout, the wheel steps 3 lines.
    const own = render(
      <InkChatProvider>
        <TranscriptViewport
          messages={messages}
          width={40}
          height={4}
          scroll={scrollEnd}
          onScroll={onScroll}
          mouse={{}}
        />
      </InkChatProvider>,
    )
    expect(own.frames.join('')).toContain('?1002h')
    await act(async () => {
      own.stdin.write(sgr(64, 0, 0))
    })
    expect(onScroll).toHaveBeenCalledWith(expect.objectContaining({ follow: false }))
  })
})

describe('TranscriptViewport split reports', () => {
  it('acts on a mouse report split at every position', async () => {
    const report = sgr(64, 0, 0)
    for (let at = 1; at < report.length; at++) {
      const { send, onScroll, view } = setup()
      await send(report.slice(0, at))
      await send(report.slice(at))
      expect(onScroll).toHaveBeenCalledTimes(1)
      view.unmount()
    }
  })
})

describe('TranscriptViewport image provider wiring', () => {
  it('writes the provider query once and hands it the replies', async () => {
    const write = vi.fn()
    const takeReply = vi.fn((input: string) => input.includes('[6;'))
    const provider: ImageProvider = {
      get: () => undefined,
      allow: () => {},
      version: 0,
      subscribe: () => () => {},
      query: '\u001b[16t',
      takeReply,
    }
    const view = render(
      <InkChatProvider>
        <TranscriptViewport
          messages={messages}
          width={40}
          height={10}
          scroll={scrollEnd}
          onScroll={vi.fn()}
          images={provider}
          write={write}
        />
      </InkChatProvider>,
    )
    await act(async () => {
      view.stdin.write('\u001b[6;1')
      view.stdin.write('8;9t')
      view.stdin.write('x')
    })
    expect(write).toHaveBeenCalledWith('\u001b[16t')
    expect(write).toHaveBeenCalledTimes(1)
    // The reply arrived split; the provider sees it whole, and only it.
    expect(takeReply).toHaveBeenCalledTimes(1)
    expect(takeReply).toHaveBeenCalledWith('\u001b[6;18;9t')
  })
})
