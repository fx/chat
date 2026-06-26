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
 * Pure data + pure functions: no React, no DOM. (The inert fallback component and
 * the dispatch wiring live in the renderers.) Custom renderers themselves draw
 * their visual atoms from the registry via `useChatComponents()` like every other
 * renderer — the package never requires the host to import a UI kit.
 */
import type { ComponentType } from 'react'
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
  /** Arbitrary host-defined payload. */
  [key: string]: unknown
}

/**
 * A block as seen by the dispatch resolver: either a core block or a
 * host-defined custom block. The renderers narrow on `type` and fall back to the
 * extension maps (or the inert placeholder) for anything outside the core union.
 */
export type RenderableBlock = ContentBlock | CustomBlock

/** Props passed to every host-supplied block / tool renderer. */
export interface CustomRenderProps<TBlock = RenderableBlock> {
  /** The block being rendered (core shape for tool overrides, custom shape otherwise). */
  block: TBlock
  /** The owning message, for context the host may need. */
  message: ChatMessage
  /** Whether THIS block is the actively-streaming one. */
  isStreaming: boolean
}

/** A host block renderer for a custom `type`. */
export type CustomBlockRenderer = ComponentType<CustomRenderProps<CustomBlock>>

/** A host renderer overriding a specific `tool_call` by tool `name`. */
export type ToolRenderer = ComponentType<
  CustomRenderProps<Extract<ContentBlock, { type: 'tool_call' }>>
>

/**
 * Per-custom-kind grouping flags a host MAY supply to opt a custom block into the
 * auxiliary-run grouping policy. Absent flags ⇒ non-aux and not header-eligible
 * (the safe default — an unknown block never folds silently into a disclosure).
 */
export type CustomTimelineBehavior = Partial<TimelineBehavior>

/**
 * A host-defined top-level timeline item, interleaved among messages by `at`
 * (epoch ms, the same axis as message `createdAt`). Either supplies its own
 * `render` function, or a `kind` resolved through `blockRenderers`.
 */
export interface TimelineItem {
  /** Stable id; surfaced as the `data-timeline-item-id` anchor. */
  id: string
  /** Ordering key (epoch ms) on the same axis as message `createdAt`. */
  at: number
  /** Inline renderer for this item. */
  render?: () => import('react').ReactNode
  /** Or a custom block resolved through `extensions.blockRenderers`. */
  kind?: string
  /** Optional block payload passed to the resolved `blockRenderers[kind]`. */
  block?: CustomBlock
}

/**
 * The single OPTIONAL render-layer extension object. All three capabilities are
 * independent and optional. Identity-stable by the host (the package never
 * mutates it). SSR-safe: plain data + components.
 */
export interface ChatExtensions {
  /** Renderers keyed by custom block `type` (a value outside the core union). */
  blockRenderers?: Record<string, CustomBlockRenderer>
  /** Renderers keyed by tool `name`, rendered INSTEAD of the default tool block. */
  toolRenderers?: Record<string, ToolRenderer>
  /** Host-defined top-level timeline items, interleaved by `at`. */
  timelineItems?: TimelineItem[]
  /**
   * Optional per-custom-kind grouping flags, keyed by custom block `type` (and,
   * to override a tool's grouping, by tool `name`). Absent ⇒ non-aux for custom
   * kinds; tool overrides inherit `tool_call` grouping unless listed here.
   */
  timelineBehavior?: Record<string, CustomTimelineBehavior>
}

/** The set of core `ContentBlock` type discriminants. */
const CORE_BLOCK_TYPES = new Set<ContentBlock['type']>([
  'text',
  'reasoning',
  'status',
  'system',
  'tool_call',
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
