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
  InertBlockViewProps,
  PlanBlockViewProps,
  RawJsonBlockViewProps,
  ReasoningBlockViewProps,
  StatusBlockViewProps,
  SystemBlockViewProps,
  TextBlockViewProps,
  ToolCallBlockViewProps,
} from './blocks'
export {
  BlockView,
  InertBlockView,
  PlanBlockView,
  RawJsonBlockView,
  ReasoningBlockView,
  StatusBlockView,
  SystemBlockView,
  TextBlockView,
  ToolCallBlockView,
} from './blocks'
export type { CollapsibleRowProps } from './CollapsibleRow'
export { CollapsibleRow } from './CollapsibleRow'
export type {
  ChatExtensions,
  CustomBlock,
  CustomBlockRenderer,
  CustomRenderProps,
  CustomTimelineBehavior,
  RenderableBlock,
  RenderableMessage,
  TimelineItem,
  TimelineItemBase,
  ToolRenderer,
} from './extensions'
export { isCoreBlockType, lookupExtension, NON_AUX_BEHAVIOR } from './extensions'
export { formatDuration, formatTokensPerSecond } from '@fx/chat-core'
export type { GutterRowProps } from './GutterRow'
export { GutterRow } from './GutterRow'
export type {
  BareItem,
  GroupedItem,
  GroupItem,
  HeaderSummary,
  TimelineBehavior,
} from '@fx/chat-core'
export {
  getBlockTimelineBehavior,
  getTimelineBehavior,
  groupBlocks,
  selectHeaderSummary,
} from '@fx/chat-core'
export type { ElapsedTimerInput, LiveTokensInput } from '@fx/chat-core/react'
export {
  useElapsedTimer,
  useFlashComplete,
  useLiveTokensPerSecond,
  usePrefersReducedMotion,
} from '@fx/chat-core/react'
export type { MessageAttachmentsProps } from './MessageAttachments'
export { deriveAttachmentLabel, MessageAttachments } from './MessageAttachments'
export type { MessageFooterProps } from './MessageFooter'
export { hasFooterContent, MessageFooter } from './MessageFooter'
export type { MergedEntry, MergedItemEntry, MergedMessageEntry } from '@fx/chat-core'
export { mergeTimeline } from '@fx/chat-core'
export { collapseTurnAux } from '@fx/chat-core'
export type { MessageItemProps } from './MessageItem'
export { MessageItem, messageCopyText } from './MessageItem'
export { isSafeAttachmentUrl } from '@fx/chat-core'
export type { MessageCallbacks, MessageLogProps } from './MessageLog'
export { MessageLog } from './MessageLog'
export { prefersReducedMotion, scrollToMessage } from './scroll'
export type { TimelineItemViewProps } from './TimelineItemView'
export { TimelineItemView } from './TimelineItemView'
