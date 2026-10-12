/**
 * The React-DOM half of the render-layer extension API.
 *
 * The renderer-agnostic data types (custom blocks, renderable messages,
 * timeline-behavior overrides, the timeline-item base) and their pure helpers
 * live in `@fx-/chat-core`; this module adds what only a React renderer can own:
 * the block/tool renderer component types, `TimelineItem` specialized with a
 * `ReactNode`-returning inline renderer, and the `ChatExtensions` object.
 */
import type {
  TimelineItem as CoreTimelineItem,
  CustomBlock,
  CustomRenderProps,
  CustomTimelineBehavior,
  ToolCallBlock,
} from '@fx-/chat-core'
import type { ComponentType, ReactNode } from 'react'

export type {
  CustomBlock,
  CustomRenderProps,
  CustomTimelineBehavior,
  RenderableBlock,
  RenderableMessage,
  TimelineItemBase,
} from '@fx-/chat-core'
export { isCoreBlockType, lookupExtension, NON_AUX_BEHAVIOR } from '@fx-/chat-core'

/** A host block renderer for a custom `type`. */
export type CustomBlockRenderer = ComponentType<CustomRenderProps<CustomBlock>>

/** A host renderer overriding a specific `tool_call` by tool `name`. */
export type ToolRenderer = ComponentType<CustomRenderProps<ToolCallBlock>>

/**
 * A host-defined top-level timeline item (see the core `TimelineItem`), whose
 * inline `render` returns a React node.
 */
export type TimelineItem = CoreTimelineItem<ReactNode>

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
