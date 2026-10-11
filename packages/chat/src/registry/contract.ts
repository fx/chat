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
  /**
   * Optional extra class appended to the markdown root, AFTER the stable
   * `chat-md` hook and BEFORE the context-injected `classNames.md`. Lets a
   * caller (or a host Markdown adapter) target a specific markdown instance
   * without redefining the registry slot. Defaults to absent (no extra class).
   */
  className?: string
}

/**
 * Host-overridable class names, one optional key per stable `.chat-*` render
 * hook (the `chat-` prefix stripped, camelCased). Threaded through React context
 * by {@link ChatProviderProps.classNames}; each render component appends its
 * matching value AFTER the stable `chat-*` class, so a host can style every
 * element with its own design system without losing the stable hooks. Every key
 * is OPTIONAL — an absent key appends nothing, leaving output byte-identical to
 * the unstyled default. The names are generic and design-system-agnostic by
 * design (no host/app coupling).
 */
export interface ChatClassNames {
  log?: string
  message?: string
  messageBlocks?: string
  gutterRow?: string
  gutterTime?: string
  gutterContent?: string
  row?: string
  rowError?: string
  rowHeader?: string
  rowAffordance?: string
  rowAffordanceIcon?: string
  rowIcon?: string
  rowLabel?: string
  rowErrorMarker?: string
  rowTimer?: string
  rowTps?: string
  group?: string
  groupBody?: string
  groupSummary?: string
  groupSummaryLabel?: string
  groupMore?: string
  text?: string
  textUser?: string
  textAssistant?: string
  textPlain?: string
  mention?: string
  toolBody?: string
  /** The tool row's one-line input beside its label (`.chat-tool-input`). */
  toolInput?: string
  /** The approval qualifier (`.chat-tool-approval`, `data-approval`). */
  toolApproval?: string
  /** A plan's entry list (`.chat-plan`). */
  plan?: string
  /** One plan entry (`.chat-plan-entry`, `data-status`). */
  planEntry?: string
  /** A live tail's `+N earlier` row (`.chat-earlier`, `data-count`). */
  earlier?: string
  /** A message's error outcome row (`.chat-outcome`). */
  outcome?: string
  /** The live footer's elapsed time (`.chat-footer-elapsed`). */
  footerElapsed?: string
  /** The footer's stopped / failed marker (`.chat-footer-outcome`). */
  footerOutcome?: string
  toolSection?: string
  toolSectionLabel?: string
  toolMedia?: string
  toolMediaImage?: string
  toolMediaAudio?: string
  reasoningBody?: string
  systemBody?: string
  rawJson?: string
  inertBlock?: string
  timelineItem?: string
  footer?: string
  footerMetrics?: string
  footerLabel?: string
  footerCopy?: string
  footerRegenerate?: string
  footerFork?: string
  footerReset?: string
  footerReveal?: string
  footerIcon?: string
  attachments?: string
  attachmentGrid?: string
  attachmentGridItem?: string
  attachmentThumb?: string
  attachmentThumbImage?: string
  attachmentThumbExpand?: string
  attachmentChips?: string
  attachmentChip?: string
  attachmentChipIcon?: string
  attachmentChipName?: string
  attachmentChipDownload?: string
  md?: string
  mdP?: string
  mdPre?: string
  mdLink?: string
  mdCodeInline?: string
  input?: string
  inputAttachments?: string
  inputAttachment?: string
  inputAttachmentIcon?: string
  inputAttachmentName?: string
  inputAttachmentRemove?: string
  inputAttachmentRemoveIcon?: string
  inputField?: string
  inputOverlay?: string
  inputMention?: string
  inputTextarea?: string
  inputFile?: string
  inputActions?: string
  inputAttach?: string
  inputSend?: string
  inputStop?: string
  inputActionIcon?: string
  completionPopup?: string
  completionScroll?: string
  completionList?: string
  completionOption?: string
  completionIcon?: string
  completionLabel?: string
  completionDescription?: string
  completionLoading?: string
  completionSpinner?: string
  lightbox?: string
  lightboxDialog?: string
  lightboxClose?: string
  lightboxCloseIcon?: string
  lightboxImage?: string
}

/**
 * Props for the {@link ChatComponents.Lightbox} attachment image overlay.
 *
 * `alt` is REQUIRED: callers MUST always pass an alternative-text string
 * (falling back to the attachment `name`, or a generic label when unnamed) so
 * the enlarged image is accessible. The overlay is controlled — it renders the
 * enlarged image only while `open` is `true` and reports dismissal (Escape /
 * close control / backdrop) via `onClose`.
 */
export interface LightboxProps {
  /** Source URL of the enlarged image (already scheme-validated by the caller). */
  src: string
  /** Required accessible alternative text for the enlarged image. */
  alt: string
  /** Whether the overlay is currently open. */
  open: boolean
  /** Invoked when the user dismisses the overlay (Escape, close control, backdrop). */
  onClose: () => void
  className?: string
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
  | 'dotsThree'
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
  | 'download'
  | 'expand'

/**
 * Icons added after the first release. They are deliberately NOT members of
 * {@link IconName}, and OPTIONAL in a registry, so host code typed against the
 * original set (`Record<IconName, …>`) keeps compiling; the provider's merge
 * supplies the headless glyph until the host maps them.
 */
export type OptionalIconName = 'checklist'

/** The icon map: one component per {@link IconName}; optional icons may be omitted. */
export type IconRegistry = Record<IconName, IconComponent> &
  Partial<Record<OptionalIconName, IconComponent>>

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
  /**
   * OPTIONAL enlarged-image overlay for the attachment image grid. The headless
   * default ships a self-contained accessible overlay; hosts MAY map it to their
   * own dialog/lightbox. Renderers MUST treat it as possibly absent and fall back
   * to the headless default when a host omits it.
   */
  Lightbox?: ComponentType<LightboxProps>
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
