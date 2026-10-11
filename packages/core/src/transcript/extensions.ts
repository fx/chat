/**
 * Render-layer extensibility types and pure helpers.
 *
 * The `extensions` prop is the single, OPTIONAL seam that lets a host render
 * application-specific surfaces — custom block kinds, bespoke per-tool rendering,
 * and custom top-level timeline items — WITHOUT mutating the closed core
 * `ContentBlock` union or forking the package renderers. When no `extensions`
 * prop is supplied, every helper here resolves to the default behavior so output
 * is byte-for-byte unchanged.
 *
 * Pure data + pure functions: no React, no DOM. This is the renderer-agnostic
 * half of the extension API; each renderer package (e.g. `@fx/chat`) adds the
 * renderer-bound half — the block/tool renderer component types, the
 * `ChatExtensions` object, and a `TimelineItem` specialized with its inline
 * render function.
 */
import type { ChatMessage, ContentBlock } from '../model'
import type { TimelineBehavior } from './grouping'

/**
 * A host-defined content block whose `type` is OUTSIDE the core `ContentBlock`
 * union. It still carries the structural minimum every renderer relies on — a
 * stable `id` (render key / grouping) and a `type` discriminant — plus any
 * host-specific fields. The core union stays closed; this is the open extension
 * shape passed to host renderers and to grouping.
 */
export interface CustomBlock {
  /** Stable id, usable as a render key. */
  id: string
  /** Custom discriminant — any string that is not a core `ContentBlock` type. */
  type: string
  /**
   * Optional summary label. When a NON-BLANK STRING, the grouping header
   * prefers it over the raw `type` when this block heads a collapsed
   * disclosure; any other value is ignored (treated as absent). Typed
   * `unknown` so hosts that already carry a non-string `label` payload keep
   * compiling — the runtime guard in `summarizeBlock` narrows it.
   */
  label?: unknown
  /** Arbitrary host-defined payload. */
  [key: string]: unknown
}

/**
 * A block as seen by the dispatch resolver: either a core block or a
 * host-defined custom block. The renderers narrow on `type` and fall back to the
 * extension maps (or the inert placeholder) for anything outside the core union.
 */
export type RenderableBlock = ContentBlock | CustomBlock

/**
 * A {@link ChatMessage} whose `blocks` MAY include host-defined custom kinds
 * (rendered through `extensions.blockRenderers`). This is the message shape the
 * render layer accepts so a TYPED host can pass custom blocks without an unsafe
 * cast. A plain `ChatMessage` is assignable to this (a `ContentBlock[]` is a
 * `RenderableBlock[]`), so the default, non-extended path is unaffected.
 */
export type RenderableMessage = Omit<ChatMessage, 'blocks'> & { blocks: RenderableBlock[] }

/** Props passed to every host-supplied block / tool renderer. */
export interface CustomRenderProps<TBlock = RenderableBlock> {
  /** The block being rendered (core shape for tool overrides, custom shape otherwise). */
  block: TBlock
  /** The owning message, for context the host may need. */
  message: RenderableMessage
  /** Whether THIS block is the actively-streaming one. */
  isStreaming: boolean
}

/**
 * Per-custom-kind grouping flags a host MAY supply to opt a custom block into the
 * auxiliary-run grouping policy. Absent flags ⇒ non-aux and not header-eligible
 * (the safe default — an unknown block never folds silently into a disclosure).
 */
export type CustomTimelineBehavior = Partial<TimelineBehavior>

/** Fields common to every {@link TimelineItem} variant. */
export interface TimelineItemBase {
  /** Stable id; surfaced as the `data-timeline-item-id` anchor. */
  id: string
  /** Ordering key (epoch ms) on the same axis as message `createdAt`. */
  at: number
}

/**
 * A host-defined top-level timeline item, interleaved among messages by `at`
 * (epoch ms, the same axis as message `createdAt`). It supplies EXACTLY ONE of:
 * an inline `render` function, OR a `kind` resolved through the renderer's
 * block-renderer map. The discriminated union rejects an item that combines or
 * omits both at compile time.
 *
 * @typeParam TNode - what the inline `render` returns; renderer packages
 *   specialize it (`@fx/chat` uses `ReactNode`). Core never calls `render`.
 */
export type TimelineItem<TNode = unknown> =
  | (TimelineItemBase & {
      /** Inline renderer for this item. */
      render: () => TNode
      kind?: never
      block?: never
    })
  | (TimelineItemBase & {
      /** A custom block resolved through the renderer's block-renderer map. */
      kind: string
      /** Optional block payload passed to the resolved block renderer. */
      block?: CustomBlock
      render?: never
    })

/** The set of core `ContentBlock` type discriminants. */
const CORE_BLOCK_TYPES = new Set<ContentBlock['type']>([
  'text',
  'reasoning',
  'status',
  'system',
  'tool_call',
  'plan',
])

/** True when `type` is one of the closed core `ContentBlock` variants. */
export function isCoreBlockType(type: string): type is ContentBlock['type'] {
  return CORE_BLOCK_TYPES.has(type as ContentBlock['type'])
}

/**
 * Look a key up in a host-supplied extension map by OWN property only.
 *
 * Host maps are plain objects, so a bracket lookup would otherwise resolve
 * inherited `Object.prototype` members (e.g. a tool literally named `constructor`
 * or `toString`) to a function the host never registered — rendering garbage or
 * crashing. Guarding with `Object.hasOwn` makes an unregistered key resolve to
 * `undefined`, so dispatch correctly falls through to the default/inert path.
 */
export function lookupExtension<T>(map: Record<string, T> | undefined, key: string): T | undefined {
  if (map && Object.hasOwn(map, key)) return map[key]
  return undefined
}

/**
 * The grouping default for a non-core (custom) block: non-aux and not
 * header-eligible. Exported so the merged behavior and tests share one source.
 */
export const NON_AUX_BEHAVIOR: TimelineBehavior = {
  auxEligible: false,
  eligibleForHeaderSummary: false,
}
