/**
 * `shadcn` registry adapter.
 *
 * A THIN contract→host mapping onto vendored shadcn/ui primitives (Radix-backed
 * Button, Badge, Collapsible, Tooltip, ScrollArea, Avatar), a `react-markdown`
 * engine for the `Markdown` slot, and the lucide icon set. Every adapter
 * component only translates the library slot props onto the host primitive — no
 * chat logic lives here.
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
import { lucideIcons } from './lucide-icons'
import { Avatar, AvatarFallback } from './shadcn/ui/avatar'
import { Badge } from './shadcn/ui/badge'
import { Button } from './shadcn/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './shadcn/ui/collapsible'
import { ScrollArea } from './shadcn/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './shadcn/ui/tooltip'
import { CodeBlock, JsonView } from './shared/code'
import { MarkdownView } from './shared/markdown'

/** Map the chat `tone` onto a shadcn Badge variant. */
function toneVariant(tone: BadgeProps['tone']): 'default' | 'destructive' | 'success' {
  if (tone === 'error') return 'destructive'
  if (tone === 'success') return 'success'
  return 'default'
}

const Caret = lucideIcons.caretRight
const CaretDown = lucideIcons.caretDown
const CheckIcon = lucideIcons.check
const CopyIcon = lucideIcons.copy

/** The shadcn adapter registry. */
export const shadcnRegistry: ChatComponents = {
  Button: ({ onClick, disabled, className, children, 'aria-label': ariaLabel }: ButtonProps) => (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={className}
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
    <TooltipProvider delayDuration={150}>
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
        <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-left text-sm hover:text-foreground/80">
          <ChevronIcon size={14} className="shrink-0 text-muted-foreground" />
          {header}
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-1">{children}</CollapsibleContent>
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
        className={className}
        onClick={() => {
          const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
          const done = () => setCopied(true)
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
