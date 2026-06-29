/**
 * `ToolCallBlockView` — a collapsible tool-invocation block.
 *
 * Shows the tool name, the INPUT arguments, the OUTPUT result when present, and
 * any extracted `media` (image/audio). Error state is driven solely by
 * `status === 'error'` (never by inspecting `result`): an error is styled as an
 * error, defaults to expanded, and surfaces a non-color "Error" text marker on
 * the collapsed header (via {@link CollapsibleRow}'s `error` prop) so the
 * failure never rests on color alone (WCAG 1.4.1).
 */
import { cx } from '../../cx'
import type { ToolCallBlock } from '../../model'
import { useChatClassNames, useChatComponents } from '../../registry'
import { CollapsibleRow } from '../CollapsibleRow'

/** Props for {@link ToolCallBlockView}. */
export interface ToolCallBlockViewProps {
  block: ToolCallBlock
  /** Default-open state (e.g. driven by a verbose toggle). Error overrides this. */
  defaultOpen?: boolean | undefined
}

/**
 * Render a single tool-media item as an image or audio affordance. The media
 * carries no caption, so an accessible name is derived from the owning tool's
 * name and the item's position so assistive tech can identify each item.
 */
function MediaItem({
  kind,
  url,
  label,
}: {
  kind: 'image' | 'audio'
  url: string
  label: string
}) {
  const cn = useChatClassNames()
  if (kind === 'image') {
    return <img className={cx('chat-tool-media-image', cn.toolMediaImage)} src={url} alt={label} />
  }
  return (
    <audio
      className={cx('chat-tool-media-audio', cn.toolMediaAudio)}
      controls
      src={url}
      aria-label={label}
    >
      <track kind="captions" />
    </audio>
  )
}

/**
 * Renders the tool_call block. The active state (spinner/live timer) covers any
 * not-yet-complete call — `status === 'pending' || status === 'running'` (a
 * queued/in-flight call is not done); error styling + default-open follow
 * `status === 'error'`.
 */
export function ToolCallBlockView({ block, defaultOpen }: ToolCallBlockViewProps) {
  const { JsonView } = useChatComponents()
  const cn = useChatClassNames()
  const isError = block.status === 'error'
  const isActive = block.status === 'running' || block.status === 'pending'
  const hasResult = block.result !== undefined
  const media = block.media ?? []

  return (
    <CollapsibleRow
      label={block.name}
      iconName="wrench"
      isActive={isActive}
      startedAt={block.startedAt}
      durationMs={block.durationMs}
      error={isError}
      defaultOpen={isError ? true : defaultOpen}
      alwaysShow
    >
      <div className={cx('chat-tool-body', cn.toolBody)}>
        <div className={cx('chat-tool-section', cn.toolSection)} data-section="input">
          <span className={cx('chat-tool-section-label', cn.toolSectionLabel)}>Input</span>
          <JsonView value={block.arguments} />
        </div>
        {hasResult ? (
          <div className={cx('chat-tool-section', cn.toolSection)} data-section="output">
            <span className={cx('chat-tool-section-label', cn.toolSectionLabel)}>Output</span>
            <JsonView value={block.result} />
          </div>
        ) : null}
        {media.length > 0 ? (
          <div className={cx('chat-tool-media', cn.toolMedia)} data-section="media">
            {media.map((item, index) => (
              // Media items are positional and non-reordering; url+index is stable.
              <MediaItem
                key={`${item.kind}-${index}-${item.url}`}
                kind={item.kind}
                url={item.url}
                label={`${block.name} ${item.kind} ${index + 1}`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </CollapsibleRow>
  )
}
