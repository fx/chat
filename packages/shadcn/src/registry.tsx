/**
 * The shadcn `@fx/chat` component registry: shadcn/ui primitives (Radix under
 * the hood), lucide icons, and a react-markdown engine, mapped onto the
 * library's slot contract. No chat logic lives here — every adapter only
 * translates slot props onto a host primitive.
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
import { useState } from 'react'
import { cn } from './cn'
import { CodeBlock, JsonView } from './code'
import { lucideIcons } from './icons'
import { MarkdownView } from './markdown'
import { Avatar, AvatarFallback } from './ui/avatar'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible'
import { ScrollArea } from './ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'

export interface ShadcnComponentsOptions {
  /** Tooltip open delay in ms. Default 150. */
  tooltipDelay?: number
  /**
   * How long the copy button shows its "copied" check, in ms. `0` keeps it
   * until the button remounts. Default 1500.
   */
  copyResetMs?: number
  /**
   * Touch-first tuning: disclosure triggers drop their hover tint (touch has
   * no hover); row height comes from the classNames theme
   * (`createShadcnClassNames({ touch: true })`). Icon-only buttons always get
   * a 44×44 target. Default false.
   */
  touch?: boolean
}

function toneVariant(tone: BadgeProps['tone']): 'default' | 'destructive' | 'success' {
  if (tone === 'error') return 'destructive'
  if (tone === 'success') return 'success'
  return 'default'
}

const Caret = lucideIcons.caretRight
const CaretDown = lucideIcons.caretDown
const CheckIcon = lucideIcons.check
const CopyIcon = lucideIcons.copy

/**
 * `icon-sm` is 28×28 — below the 44×44 minimum touch target. Icon-only
 * buttons get a 44×44 tappable area; the glyph stays small. The width is not
 * fixed: a button the package gives a label (a revealed footer action) grows
 * to fit it instead of spilling over its neighbours.
 */
const ICON_TOUCH = 'min-h-11 min-w-11 w-auto px-2'

/** Build the shadcn registry, tuned by `options`. */
export function createShadcnComponents({
  tooltipDelay = 150,
  copyResetMs = 1500,
  touch = false,
}: ShadcnComponentsOptions = {}): ChatComponents {
  const triggerClass = cn(
    'flex w-full cursor-pointer items-center gap-1.5 text-left text-sm',
    !touch && 'hover:text-foreground/80',
  )

  return {
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
      <Badge variant={toneVariant(tone)} className={className}>
        {children}
      </Badge>
    ),

    Tooltip: ({ content, className, children }: TooltipProps) => (
      <TooltipProvider delayDuration={tooltipDelay}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={className}>{children}</span>
          </TooltipTrigger>
          <TooltipContent>{content}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
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
        <Collapsible
          open={isOpen}
          onOpenChange={(next) => {
            if (!controlled) setInternalOpen(next)
            onOpenChange?.(next)
          }}
          className={className}
        >
          <CollapsibleTrigger className={triggerClass}>
            <ChevronIcon size={14} className="shrink-0 text-muted-foreground" />
            {header}
          </CollapsibleTrigger>
          <CollapsibleContent>{children}</CollapsibleContent>
        </Collapsible>
      )
    },

    CodeBlock,
    JsonView,

    ScrollArea: ({ className, children }: ScrollAreaProps) => (
      <ScrollArea className={className}>{children}</ScrollArea>
    ),

    Avatar: ({ role, className }: AvatarProps) => (
      <Avatar className={className} aria-label={role}>
        <AvatarFallback data-role={role}>{role.charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
    ),

    CopyButton: ({ value, className, 'aria-label': ariaLabel }: CopyButtonProps) => {
      const [copied, setCopied] = useState(false)
      return (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={ariaLabel ?? 'Copy'}
          data-copied={copied ? 'true' : undefined}
          className={cn(ICON_TOUCH, className)}
          onClick={() => {
            const done = () => {
              setCopied(true)
              if (copyResetMs > 0) setTimeout(() => setCopied(false), copyResetMs)
            }
            const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
            if (clip?.writeText) clip.writeText(value).then(done, done)
            else done()
          }}
        >
          {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
        </Button>
      )
    },

    Markdown: MarkdownView,
    icons: lucideIcons,
  }
}

/** The shadcn registry with default (pointer-first) tuning. */
export const shadcnComponents: ChatComponents = createShadcnComponents()
