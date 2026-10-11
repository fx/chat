/**
 * An image provider for terminals implementing the kitty graphics protocol,
 * drawing with Unicode placeholders: each image is transmitted once, quietly,
 * with one virtual placement sized to its cell box, and drawn as text — the
 * placeholder character per cell, the image id as a 256-colour foreground,
 * row and column as combining diacritics. The renderer lays that text out,
 * scrolls and clips it like any other line.
 *
 * Fetch policy: an image URL in an answer is attacker-controllable and can
 * leak the conversation through its query string, so only `data:` URLs load
 * without a click by default; anything else is `ask` until allowed. Fetches
 * without a click never follow redirects. A timeout and a size cap apply.
 */
import { Buffer } from 'node:buffer'
import type { CellBox, ImageProvider, ImageState } from '../lines/images'
import { DIACRITICS } from './diacritics'

const ESC = String.fromCharCode(27)
const PLACEHOLDER = String.fromCodePoint(0x10eeee)
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Ids available to images (the 256-colour foreground carries the id). */
export const MAX_IMAGES = 255

/** Whether the terminal speaks the kitty graphics protocol (and is not behind a multiplexer). */
export function detectKitty(env: Record<string, string | undefined> = process.env): boolean {
  if (env.TMUX || env.STY || /^(screen|tmux)/.test(env.TERM ?? '')) return false
  return (
    env.TERM_PROGRAM === 'ghostty' ||
    env.TERM_PROGRAM === 'kitty' ||
    Boolean(env.GHOSTTY_RESOURCES_DIR) ||
    Boolean(env.KITTY_WINDOW_ID) ||
    env.TERM === 'xterm-ghostty' ||
    env.TERM === 'xterm-kitty'
  )
}

export function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b)
}

/** A PNG's pixel size from its header. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (!isPng(bytes) || bytes.length < 24) return undefined
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

/** The cells an image of `px` pixels takes in `box`, keeping its aspect and never upscaling. */
export function fitCells(
  px: { width: number; height: number },
  box: CellBox,
  cell: { width: number; height: number },
): CellBox {
  const scale = Math.min(
    (box.columns * cell.width) / px.width,
    (box.rows * cell.height) / px.height,
    1,
  )
  return {
    columns: Math.max(1, Math.min(box.columns, Math.ceil((px.width * scale) / cell.width))),
    rows: Math.max(1, Math.min(box.rows, Math.ceil((px.height * scale) / cell.height))),
  }
}

/** Placeholder text for an image: one string per cell row. */
export function placeholderRows(columns: number, rows: number): string[] {
  const mark = (n: number) => String.fromCodePoint(DIACRITICS[n] as number)
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: columns }, (_, c) => `${PLACEHOLDER}${mark(r)}${mark(c)}`).join(''),
  )
}

const apc = (control: string, payload = '') =>
  `${ESC}_G${control}${payload ? `;${payload}` : ''}${ESC}\\`

/** Transmit PNG bytes quietly under `id`, in protocol-sized chunks. */
export function transmit(id: number, png: Uint8Array): string {
  const data = Buffer.from(png).toString('base64')
  const chunks = data.match(/.{1,4096}/g) ?? ['']
  return chunks
    .map((chunk, i) => {
      const more = i < chunks.length - 1 ? 1 : 0
      return i === 0 ? apc(`a=t,f=100,t=d,i=${id},q=2,m=${more}`, chunk) : apc(`m=${more}`, chunk)
    })
    .join('')
}

/** One virtual placement for `id`, sized to a cell box (replacing the previous one). */
export function place(id: number, box: CellBox): string {
  return apc(`a=p,U=1,i=${id},p=1,c=${box.columns},r=${box.rows},q=2`)
}

/** Forget an image and its placements. */
export function forget(id: number): string {
  return apc(`a=d,d=I,i=${id},q=2`)
}

/** Ask the terminal for its cell size in pixels. */
export const CELL_SIZE_QUERY = `${ESC}[16t`
const CELL_SIZE_REPLY = new RegExp(`^(?:${ESC})?\\[6;(\\d+);(\\d+)t`)

export interface KittyOptions {
  /** Writes escapes to the terminal (before the frame showing the placeholders). */
  write: (data: string) => void
  fetch?: typeof fetch
  /** Turns other formats into PNG bytes; without it they stay captions. */
  decode?: (bytes: Uint8Array, mediaType: string) => Promise<Uint8Array | undefined>
  /** Sources loaded without a click (default: `data:` URLs only). */
  autoFetch?: (src: string) => boolean
  /** Per fetch, in ms (default 15 s). */
  timeoutMs?: number
  /** Largest image in bytes (default 20 MB). */
  maxBytes?: number
}

export interface KittyProvider extends ImageProvider {
  /** The cell-size query (the viewport writes it once). */
  readonly query: string
  /** The current cell size in pixels (9×18 until the terminal answers). */
  readonly cellSize: { width: number; height: number }
  /** Recognise a cell-size reply; returns whether `input` was one. */
  takeReply(input: string): boolean
}

interface Entry {
  state: 'ask' | 'loading' | 'failed' | 'ready' | 'declined'
  error?: string
  png?: Uint8Array
  px?: { width: number; height: number }
  id?: number
  sent?: boolean
  placed?: string | undefined
}

function decodeDataUrl(src: string): { bytes: Uint8Array; mediaType: string } {
  const comma = src.indexOf(',')
  const header = src.slice(5, comma)
  const body = src.slice(comma + 1)
  const mediaType = header.split(';')[0] || 'text/plain'
  const bytes = header.endsWith(';base64')
    ? Buffer.from(body, 'base64')
    : Buffer.from(decodeURIComponent(body), 'utf8')
  return { bytes: new Uint8Array(bytes), mediaType }
}

export function createKittyProvider(options: KittyOptions): KittyProvider {
  const {
    write,
    decode,
    autoFetch = (src: string) => src.startsWith('data:'),
    timeoutMs = 15_000,
    maxBytes = 20 * 1024 * 1024,
  } = options
  const fetcher = options.fetch ?? globalThis.fetch
  const entries = new Map<string, Entry>()
  const allowed = new Set<string>()
  const listeners = new Set<() => void>()
  // Ids in assignment order: the first is the oldest.
  const ids: Array<{ id: number; src: string }> = []
  let version = 0
  let cell = { width: 9, height: 18 }

  const changed = () => {
    version++
    for (const listener of listeners) listener()
  }

  const fail = (entry: Entry, error: string) => {
    entry.state = 'failed'
    entry.error = error
  }

  async function bytesOf(src: string, clicked: boolean) {
    if (src.startsWith('data:')) return decodeDataUrl(src)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetcher(src, {
        redirect: clicked ? 'follow' : 'error',
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      if (Number(response.headers.get('content-length') ?? 0) > maxBytes)
        throw new Error('too large')
      const bytes = new Uint8Array(await response.arrayBuffer())
      clearTimeout(timer)
      return { bytes, mediaType: response.headers.get('content-type') ?? '' }
    } catch (error) {
      clearTimeout(timer)
      throw controller.signal.aborted ? new Error('timed out') : error
    }
  }

  async function load(src: string, entry: Entry, clicked: boolean) {
    entry.state = 'loading'
    try {
      const { bytes, mediaType } = await bytesOf(src, clicked)
      if (bytes.length > maxBytes) throw new Error('too large')
      const png = isPng(bytes) ? bytes : await decode?.(bytes, mediaType)
      const px = png && pngSize(png)
      if (!png || !px) entry.state = 'declined'
      else Object.assign(entry, { state: 'ready', png, px })
    } catch (error) {
      fail(entry, error instanceof Error ? error.message : String(error))
    }
    changed()
  }

  const entryFor = (src: string): Entry => {
    let entry = entries.get(src)
    if (!entry) {
      entry = { state: 'ask' }
      entries.set(src, entry)
      if (allowed.has(src) || autoFetch(src)) void load(src, entry, allowed.has(src))
    }
    return entry
  }

  const assignId = (src: string, entry: Entry): number => {
    if (entry.id !== undefined) return entry.id
    const used = new Set(ids.map((i) => i.id))
    let id = 1
    while (used.has(id) && id <= MAX_IMAGES) id++
    if (id > MAX_IMAGES) {
      // Forget the oldest image; it is fetched again if it returns to view.
      const oldest = ids.shift() as { id: number; src: string }
      write(forget(oldest.id))
      entries.delete(oldest.src)
      id = oldest.id
    }
    ids.push({ id, src })
    entry.id = id
    return id
  }

  return {
    get(src: string, box: CellBox): ImageState | undefined {
      const entry = entryFor(src)
      switch (entry.state) {
        case 'ask':
          return { kind: 'ask' }
        case 'loading':
          return { kind: 'loading' }
        case 'failed':
          return { kind: 'failed', error: entry.error as string }
        case 'declined':
          return undefined
      }
      const id = assignId(src, entry)
      if (!entry.sent) {
        write(transmit(id, entry.png as Uint8Array))
        entry.sent = true
      }
      const cells = fitCells(entry.px as { width: number; height: number }, box, cell)
      const key = `${cells.columns}x${cells.rows}`
      if (entry.placed !== key) {
        write(place(id, cells))
        entry.placed = key
      }
      return {
        kind: 'ready',
        rows: placeholderRows(cells.columns, cells.rows),
        color: `ansi256(${id})`,
      }
    },
    allow(src: string) {
      allowed.add(src)
      const entry = entries.get(src)
      if (!entry) entryFor(src)
      else if (entry.state === 'ask') void load(src, entry, true)
      changed()
    },
    get version() {
      return version
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    query: CELL_SIZE_QUERY,
    get cellSize() {
      return cell
    },
    takeReply(input: string): boolean {
      const match = CELL_SIZE_REPLY.exec(input)
      if (!match) return false
      const next = { width: Number(match[2]), height: Number(match[1]) }
      if (
        next.width > 0 &&
        next.height > 0 &&
        (next.width !== cell.width || next.height !== cell.height)
      ) {
        cell = next
        for (const entry of entries.values()) entry.placed = undefined
        changed()
      }
      return true
    },
  }
}
