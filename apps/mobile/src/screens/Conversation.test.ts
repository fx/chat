import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  conversationStyle,
  readAttachments,
  selectionAfterTap,
  unreadable,
  useFinishTransition,
  usePickedImages,
} from './Conversation'

function transcript() {
  const log = document.createElement('div')
  log.innerHTML = `
    <div class="chat-message" data-role="assistant" data-message-id="a1">
      <p>first</p><button>tile</button><div class="chat-footer"><button>copy</button></div>
    </div>
    <div class="chat-message" data-role="user" data-message-id="u1"><p>question</p></div>
    <div class="chat-message" data-role="assistant" data-message-id="a2"><p>second</p></div>
    <p class="empty">blank space</p>`
  const at = (selector: string) => log.querySelector(selector) as Element
  const tap = (selector: string, current?: string) =>
    selectionAfterTap({ target: at(selector), currentTarget: log }, current)
  return { tap }
}

describe('usePickedImages', () => {
  it('says when a pick has unreadable images, and clears once a pick reads them all', async () => {
    const restore = stubFileReading()
    try {
      const { result } = renderHook(() => usePickedImages())
      await act(() => result.current.add([image(), broken()]))
      expect(result.current.attachments).toHaveLength(1)
      expect(result.current.error).toBe(unreadable(1))
      // Picking again is the fix for a failed picker grant.
      await act(() => result.current.add([image('c.png')]))
      expect(result.current.attachments).toHaveLength(2)
      expect(result.current.error).toBeUndefined()
    } finally {
      restore()
    }
  })

  it('clears the images and the notice on send', async () => {
    const restore = stubFileReading()
    try {
      const { result } = renderHook(() => usePickedImages())
      await act(() => result.current.add([image(), broken()]))
      act(() => result.current.clear())
      expect(result.current.attachments).toEqual([])
      expect(result.current.error).toBeUndefined()
    } finally {
      restore()
    }
  })
})

describe('selectionAfterTap', () => {
  it('selects the tapped assistant message, and moves to another', () => {
    const { tap } = transcript()
    expect(tap('[data-message-id=a1] p')).toBe('a1')
    expect(tap('[data-message-id=a2] p', 'a1')).toBe('a2')
  })

  it('deselects on a second tap of its text, but not of a control in it', () => {
    const { tap } = transcript()
    expect(tap('[data-message-id=a1] p', 'a1')).toBeUndefined()
    expect(tap('[data-message-id=a1] > button', 'a1')).toBe('a1')
  })

  it('keeps the selection for taps on a footer or from outside the transcript', () => {
    const { tap } = transcript()
    expect(tap('.chat-footer button', 'a1')).toBe('a1')
    const portal = document.createElement('div')
    expect(
      selectionAfterTap({ target: portal, currentTarget: document.createElement('div') }, 'a1'),
    ).toBe('a1')
  })

  it('clears the selection for a user message or blank space', () => {
    const { tap } = transcript()
    expect(tap('[data-message-id=u1] p', 'a1')).toBeUndefined()
    expect(tap('.empty', 'a1')).toBeUndefined()
  })
})

describe('conversationStyle', () => {
  it('hides every footer but the selected and the last answer’s, and names the last one’s morph', () => {
    expect(conversationStyle(undefined, undefined)).toBe(
      '.conversation-log .chat-message .chat-footer { display: none; }',
    )
    const [hide, morph] = conversationStyle('a"1', 'a2').split('\n')
    expect(hide).toBe(
      '.conversation-log .chat-message:not([data-message-id="a\\"1"]):not([data-message-id="a2"]) .chat-footer { display: none; }',
    )
    expect(morph).toBe(
      '.conversation-log .chat-message[data-message-id="a2"] :is(.chat-tiles, .chat-footer) { view-transition-name: answer-activity; }',
    )
  })
})

describe('useFinishTransition', () => {
  const run = { messageId: 'a1' }
  const restore = { start: document.startViewTransition, media: window.matchMedia }
  afterEach(() => {
    document.startViewTransition = restore.start
    window.matchMedia = restore.media
  })
  const motion = (reduce: boolean) => {
    window.matchMedia = ((query: string) => ({ matches: reduce, media: query })) as never
  }

  it('shows a start at once, and commits the end inside a view transition', async () => {
    motion(false)
    const error = vi.spyOn(console, 'error')
    let inside: unknown = 'not called'
    const start = vi.fn((update: () => void) => {
      update()
      // The end is committed by the time the callback returns.
      inside = result.current
      return {} as ViewTransition
    })
    document.startViewTransition = start as never
    const { result, rerender } = renderHook(({ r }) => useFinishTransition(r), {
      initialProps: { r: undefined as typeof run | undefined },
    })
    rerender({ r: run })
    expect(result.current).toBe(run)
    rerender({ r: undefined })
    // Started after the effect, not during it.
    expect(start).not.toHaveBeenCalled()
    await act(async () => {})
    expect(start).toHaveBeenCalledOnce()
    expect(inside).toBeUndefined()
    expect(result.current).toBeUndefined()
    // No "flushSync was called from inside a lifecycle method" warning.
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('drops a pending end when a new run starts first', async () => {
    motion(false)
    const start = vi.fn((update: () => void) => {
      update()
      return {} as ViewTransition
    })
    document.startViewTransition = start as never
    const { result, rerender } = renderHook(({ r }) => useFinishTransition(r), {
      initialProps: { r: run as typeof run | undefined },
    })
    rerender({ r: undefined })
    const next = { messageId: 'a2' }
    rerender({ r: next })
    await act(async () => {})
    expect(start).not.toHaveBeenCalled()
    expect(result.current).toBe(next)
  })

  it('skips the commit when a new run starts before the transition calls back', async () => {
    motion(false)
    let pending: (() => void) | undefined
    document.startViewTransition = ((update: () => void) => {
      pending = update
      return {} as ViewTransition
    }) as never
    const { result, rerender } = renderHook(({ r }) => useFinishTransition(r), {
      initialProps: { r: run as typeof run | undefined },
    })
    rerender({ r: undefined })
    await act(async () => {})
    const next = { messageId: 'a2' }
    rerender({ r: next })
    act(() => pending?.())
    expect(result.current).toBe(next)
  })

  it('ends at once without view transitions, or when motion is reduced', () => {
    for (const [supported, reduce] of [
      [false, false],
      [true, true],
    ] as const) {
      motion(reduce)
      const start = vi.fn()
      document.startViewTransition = (supported ? start : undefined) as never
      const { result, rerender } = renderHook(({ r }) => useFinishTransition(r), {
        initialProps: { r: run as typeof run | undefined },
      })
      rerender({ r: undefined })
      expect(result.current).toBeUndefined()
      expect(start).not.toHaveBeenCalled()
    }
  })
})

/**
 * jsdom decodes no images (downscaling falls back to the original), and a file
 * named `b.png` fails to read, as when the picker's grant failed.
 */
function stubFileReading() {
  vi.stubGlobal(
    'Image',
    class {
      onerror?: () => void
      set src(_: string) {
        queueMicrotask(() => this.onerror?.())
      }
    },
  )
  const original = FileReader.prototype.readAsDataURL
  FileReader.prototype.readAsDataURL = function (this: FileReader, blob: Blob) {
    if ((blob as File).name === 'b.png') {
      Object.defineProperty(this, 'error', { value: new DOMException('gone', 'NotFoundError') })
      queueMicrotask(() => this.onerror?.(new ProgressEvent('error')))
      return
    }
    original.call(this, blob)
  }
  return () => {
    FileReader.prototype.readAsDataURL = original
    vi.unstubAllGlobals()
  }
}

const image = (name = 'a.png') => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' })
const broken = () => new File([], 'b.png', { type: 'image/png' })

describe('readAttachments', () => {
  it('reads images, skips other files, and counts the ones it cannot read', async () => {
    const text = new File(['x'], 'a.txt', { type: 'text/plain' })
    const restore = stubFileReading()
    try {
      const { added, failed } = await readAttachments([image(), text, broken()])
      expect(added).toHaveLength(1)
      expect(added[0]?.url).toMatch(/^data:image\/png/)
      expect(failed).toBe(1)
    } finally {
      restore()
    }
  })

  it('says how many could not be read', () => {
    expect(unreadable(1)).toBe('Couldn’t read that image. Try picking it again.')
    expect(unreadable(2)).toBe('Couldn’t read 2 of those images. Try picking them again.')
  })
})
