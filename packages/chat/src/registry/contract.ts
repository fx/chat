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
  /** A finished message's activity facts (`.chat-footer-activity`, `data-expanded` when they toggle it). */
  footerActivity?: string
  /** One activity fact (`.chat-footer-fact`, `data-fact`, `data-failed`). */
  footerFact?: string
  /** A fact's icon and text (`.chat-footer-fact-body`): a button when it toggles the activity. */
  footerFactBody?: string
  /** The shown activity's summaries inside the footer (`.chat-footer-activity-items`). */
  footerActivityItems?: string
  footerFactIcon?: string
  footerFactText?: string
  /** The activity handed to a `MessageDetails` presenter (`.chat-details-activity`). */
  detailsActivity?: string
  /** One activity block in it (`.chat-details-activity-item`, `data-block-id`). */
  detailsActivityItem?: string
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

/** One labelled, ready-to-show fact about a message (e.g. `Duration` → `1.5s`). */
export interface MessageDetail {
  key: 'model' | 'duration' | 'rate' | 'tokens' | 'cost' | 'context'
  label: string
  value: string
}

/** A message action offered through {@link ChatComponents.MessageDetails}. */
export interface MessageDetailsAction {
  id: 'regenerate' | 'fork' | 'reset'
  /** The action's label, as the footer would show it. */
  label: string
  /** The action's icon (from the icon registry). */
  icon: IconComponent
  onSelect: () => void
}

/**
 * Props for the {@link ChatComponents.MessageDetails} presenter: everything a
 * compact footer's reveal would show, handed to the host to present its own
 * way (a bottom sheet, a popover). Controlled: shown while `open`; the host
 * reports dismissal through `onOpenChange(false)` and SHOULD close after an
 * action runs.
 */
export interface MessageDetailsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The message's metrics as labelled, formatted facts, in display order. */
  details: MessageDetail[]
  /** How the message ended, when it did not simply complete. */
  outcome?: { kind: 'stopped' } | { kind: 'error'; message: string } | undefined
  /** The message text to copy; empty when there is nothing to copy. */
  copyText: string
  /** The actions available on the message, in footer order. */
  actions: MessageDetailsAction[]
  /**
   * The message's activity (reasoning, tool calls, plans) as the package's own
   * rows, each in a `.chat-details-activity-item` carrying `data-block-id`;
   * absent when the message has none.
   */
  activity?: ReactNode
  /** The activity item the presenter was opened for, to bring into view. */
  focusId?: string | undefined
}

/** One piece of a message's activity, as plain data for {@link ActivitySummaryProps}. */
export interface ActivityItem {
  /** The block's id (pass it back to `onActivate`). */
  id: string
  /** `waiting` is the placeholder before the first token. */
  kind: 'reasoning' | 'tool' | 'plan' | 'waiting' | 'other'
  /** The tool's name, `Thinking`, `Plan`, `Starting`, or the block type. */
  label: string
  /** For a tool, its name (for a host icon mapping). */
  name?: string | undefined
  /** `awaiting`: a tool call blocked on the user's approval. */
  status: 'running' | 'done' | 'error' | 'awaiting'
  /** Epoch ms the item started, when known (a host ticks live time from it). */
  startedAt?: number | undefined
  /** How long it took, once finished and known. */
  durationMs?: number | undefined
  /** Live reasoning speed, while thinking. */
  tokensPerSecond?: number | undefined
  /** A short extra, e.g. a plan's `2/5`. */
  detail?: string | undefined
}

/**
 * Props for the {@link ChatComponents.ActivitySummary} presenter: a run of a
 * message's activity as items, in order, replacing its rows.
 */
export interface ActivitySummaryProps {
  items: ActivityItem[]
  /** Whether the message is still streaming. */
  live: boolean
  /** Open the message's details at an item; absent when there is no details presenter. */
  onActivate?: ((id: string) => void) | undefined
}

/** A fact about a finished message's activity, for footer icons. */
export interface ActivityFact {
  key: 'tools' | 'reasoning' | 'plan'
  /** Short text: `3` tools, `5s` (or a size) of thinking, `2/5` of a plan. */
  text: string
  /** A readable form, e.g. `3 tool calls, 1 failed`. */
  label: string
  /** For tools: how many failed. */
  failed?: number | undefined
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
export type OptionalIconName = 'checklist' | 'info'

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
  /**
   * OPTIONAL presenter for a compact footer's details and actions. When a host
   * provides it, the compact footer's reveal control opens it instead of
   * revealing labels and metrics inline. There is no headless default: absent,
   * the footer reveals inline.
   */
  MessageDetails?: ComponentType<MessageDetailsProps>
  /**
   * OPTIONAL compact presenter for a message's activity (e.g. icon tiles). Used
   * only when the host asks for `activityDisplay="summary"`; there is no
   * headless default: absent, activity renders as rows.
   */
  ActivitySummary?: ComponentType<ActivitySummaryProps>
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
