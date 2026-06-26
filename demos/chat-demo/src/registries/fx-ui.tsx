/**
 * `fx-ui` registry adapter.
 *
 * A THIN contract→host mapping onto `@fx/ui` (a shared, Tailwind + Base UI
 * design system installed from GitHub Packages), the lucide icon set, and a
 * `react-markdown` engine for the `Markdown` slot. `@fx/ui` ships Button, Badge,
 * Collapsible, and Tooltip; the registry's ScrollArea and Avatar slots, which
 * `@fx/ui` does not export, are small Tailwind-styled elements over the same
 * design tokens. Only slot translation lives here — no chat logic.
 *
 * `@fx/ui` is Base UI-backed, so the Collapsible/Tooltip triggers compose via
 * the `render` prop (Base UI's composition API) rather than `asChild`.
 */
import type {
  AvatarProps,
  BadgeProps,
  ButtonProps,
  ChatComponents,
  CollapsibleProps,
  CopyButtonProps,
  ScrollAreaProps,
  TooltipProps,
} from '@fx/chat'
import {
  Badge as FxBadge,
  Button as FxButton,
  Collapsible as FxCollapsible,
  CollapsibleContent as FxCollapsibleContent,
  CollapsibleTrigger as FxCollapsibleTrigger,
  Tooltip as FxTooltip,
  TooltipContent as FxTooltipContent,
  TooltipProvider as FxTooltipProvider,
  TooltipTrigger as FxTooltipTrigger,
} from '@fx/ui'
import type { ComponentType, ReactNode } from 'react'
import { useState } from 'react'
import { lucideIcons } from './lucide-icons'
import { cn } from './shared/cn'
import { CodeBlock, JsonView } from './shared/code'
import { MarkdownView } from './shared/markdown'

/**
 * `@fx/ui`'s `Button` props are a Base UI discriminated union
 * (`nativeButton` native vs non-native), so TS does not surface the common
 * `children`/`render` keys on the simplified prop intersection. Both pass
 * through to the rendered `<button>` at runtime. We alias the component to a
 * permissive prop shape for the two icon-button slots so the thin adapter stays
 * readable without fighting the union.
 */
const Button = FxButton as unknown as ComponentType<{
  variant?: string | undefined
  size?: string | undefined
  onClick?: (() => void) | undefined
  disabled?: boolean | undefined
  'aria-label'?: string | undefined
  'data-copied'?: string | undefined
  className?: string | undefined
  children?: ReactNode
}>

/** Map the chat `tone` onto an `@fx/ui` Badge variant. */
function toneVariant(tone: BadgeProps['tone']): 'default' | 'destructive' | 'secondary' {
  if (tone === 'error') return 'destructive'
  if (tone === 'success') return 'secondary'
  return 'default'
}

const Caret = lucideIcons.caretRight
const CaretDown = lucideIcons.caretDown
const CheckIcon = lucideIcons.check
const CopyIcon = lucideIcons.copy

/**
 * `@fx/ui`'s `icon-sm` Button is 32×32 — below the 44×44 minimum touch target
 * at the 375px viewport. Bump the icon-only adapter buttons to a >=44×44
 * tappable area (the icon glyph itself stays small). `min-*` overrides the
 * fixed `size-8` height/width without fighting it.
 */
const ICON_TOUCH = 'min-h-11 min-w-11'

/** The fx-ui adapter registry. */
export const fxUiRegistry: ChatComponents = {
  Button: ({ onClick, disabled, className, children, 'aria-label': ariaLabel }: ButtonProps) => (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(ICON_TOUCH, className)}
    >
      {children}
    </Button>
  ),

  Badge: ({ tone, className, children }: BadgeProps) => (
    <FxBadge
      variant={toneVariant(tone)}
      data-tone={tone ?? 'default'}
      {...(className ? { className } : {})}
    >
      {children}
    </FxBadge>
  ),

  Tooltip: ({ content, className, children }: TooltipProps) => (
    <FxTooltipProvider>
      <FxTooltip delayDuration={150}>
        <FxTooltipTrigger render={<span className={className}>{children}</span>} />
        <FxTooltipContent>{content}</FxTooltipContent>
      </FxTooltip>
    </FxTooltipProvider>
  ),

  Collapsible: ({
    open,
    defaultOpen,
    onOpenChange,
    header,
    className,
    children,
  }: CollapsibleProps) => {
    const controlled = open !== undefined
    const [internalOpen, setInternalOpen] = useState(defaultOpen ?? false)
    const isOpen = controlled ? open : internalOpen
    const ChevronIcon = isOpen ? CaretDown : Caret
    return (
      <FxCollapsible
        open={isOpen}
        onOpenChange={(next: boolean) => {
          if (!controlled) setInternalOpen(next)
          onOpenChange?.(next)
        }}
        {...(className ? { className } : {})}
      >
        <FxCollapsibleTrigger
          render={
            <button
              type="button"
              className="flex w-full items-center gap-1.5 text-left text-sm hover:text-foreground/80"
            >
              <ChevronIcon size={14} className="shrink-0 text-muted-foreground" />
              {header}
            </button>
          }
        />
        <FxCollapsibleContent className="pt-1">{children}</FxCollapsibleContent>
      </FxCollapsible>
    )
  },

  CodeBlock,
  JsonView,

  ScrollArea: ({ className, children }: ScrollAreaProps) => (
    <div className={`relative overflow-auto ${className ?? ''}`}>{children}</div>
  ),

  Avatar: ({ role, className }: AvatarProps) => (
    <span
      className={`relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-medium ${className ?? ''}`}
      data-role={role}
      aria-label={role}
    >
      {role.charAt(0).toUpperCase()}
    </span>
  ),

  CopyButton: ({ value, className, 'aria-label': ariaLabel }: CopyButtonProps) => {
    const [copied, setCopied] = useState(false)
    const onClick = () => {
      const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
      const done = () => setCopied(true)
      if (clip?.writeText) clip.writeText(value).then(done, done)
      else done()
    }
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={ariaLabel ?? 'Copy'}
        {...(copied ? { 'data-copied': 'true' } : {})}
        onClick={onClick}
        className={cn(ICON_TOUCH, className)}
      >
        {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
      </Button>
    )
  },

  Markdown: MarkdownView,
  icons: lucideIcons,
}
