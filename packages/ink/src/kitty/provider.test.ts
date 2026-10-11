// @vitest-environment node
import { Buffer } from 'node:buffer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CELL_SIZE_QUERY,
  DIACRITICS,
  MAX_IMAGES,
  createKittyProvider,
  detectKitty,
  fitCells,
  forget,
  isPng,
  place,
  placeholderRows,
  pngSize,
  transmit,
} from '../kitty'
import { defaultMeasure } from '../lines/measure'

afterEach(() => {
  vi.useRealTimers()
})

/** A PNG header for `width`×`height` (enough for sizing; the terminal decodes the rest). */
function png(width: number, height: number, extra = 0): Uint8Array {
  const bytes = new Uint8Array(24 + extra)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}
const dataUrl = (bytes: Uint8Array, type = 'image/png') =>
  `data:${type};base64,${Buffer.from(bytes).toString('base64')}`
const flush = () => new Promise((r) => setTimeout(r, 0))
const response = (
  body: Uint8Array,
  init: { status?: number; headers?: Record<string, string> } = {},
) => new Response(body, { status: init.status ?? 200, headers: init.headers ?? {} })

describe('detectKitty', () => {
  it('recognises kitty and ghostty, but not behind a multiplexer', () => {
    expect(detectKitty({ TERM_PROGRAM: 'ghostty' })).toBe(true)
    expect(detectKitty({ TERM_PROGRAM: 'kitty' })).toBe(true)
    expect(detectKitty({ GHOSTTY_RESOURCES_DIR: '/x' })).toBe(true)
    expect(detectKitty({ KITTY_WINDOW_ID: '1' })).toBe(true)
    expect(detectKitty({ TERM: 'xterm-ghostty' })).toBe(true)
    expect(detectKitty({ TERM: 'xterm-kitty' })).toBe(true)
    expect(detectKitty({ TERM: 'xterm-256color' })).toBe(false)
    expect(detectKitty({ TERM_PROGRAM: 'kitty', TMUX: '/tmp/t' })).toBe(false)
    expect(detectKitty({ TERM_PROGRAM: 'kitty', STY: 's' })).toBe(false)
    expect(detectKitty({ TERM: 'screen-256color', KITTY_WINDOW_ID: '1' })).toBe(false)
    expect(typeof detectKitty()).toBe('boolean')
  })
})

describe('protocol pieces', () => {
  it('sniffs PNGs and reads their size', () => {
    expect(isPng(png(1, 1))).toBe(true)
    expect(isPng(new Uint8Array([1, 2]))).toBe(false)
    expect(pngSize(png(640, 480))).toEqual({ width: 640, height: 480 })
    expect(pngSize(png(1, 1).slice(0, 12))).toBeUndefined()
    expect(pngSize(new Uint8Array(30))).toBeUndefined()
  })

  it('fits images into a box keeping aspect, never upscaling', () => {
    const cell = { width: 10, height: 20 }
    expect(fitCells({ width: 640, height: 480 }, { columns: 32, rows: 8 }, cell)).toEqual({
      columns: 22,
      rows: 8,
    })
    expect(fitCells({ width: 30, height: 20 }, { columns: 32, rows: 8 }, cell)).toEqual({
      columns: 3,
      rows: 1,
    })
    expect(fitCells({ width: 1, height: 9000 }, { columns: 32, rows: 8 }, cell)).toEqual({
      columns: 1,
      rows: 8,
    })
  })

  it('draws placeholders one cell per column with row/column diacritics', () => {
    const rows = placeholderRows(3, 2)
    expect(rows).toHaveLength(2)
    expect(Array.from(rows[1] as string).map((c) => c.codePointAt(0))).toEqual([
      0x10eeee,
      DIACRITICS[1],
      DIACRITICS[0],
      0x10eeee,
      DIACRITICS[1],
      DIACRITICS[1],
      0x10eeee,
      DIACRITICS[1],
      DIACRITICS[2],
    ])
    expect(defaultMeasure(rows[0] as string)).toBe(3)
    expect(DIACRITICS).toHaveLength(297)
  })

  it('transmits in chunks, places virtually and forgets', () => {
    expect(transmit(7, new Uint8Array([1, 2, 3]))).toBe(
      '\u001b_Ga=t,f=100,t=d,i=7,q=2,m=0;AQID\u001b\\',
    )
    const big = transmit(1, new Uint8Array(4000))
    expect(big.split('\u001b_G')).toHaveLength(3)
    expect(big).toContain('m=1;')
    expect(big).toContain('\u001b_Gm=0;')
    expect(transmit(1, new Uint8Array(0))).toBe('\u001b_Ga=t,f=100,t=d,i=1,q=2,m=0\u001b\\')
    expect(place(3, { columns: 4, rows: 2 })).toBe('\u001b_Ga=p,U=1,i=3,p=1,c=4,r=2,q=2\u001b\\')
    expect(forget(3)).toBe('\u001b_Ga=d,d=I,i=3,q=2\u001b\\')
    expect(CELL_SIZE_QUERY).toBe('\u001b[16t')
  })
})

describe('createKittyProvider', () => {
  const box = { columns: 32, rows: 8 }

  it('loads data: URLs without a click, transmits once and re-places on a new box', async () => {
    const write = vi.fn()
    const provider = createKittyProvider({ write })
    const listener = vi.fn()
    const off = provider.subscribe(listener)
    const src = dataUrl(png(90, 36))
    expect(provider.get(src, box)).toEqual({ kind: 'loading' })
    await flush()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(provider.version).toBe(1)
    const ready = provider.get(src, box)
    expect(ready).toMatchObject({ kind: 'ready', color: 'ansi256(1)' })
    expect(ready?.kind === 'ready' && ready.rows).toHaveLength(2)
    expect(write.mock.calls.map(([d]) => (d as string).slice(0, 8))).toEqual([
      '\u001b_Ga=t,f',
      '\u001b_Ga=p,U',
    ])
    provider.get(src, box)
    expect(write).toHaveBeenCalledTimes(2)
    provider.get(src, { columns: 4, rows: 1 })
    expect(write).toHaveBeenLastCalledWith(place(1, { columns: 4, rows: 1 }))
    off()
  })

  it('reads the cell size reply once, re-placing images', async () => {
    const write = vi.fn()
    const provider = createKittyProvider({ write })
    const src = dataUrl(png(90, 36))
    provider.get(src, box)
    await flush()
    provider.get(src, box)
    expect(provider.cellSize).toEqual({ width: 9, height: 18 })
    expect(provider.takeReply('a')).toBe(false)
    expect(provider.takeReply('\u001b[6;36;18t')).toBe(true)
    expect(provider.cellSize).toEqual({ width: 18, height: 36 })
    expect(provider.version).toBe(2)
    expect(provider.takeReply('[6;36;18t')).toBe(true)
    expect(provider.takeReply('[6;0;0t')).toBe(true)
    expect(provider.version).toBe(2)
    provider.get(src, box)
    expect(write).toHaveBeenLastCalledWith(place(1, { columns: 5, rows: 1 }))
  })

  it('asks before fetching other sources; clicked fetches follow redirects', async () => {
    const fetch = vi.fn(async () =>
      response(png(9, 18), { headers: { 'content-length': '24', 'content-type': 'image/png' } }),
    )
    const provider = createKittyProvider({ write: vi.fn(), fetch })
    expect(provider.get('https://x/a.png', box)).toEqual({ kind: 'ask' })
    expect(fetch).not.toHaveBeenCalled()
    provider.allow('https://x/a.png')
    expect(provider.get('https://x/a.png', box)).toEqual({ kind: 'loading' })
    await flush()
    expect(fetch).toHaveBeenCalledWith(
      'https://x/a.png',
      expect.objectContaining({ redirect: 'follow' }),
    )
    expect(provider.get('https://x/a.png', box)?.kind).toBe('ready')
    provider.allow('https://x/a.png')
    expect(fetch).toHaveBeenCalledTimes(1)
    provider.allow('https://x/b.png')
    expect(provider.get('https://x/b.png', box)).toEqual({ kind: 'loading' })
  })

  it('auto-fetches what the host allows, without redirects', async () => {
    const fetch = vi.fn(async () => response(png(9, 18)))
    const provider = createKittyProvider({
      write: vi.fn(),
      fetch,
      autoFetch: (src) => src.startsWith('https://ok/'),
    })
    provider.get('https://ok/i.png', box)
    await flush()
    expect(fetch).toHaveBeenCalledWith(
      'https://ok/i.png',
      expect.objectContaining({ redirect: 'error' }),
    )
  })

  it('fails on HTTP errors, oversize images and timeouts', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('404')) return response(new Uint8Array(), { status: 404 })
      if (url.endsWith('declared'))
        return response(png(1, 1), { headers: { 'content-length': '999' } })
      if (url.endsWith('big')) return response(png(1, 1, 100))
      if (url.endsWith('throws')) throw 'boom'
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    })
    const provider = createKittyProvider({ write: vi.fn(), fetch, maxBytes: 50, timeoutMs: 1000 })
    for (const src of ['404', 'declared', 'big', 'throws', 'slow'])
      provider.allow(`https://x/${src}`)
    await vi.advanceTimersByTimeAsync(1000)
    const errors = ['404', 'declared', 'big', 'throws', 'slow'].map((s) =>
      provider.get(`https://x/${s}`, box),
    )
    expect(errors).toEqual([
      { kind: 'failed', error: 'HTTP 404' },
      { kind: 'failed', error: 'too large' },
      { kind: 'failed', error: 'too large' },
      { kind: 'failed', error: 'boom' },
      { kind: 'failed', error: 'timed out' },
    ])
  })

  it('stops reading an undeclared body at the cap instead of buffering it', async () => {
    let pulled = 0
    let cancelled = false
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++
        controller.enqueue(new Uint8Array(16))
      },
      cancel() {
        cancelled = true
      },
    })
    const fetch = vi.fn(async (url: string) =>
      url.endsWith('empty') ? new Response(null) : new Response(endless),
    )
    const provider = createKittyProvider({ write: vi.fn(), fetch, maxBytes: 50 })
    provider.allow('https://x/endless')
    provider.allow('https://x/empty')
    await vi.waitFor(() =>
      expect(provider.get('https://x/endless', box)).toEqual({
        kind: 'failed',
        error: 'too large',
      }),
    )
    expect(cancelled).toBe(true)
    expect(pulled).toBeLessThan(8)
    // No body at all is no image.
    expect(provider.get('https://x/empty', box)).toBeUndefined()
  })

  it('assembles a chunked body under the cap', async () => {
    const bytes = png(9, 18, 40)
    const chunked = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 10) controller.enqueue(bytes.slice(i, i + 10))
        controller.close()
      },
    })
    const provider = createKittyProvider({
      write: vi.fn(),
      fetch: vi.fn(async () => new Response(chunked)),
      maxBytes: 64,
    })
    provider.allow('https://x/chunked')
    await vi.waitFor(() => expect(provider.get('https://x/chunked', box)?.kind).toBe('ready'))
  })

  it('refuses an oversize data URL before decoding it', async () => {
    const from = vi.spyOn(Buffer, 'from')
    const provider = createKittyProvider({ write: vi.fn(), maxBytes: 30 })
    const big = dataUrl(png(1, 1, 100)) // 124 bytes: two pads
    const padded = dataUrl(png(1, 1, 8)) // 32 bytes: one pad
    const exact = dataUrl(png(9, 18, 6)) // 30 bytes: no pad, at the cap
    const text = `data:,${'x'.repeat(91)}`
    for (const src of [big, padded, exact, text]) provider.get(src, box)
    await flush()
    expect(provider.get(big, box)).toEqual({ kind: 'failed', error: 'too large' })
    expect(provider.get(padded, box)).toEqual({ kind: 'failed', error: 'too large' })
    expect(provider.get(text, box)).toEqual({ kind: 'failed', error: 'too large' })
    expect(provider.get(exact, box)?.kind).toBe('ready')
    // A body whose floor fits but whose decoding does not still fails after decoding.
    const raw = `data:,${'x'.repeat(40)}`
    provider.get(raw, box)
    await flush()
    expect(provider.get(raw, box)).toEqual({ kind: 'failed', error: 'too large' })
    const decoded = from.mock.calls.map(([body]) => body)
    for (const src of [big, padded, text])
      expect(decoded).not.toContain(src.slice(src.indexOf(',') + 1))
    from.mockRestore()
  })

  it('decodes other formats through the host, else declines them', async () => {
    const jpeg = dataUrl(new Uint8Array([0xff, 0xd8, 0xff]), 'image/jpeg')
    const declined = createKittyProvider({ write: vi.fn() })
    declined.get(jpeg, box)
    await flush()
    expect(declined.get(jpeg, box)).toBeUndefined()
    const decode = vi.fn(async () => png(9, 18))
    const decoded = createKittyProvider({ write: vi.fn(), decode })
    decoded.get(jpeg, box)
    await flush()
    expect(decode).toHaveBeenCalledWith(expect.any(Uint8Array), 'image/jpeg')
    expect(decoded.get(jpeg, box)?.kind).toBe('ready')
    const text = createKittyProvider({ write: vi.fn(), decode: async () => undefined })
    text.get('data:,hello%20there', box)
    text.get('data:;base64,AA', box)
    await flush()
    expect(text.get('data:,hello%20there', box)).toBeUndefined()
  })

  it('reuses the oldest id past 255 images, forgetting that image', async () => {
    const write = vi.fn()
    const provider = createKittyProvider({ write })
    const srcs = Array.from({ length: MAX_IMAGES + 1 }, (_, i) => dataUrl(png(9 + i, 18)))
    for (const src of srcs) provider.get(src, box)
    await flush()
    for (const src of srcs) provider.get(src, box)
    expect(write).toHaveBeenCalledWith(forget(1))
    expect(provider.get(srcs.at(-1) as string, box)).toMatchObject({ color: 'ansi256(1)' })
    // The forgotten image loads again when it returns to view.
    expect(provider.get(srcs[0] as string, box)).toEqual({ kind: 'loading' })
  })
})
