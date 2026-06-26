/**
 * `TimelineItemView` — renders one host-defined custom timeline item, wrapped
 * with the stable `data-timeline-item-id` anchor (mirroring the `data-message-id`
 * contract).
 *
 * An item either supplies its own `render` function, or a `kind` resolved through
 * `extensions.blockRenderers`. When neither resolves to a renderer, the item
 * wrapper renders inertly (never throws) so an unknown kind can't crash the log.
 */
import type { ChatExtensions, CustomBlock, RenderableMessage, TimelineItem } from './extensions'
import { lookupExtension } from './extensions'

/** Props for {@link TimelineItemView}. */
export interface TimelineItemViewProps {
  item: TimelineItem
  /** Extensions registry — used to resolve a `kind` through `blockRenderers`. */
  extensions?: ChatExtensions
}

/** Renders a single custom timeline item under its anchor wrapper. */
export function TimelineItemView({ item, extensions }: TimelineItemViewProps) {
  return (
    <div className="chat-timeline-item" data-timeline-item-id={item.id}>
      <TimelineItemBody item={item} {...(extensions ? { extensions } : {})} />
    </div>
  )
}

/** Resolves the item to a node: inline `render`, else `blockRenderers[kind]`, else inert. */
function TimelineItemBody({ item, extensions }: TimelineItemViewProps) {
  if (item.render) return <>{item.render()}</>

  if (item.kind) {
    const Renderer = lookupExtension(extensions?.blockRenderers, item.kind)
    if (Renderer) {
      const block: CustomBlock = item.block ?? { id: item.id, type: item.kind }
      // A standalone timeline item has no owning message; supply a minimal,
      // synthetic one so the renderer's prop contract is satisfied.
      const message: RenderableMessage = { id: item.id, role: 'assistant', blocks: [] }
      return <Renderer block={block} message={message} isStreaming={false} />
    }
  }

  return null
}
