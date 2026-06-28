/**
 * `InertBlockView` — the safe, inert fallback for a block whose `type` is neither
 * a core variant nor present in `extensions.blockRenderers`.
 *
 * Forward-compatibility: a host (or a newer transcript) can introduce a block
 * `type` the current renderer does not know WITHOUT crashing the log. In `raw`
 * (debug) mode it surfaces the block as JSON via the registry `JsonView`;
 * otherwise it renders nothing visible. It NEVER throws.
 */
import { cx } from '../../cx'
import { useChatClassNames, useChatComponents } from '../../registry'
import type { RenderableBlock } from '../extensions'

/** Props for {@link InertBlockView}. */
export interface InertBlockViewProps {
  block: RenderableBlock
  /** When true, surface the unknown block as JSON instead of an empty render. */
  raw?: boolean
}

/** Renders the inert placeholder for an unknown block type. */
export function InertBlockView({ block, raw = false }: InertBlockViewProps) {
  const { JsonView } = useChatComponents()
  const cn = useChatClassNames()
  return (
    <div
      className={cx('chat-inert-block', cn.inertBlock)}
      data-block-type={block.type}
      data-inert="true"
    >
      {raw ? <JsonView value={block} /> : null}
    </div>
  )
}
