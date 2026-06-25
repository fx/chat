/**
 * Public surface of the component registry: the contract types, the provider +
 * hook, and the headless default registry. Re-exported from the package root so
 * `import { ChatProvider, useChatComponents } from '@fx/chat'` works.
 */
export type {
  AvatarProps,
  BadgeProps,
  BadgeTone,
  ButtonProps,
  ChatComponents,
  CodeBlockProps,
  CollapsibleProps,
  CopyButtonProps,
  IconComponent,
  IconName,
  IconProps,
  IconRegistry,
  JsonViewProps,
  MarkdownProps,
  PartialChatComponents,
  ScrollAreaProps,
  TooltipProps,
} from './contract'
export type { ChatProviderProps } from './context'
export { ChatProvider, mergeRegistry, useChatComponents } from './context'
export { headlessComponents } from './headless'
