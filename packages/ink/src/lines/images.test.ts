import { describe, expect, it } from 'vitest'
import { plainGlyphs } from '../theme'
import { type ImageProvider, type ImageState, THUMBNAIL, layoutImage } from './images'
import type { LineDraft } from './layout'
import { defaultMeasure } from './measure'

const text = (line: LineDraft) => line.spans.map((s) => s.text).join('')
const fixed = (state: ImageState | undefined, boxes: unknown[] = []): ImageProvider => ({
  get: (_src, box) => {
    boxes.push(box)
    return state
  },
  allow: () => {},
  version: 0,
  subscribe: () => () => {},
})
const base = { expanded: false, maxHeight: 20, glyphs: plainGlyphs, measure: defaultMeasure }

describe('layoutImage', () => {
  it('draws only a caption without a provider, or when it declines', () => {
    const lines = layoutImage('https://x/cat.png', 'a cat', 40, base)
    expect(lines.map(text)).toEqual(['🖼 a cat https://x/cat.png'])
    expect(lines[0]?.target).toEqual({ kind: 'image', src: 'https://x/cat.png' })
    expect(
      layoutImage('data:image/png;base64,AA', '', 40, { ...base, provider: fixed(undefined) }).map(
        text,
      ),
    ).toEqual(['🖼 image/png'])
  })

  it('adds a state hint for ask, loading and failed', () => {
    const hint = (state: ImageState) =>
      text(layoutImage('s', 'a', 60, { ...base, provider: fixed(state) })[0] as LineDraft)
    expect(hint({ kind: 'ask' })).toBe('🖼 a s click to show')
    expect(hint({ kind: 'loading' })).toBe('🖼 a s loading…')
    expect(hint({ kind: 'failed', error: 'HTTP 404' })).toBe('🖼 a s ✗ HTTP 404')
  })

  it('draws ready rows in a thumbnail box, or expanded to the width and max height', () => {
    const boxes: unknown[] = []
    const ready: ImageState = { kind: 'ready', rows: ['ab', 'cd'], color: 'ansi256(3)' }
    const thumb = layoutImage('s', '', 80, { ...base, provider: fixed(ready, boxes) })
    expect(thumb.map(text)).toEqual(['ab', 'cd', '🖼 s click to enlarge'])
    expect(thumb[0]?.spans[0]).toEqual({ text: 'ab', color: 'ansi256(3)' })
    expect(thumb.every((l) => l.target?.kind === 'image')).toBe(true)
    layoutImage('s', '', 10, { ...base, provider: fixed(ready, boxes) })
    const big = layoutImage('s', '', 80, {
      ...base,
      expanded: true,
      provider: fixed({ kind: 'ready', rows: ['x'] }, boxes),
    })
    expect(big.map(text)).toEqual(['x', '🖼 s click to shrink'])
    expect(big[0]?.spans[0]).toEqual({ text: 'x' })
    layoutImage('s', '', 0, {
      ...base,
      expanded: true,
      maxHeight: 0,
      provider: fixed(ready, boxes),
    })
    expect(boxes).toEqual([
      THUMBNAIL,
      { columns: 10, rows: 8 },
      { columns: 80, rows: 20 },
      { columns: 1, rows: 1 },
    ])
  })

  it('wraps a long caption', () => {
    const lines = layoutImage('https://example.com/a/very/long/path.png', 'alt text', 20, base)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.every((l) => l.target?.kind === 'image')).toBe(true)
  })
})
