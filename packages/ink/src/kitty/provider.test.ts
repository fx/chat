// @vitest-environment node
import { Buffer } from 'node:buffer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CELL_SIZE_QUERY,
  DIACRITICS,
  MAX_CELLS,
  MAX_IMAGES,
  MAX_IMAGE_SIDE,
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
  view.setUint32(8, 13)
  view.setUint32(12, 0x49484452) // IHDR
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

  it('refuses a PNG header without an IHDR or with impossible dimensions', () => {
    const noIhdr = png(10, 10)
    noIhdr[12] = 0x78
    expect(pngSize(noIhdr)).toBeUndefined()
    const badLength = png(10, 10)
    badLength[11] = 12
    expect(pngSize(badLength)).toBeUndefined()
    expect(pngSize(png(0, 10))).toBeUndefined()
    expect(pngSize(png(10, 0))).toBeUndefined()
    expect(pngSize(png(2 ** 31, 1))).toBeUndefined()
    expect(pngSize(png(1, 2 ** 31))).toBeUndefined()
    expect(pngSize(png(2 ** 31 - 1, 1))).toEqual({ width: 2 ** 31 - 1, height: 1 })
  })

  it('never fits more cells than there are diacritics', () => {
    expect(MAX_CELLS).toBe(DIACRITICS.length)
    const cell = { width: 1, height: 1 }
    expect(fitCells({ width: 1000, height: 1000 }, { columns: 400, rows: 500 }, cell)).toEqual({
      columns: MAX_CELLS,
      rows: MAX_CELLS,
    })
    // The aspect is kept within the capped box.
    expect(fitCells({ width: 1000, height: 500 }, { columns: 1000, rows: 1000 }, cell)).toEqual({
      columns: MAX_CELLS,
      rows: Math.ceil(MAX_CELLS / 2),
    })
    const rows = placeholderRows(400, 300)
    expect(rows).toHaveLength(MAX_CELLS)
    const last = Array.from(rows.at(-1) as string).map((c) => c.codePointAt(0))
    expect(last).toHaveLength(MAX_CELLS * 3)
    expect(last.slice(-3)).toEqual([0x10eeee, DIACRITICS.at(-1), DIACRITICS.at(-1)])
    expect(last).not.toContain(0)
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
    const decoded = from.mock.calls.map(([body]) => body)
    for (const src of [big, padded, text])
      expect(decoded).not.toContain(src.slice(src.indexOf(',') + 1))
    from.mockRestore()
  })

  it('counts a percent-encoded body exactly and refuses it before decoding', async () => {
    const decodeUri = vi.spyOn(globalThis, 'decodeURIComponent')
    const encodeInto = vi.spyOn(TextEncoder.prototype, 'encodeInto')
    const percent = (bytes: Uint8Array) =>
      `data:image/png,${Array.from(bytes, (b) => `%${b.toString(16).padStart(2, '0')}`).join('')}`
    const provider = createKittyProvider({ write: vi.fn(), maxBytes: 30 })
    // 31 escapes: 93 encoded characters, past the cap by one decoded byte.
    const over = percent(png(1, 1, 7))
    // 31 decoded bytes from 3-byte characters: under the old floor of a third, still over.
    const wide = `data:,${'你'.repeat(10)}x`
    const pair = `data:,${'🙂'.repeat(7)}xxx`
    for (const src of [over, wide, pair]) provider.get(src, box)
    await flush()
    for (const src of [over, wide, pair])
      expect(provider.get(src, box)).toEqual({ kind: 'failed', error: 'too large' })
    expect(decodeUri).not.toHaveBeenCalled()
    expect(encodeInto).not.toHaveBeenCalled()
    decodeUri.mockRestore()
    encodeInto.mockRestore()
  })

  it('percent-decodes to raw bytes, at the cap', async () => {
    const decode = vi.fn(async () => undefined)
    const provider = createKittyProvider({ write: vi.fn(), maxBytes: 30, decode })
    // A PNG at the cap, its non-ASCII bytes escaped and its ASCII ones literal.
    const bytes = png(9, 18, 6)
    const body = Array.from(bytes, (b) =>
      b >= 0x30 && b < 0x7b && /[\w]/.test(String.fromCharCode(b))
        ? String.fromCharCode(b)
        : `%${b.toString(16).toUpperCase().padStart(2, '0')}`,
    ).join('')
    const exact = `data:image/png,${body}`
    provider.get(exact, box)
    // Mixed text: a stray '%', a two-, three- and four-byte character, a lone surrogate.
    const mixed = 'data:text/plain,a%zz%4é你🙂\ud800%41'
    provider.get(mixed, box)
    await flush()
    expect(provider.get(exact, box)?.kind).toBe('ready')
    expect(provider.get(mixed, box)).toBeUndefined()
    const [mixedBytes] = decode.mock.calls[0] as unknown as [Uint8Array]
    expect(Buffer.from(mixedBytes).toString('utf8')).toBe('a%zz%4é你🙂\ufffdA')
  })

  it('holds a decoder’s PNG to the cap and never transmits one past it', async () => {
    const write = vi.fn()
    const decode = vi.fn(async (bytes: Uint8Array) => png(4, 4, bytes[0] as number))
    const provider = createKittyProvider({ write, maxBytes: 30, decode })
    const over = dataUrl(new Uint8Array([7]), 'image/jpeg')
    const at = dataUrl(new Uint8Array([6]), 'image/jpeg')
    provider.get(over, box)
    provider.get(at, box)
    await flush()
    expect(provider.get(over, box)).toEqual({ kind: 'failed', error: 'too large' })
    expect(provider.get(at, box)?.kind).toBe('ready')
    const transmitted = write.mock.calls.filter(([d]) => (d as string).startsWith('\u001b_Ga=t'))
    expect(transmitted).toEqual([[transmit(1, png(4, 4, 6))]])
  })

  it('fails a data URL without a body', async () => {
    const provider = createKittyProvider({ write: vi.fn() })
    provider.get('data:image/png;base64', box)
    await flush()
    expect(provider.get('data:image/png;base64', box)).toEqual({
      kind: 'failed',
      error: 'malformed data URL',
    })
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
    const listener = vi.fn()
    provider.subscribe(listener)
    const srcs = Array.from({ length: MAX_IMAGES + 1 }, (_, i) => dataUrl(png(9 + i, 18)))
    for (const src of srcs) provider.get(src, box)
    await flush()
    const before = provider.version
    listener.mockClear()
    for (const src of srcs) provider.get(src, box)
    expect(write).toHaveBeenCalledWith(forget(1))
    // Layouts cached with the forgotten image are redrawn, after the calling pass.
    expect(provider.version).toBe(before)
    await flush()
    expect(provider.version).toBe(before + 1)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(provider.get(srcs.at(-1) as string, box)).toMatchObject({ color: 'ansi256(1)' })
    // The forgotten image loads again when it returns to view.
    expect(provider.get(srcs[0] as string, box)).toEqual({ kind: 'loading' })
  })

  it('bounds a PNG by its pixels, not only its bytes, and never transmits past them', async () => {
    const write = vi.fn()
    const provider = createKittyProvider({ write, maxMegapixels: 0.01 })
    const wide = dataUrl(png(MAX_IMAGE_SIDE + 1, 1))
    const tall = dataUrl(png(1, MAX_IMAGE_SIDE + 1))
    const many = dataUrl(png(101, 100)) // 10 100 px: past 0.01 MP
    const at = dataUrl(png(100, 100))
    const malformed = dataUrl(png(0, 10))
    for (const src of [wide, tall, many, at, malformed]) provider.get(src, box)
    await flush()
    for (const src of [wide, tall, many])
      expect(provider.get(src, box)).toEqual({ kind: 'failed', error: 'too large' })
    expect(provider.get(malformed, box)).toEqual({ kind: 'failed', error: 'malformed image' })
    expect(provider.get(at, box)?.kind).toBe('ready')
    const transmitted = write.mock.calls.filter(([d]) => (d as string).startsWith('\u001b_Ga=t'))
    expect(transmitted).toEqual([[transmit(1, png(100, 100))]])
  })

  it('defaults to 50 megapixels and holds a decoder’s PNG to the same bounds', async () => {
    const sizes: Record<number, Uint8Array> = {
      1: png(8000, 6250), // 50 MP: at the bound
      2: png(8000, 6251),
      3: new Uint8Array([1, 2, 3]),
    }
    const decode = vi.fn(async (bytes: Uint8Array) => sizes[bytes[0] as number])
    const provider = createKittyProvider({ write: vi.fn(), decode })
    const srcs = [1, 2, 3].map((n) => dataUrl(new Uint8Array([n]), 'image/jpeg'))
    for (const src of srcs) provider.get(src, box)
    await flush()
    expect(srcs.map((src) => provider.get(src, box))).toEqual([
      expect.objectContaining({ kind: 'ready' }),
      { kind: 'failed', error: 'too large' },
      { kind: 'failed', error: 'malformed image' },
    ])
  })

  it('cancels a refused response body instead of leaving it open', async () => {
    const cancelled: string[] = []
    const body = (name: string) =>
      new ReadableStream<Uint8Array>({
        cancel() {
          cancelled.push(name)
        },
      })
    const fetch = vi.fn(async (url: string) =>
      url.endsWith('404')
        ? new Response(body('404'), { status: 404 })
        : new Response(body('declared'), { headers: { 'content-length': '999' } }),
    )
    const provider = createKittyProvider({ write: vi.fn(), fetch, maxBytes: 50 })
    provider.allow('https://x/404')
    provider.allow('https://x/declared')
    await vi.waitFor(() => expect(cancelled.sort()).toEqual(['404', 'declared']))
    expect(provider.get('https://x/404', box)).toEqual({ kind: 'failed', error: 'HTTP 404' })
    expect(provider.get('https://x/declared', box)).toEqual({ kind: 'failed', error: 'too large' })
  })

  it('refuses option values that would disable a bound', () => {
    const write = vi.fn()
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createKittyProvider({ write, maxBytes: bad })).toThrow(RangeError)
      expect(() => createKittyProvider({ write, maxMegapixels: bad })).toThrow(RangeError)
      expect(() => createKittyProvider({ write, timeoutMs: bad })).toThrow(RangeError)
    }
    // Past the longest timer, setTimeout fires at once: every fetch would time out.
    expect(() => createKittyProvider({ write, timeoutMs: 2 ** 31 })).toThrow(/timeoutMs/)
    expect(() => createKittyProvider({ write, timeoutMs: 2 ** 31 - 1 })).not.toThrow()
  })
})
