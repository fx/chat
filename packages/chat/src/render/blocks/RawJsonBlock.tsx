/**
 * `RawJsonBlockView` — renders an arbitrary value via the registry `JsonView`.
 *
 * Used by the `raw`/debug message mode (rendering the whole `ChatMessage` as
 * JSON) and as the catch-all for any value a host wants surfaced verbatim.
 */
import { cx } from '../../cx'
import { useChatClassNames, useChatComponents } from '../../registry'

/** Props for {@link RawJsonBlockView}. */
export interface RawJsonBlockViewProps {
  value: unknown
}

/** Renders `value` as pretty-printed JSON through the registry slot. */
export function RawJsonBlockView({ value }: RawJsonBlockViewProps) {
  const { JsonView } = useChatComponents()
  const cn = useChatClassNames()
  return (
    <div className={cx('chat-rawjson', cn.rawJson)}>
      <JsonView value={value} />
    </div>
  )
}
