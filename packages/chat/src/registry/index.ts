/**
 * Public surface of the component registry: the contract types, the provider +
 * hook, and the headless default registry. Re-exported from the package root so
 * `import { ChatProvider, useChatComponents } from '@fx/chat'` works.
 */
export type {
  ActivityFact,
  ActivityItem,
  ActivitySummaryProps,
  AvatarProps,
  BadgeProps,
  BadgeTone,
  ButtonProps,
  ChatClassNames,
  ChatComponents,
  CodeBlockProps,
  CollapsibleProps,
  CopyButtonProps,
  IconComponent,
  IconName,
  OptionalIconName,
  IconProps,
  IconRegistry,
  JsonViewProps,
  LightboxProps,
  MessageDetail,
  MessageDetailsAction,
  MessageDetailsProps,
  MarkdownProps,
  PartialChatComponents,
  ScrollAreaProps,
  TooltipProps,
} from './contract'
export type { ChatProviderProps } from './context'
export {
  ChatProvider,
  mergeClassNames,
  mergeRegistry,
  useChatClassNames,
  useChatComponents,
} from './context'
export { headlessComponents } from './headless'
