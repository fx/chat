/**
 * Images in the line viewport. How an image is drawn is injected: an image
 * provider answers per source and cell box with a state, and `ready` images
 * are rows of text (e.g. kitty Unicode placeholders) the viewport lays out,
 * scrolls and clips like any other line. Without a provider, or when it
 * declines, only a caption is drawn.
 */
import { stripControls } from '../sanitize'
import type { InkGlyphs } from '../theme'
import type { LineDraft } from './layout'
import { describeSource } from './markdown/inline'
import { wrapSpans } from './markdown/wrap'
import type { Measure } from './measure'
import { type Span, span } from './model'

/** A cell box: columns × rows. */
export interface CellBox {
  columns: number
  rows: number
}

export type ImageState =
  | { kind: 'ask' }
  | { kind: 'loading' }
  | { kind: 'failed'; error: string }
  /** One string per cell row, drawn as text in `color`. */
  | { kind: 'ready'; rows: string[]; color?: string }

export interface ImageProvider {
  /** The state for a source in a box, or undefined for "not mine — render as text". */
  get(src: string, box: CellBox): ImageState | undefined
  /** Allow an `ask` source (the user clicked it). */
  allow(src: string): void
  /** Bumped on any change; part of the layout cache key. */
  readonly version: number
  /** Called on every change; returns an unsubscribe. */
  subscribe(listener: () => void): () => void
  /** A terminal query the viewport writes once (e.g. the cell size in pixels). */
  readonly query?: string
  /** Recognise the terminal's reply to the query; returns whether `input` was one. */
  takeReply?(input: string): boolean
}

/** The largest thumbnail, in cells. */
export const THUMBNAIL: CellBox = { columns: 32, rows: 8 }

export interface ImageLayoutOptions {
  provider?: ImageProvider | undefined
  expanded: boolean
  /** Rows an expanded image may take. */
  maxHeight: number
  glyphs: InkGlyphs
  measure: Measure
}

const HINT: Record<ImageState['kind'], (state: ImageState, expanded: boolean) => string> = {
  ask: () => 'click to show',
  loading: () => 'loading…',
  failed: (state) => `✗ ${(state as { error: string }).error}`,
  ready: (_, expanded) => (expanded ? 'click to shrink' : 'click to enlarge'),
}

/** Lay out a block image: its ready rows, then a wrapped caption; every line targets the source. */
export function layoutImage(
  src: string,
  alt: string,
  width: number,
  { provider, expanded, maxHeight, glyphs, measure }: ImageLayoutOptions,
): LineDraft[] {
  const box: CellBox = expanded
    ? { columns: Math.max(1, width), rows: Math.max(1, maxHeight) }
    : { columns: Math.max(1, Math.min(THUMBNAIL.columns, width)), rows: THUMBNAIL.rows }
  const state = provider?.get(src, box)
  const target = { kind: 'image' as const, src }
  const image: LineDraft[] =
    state?.kind === 'ready'
      ? state.rows.map((row) => ({
          spans: [span(row, state.color ? { color: state.color } : {})],
          target,
        }))
      : []
  const caption: Span[] = [
    span(`${glyphs.image} `, { role: 'muted' }),
    ...(alt ? [span(alt, { role: 'content', italic: true }), span(' ')] : []),
    span(describeSource(src), { role: 'link' }),
    ...(state ? [span(` ${HINT[state.kind](state, expanded)}`, { role: 'muted', dim: true })] : []),
  ]
  // The caption carries the answer's alt and source and a provider's error text.
  const clean = caption.map((s) => ({ ...s, text: stripControls(s.text) }))
  return [...image, ...wrapSpans(clean, width, measure).map((row) => ({ ...row, target }))]
}
