/**
 * The component-registry contract.
 *
 * `@fx/chat` is design-system-agnostic: every visual atom (button, badge,
 * tooltip, …), every semantic icon, and the markdown renderer are injected by
 * the host through a single {@link ChatComponents} registry. The package's
 * renderers know the *semantics* of each slot but never hard-code a styled
 * primitive or icon. This module declares the slot interfaces; the headless
 * default registry (see `./headless`) implements them with zero third-party
 * dependencies.
 */
import type { ComponentType, ReactNode } from 'react'

/**
 * Conversation author role. Declared locally so the registry contract is
 * self-contained and does not depend on the message model. Hosts whose `Avatar`
 * cares about more granular roles can widen this in their own adapter.
 */
export type Role = 'system' | 'user' | 'assistant'

/** Props every headless/host primitive `Button` must accept. */
export interface ButtonProps {
  onClick?: () => void
  disabled?: boolean
  'aria-label'?: string
  className?: string
  children?: ReactNode
}

/** Visual tone for a {@link BadgeProps} chip. */
export type BadgeTone = 'default' | 'error' | 'success'

/** Props for the small status/label chip primitive. */
export interface BadgeProps {
  tone?: BadgeTone
  className?: string
  children?: ReactNode
}

/** Props for the tooltip primitive — wraps a trigger, shows content on hover/focus. */
export interface TooltipProps {
  content: ReactNode
  className?: string
  children: ReactNode
}

/**
 * Props for the disclosure primitive. Supports both controlled (`open` +
 * `onOpenChange`) and uncontrolled (`defaultOpen`) usage.
 */
export interface CollapsibleProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  header: ReactNode
  className?: string
  children?: ReactNode
}

/** Props for the preformatted code/text primitive with optional language. */
export interface CodeBlockProps {
  code: string
  language?: string
  className?: string
}

/** Props for the JSON viewer primitive. */
export interface JsonViewProps {
  value: unknown
  className?: string
}

/** Props for the scroll-container primitive. */
export interface ScrollAreaProps {
  className?: string
  children?: ReactNode
}

/** Props for the optional role/author avatar primitive. */
export interface AvatarProps {
  role: Role
  className?: string
}

/** Props for the copy-to-clipboard affordance. */
export interface CopyButtonProps {
  value: string
  className?: string
  'aria-label'?: string
}

/** Props for the markdown slot. */
export interface MarkdownProps {
  content: string
  streaming?: boolean
}

/** Props every icon slot must accept. */
export interface IconProps {
  className?: string
  size?: number
}

/** A single icon slot component. */
export type IconComponent = ComponentType<IconProps>

/**
 * Every semantic icon the renderers reference. The headless default ships an
 * inline SVG for each; hosts may map each name to any icon library's component.
 */
export type IconName =
  | 'spinner'
  | 'check'
  | 'caretRight'
  | 'caretDown'
  | 'copy'
  | 'wrench'
  | 'brain'
  | 'gear'
  | 'regenerate'
  | 'fork'
  | 'reset'
  | 'file'
  | 'audio'
  | 'video'
  | 'send'
  | 'stop'
  | 'paperclip'
  | 'close'

/** The full icon map: one component per {@link IconName}. */
export type IconRegistry = Record<IconName, IconComponent>

/**
 * The injectable component registry. A host supplies any subset via
 * `<ChatProvider components={…}>`; unspecified slots fall back to the inherited
 * registry (the parent provider's effective registry, or the headless defaults
 * at the root).
 */
export interface ChatComponents {
  Button: ComponentType<ButtonProps>
  Badge: ComponentType<BadgeProps>
  Tooltip: ComponentType<TooltipProps>
  Collapsible: ComponentType<CollapsibleProps>
  CodeBlock: ComponentType<CodeBlockProps>
  JsonView: ComponentType<JsonViewProps>
  ScrollArea: ComponentType<ScrollAreaProps>
  Avatar: ComponentType<AvatarProps>
  CopyButton: ComponentType<CopyButtonProps>
  Markdown: ComponentType<MarkdownProps>
  icons: IconRegistry
}

/**
 * A partial registry as accepted by `<ChatProvider>`. Every primitive slot is
 * optional, and the `icons` map is deep-partial so a host can override a single
 * icon without redeclaring the rest.
 */
export type PartialChatComponents = Partial<Omit<ChatComponents, 'icons'>> & {
  icons?: Partial<IconRegistry>
}
