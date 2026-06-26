/**
 * The render surface of `@fx/chat`: the message log, per-block renderers, the
 * collapsible substrate, the streaming/timing hooks, the timeline-behavior
 * grouping policy + grouped renderer, the footer affordances, and the
 * scroll-to-message utility. Every visual atom and icon is consumed via the
 * component registry; nothing here imports a UI kit, icon set, or markdown
 * engine.
 */
export type { BlockGroupProps } from './BlockGroup'
export { BlockGroup } from './BlockGroup'
export type {
  BlockRenderContext,
  BlockViewProps,
  RawJsonBlockViewProps,
  ReasoningBlockViewProps,
  StatusBlockViewProps,
  SystemBlockViewProps,
  TextBlockViewProps,
  ToolCallBlockViewProps,
} from './blocks'
export {
  BlockView,
  RawJsonBlockView,
  ReasoningBlockView,
  StatusBlockView,
  SystemBlockView,
  TextBlockView,
  ToolCallBlockView,
} from './blocks'
export type { CollapsibleRowProps } from './CollapsibleRow'
export { CollapsibleRow } from './CollapsibleRow'
export { formatDuration, formatTokensPerSecond } from './format'
export type {
  BareItem,
  GroupedItem,
  GroupItem,
  HeaderSummary,
  TimelineBehavior,
} from './grouping'
export { getTimelineBehavior, groupBlocks, selectHeaderSummary } from './grouping'
export type { ElapsedTimerInput, LiveTokensInput } from './hooks'
export {
  useElapsedTimer,
  useFlashComplete,
  useLiveTokensPerSecond,
  usePrefersReducedMotion,
} from './hooks'
export type { MessageAttachmentsProps } from './MessageAttachments'
export { deriveAttachmentLabel, MessageAttachments } from './MessageAttachments'
export type { MessageFooterProps } from './MessageFooter'
export { MessageFooter } from './MessageFooter'
export type { MessageItemProps } from './MessageItem'
export { MessageItem, messageCopyText } from './MessageItem'
export { isSafeAttachmentUrl } from './url'
export type { MessageCallbacks, MessageLogProps } from './MessageLog'
export { MessageLog } from './MessageLog'
export { prefersReducedMotion, scrollToMessage } from './scroll'
