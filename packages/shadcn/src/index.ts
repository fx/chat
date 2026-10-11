/**
 * `@fx/chat-shadcn` — a ready-made shadcn/ui look for `@fx/chat`.
 *
 * `@fx/chat` is headless: it renders structure onto stable `.chat-*` hooks and
 * takes every visual decision from the host. This package is one such host
 * layer, published so apps (and anyone wanting a sensible default) can adopt
 * it whole:
 *
 * - {@link shadcnComponents} / {@link createShadcnComponents} — the component
 *   registry (Radix-backed shadcn primitives, lucide icons, react-markdown);
 * - {@link shadcnClassNames} — the `classNames` theme (Tailwind v4 utilities);
 * - `@fx/chat-shadcn/theme.css` — the shadcn design tokens (light + dark) and
 *   the Tailwind wiring that generates this package's classes.
 *
 * The primitives and helpers are exported too, so an app shell can share them.
 */
export {
  type ShadcnClassNamesOptions,
  createShadcnClassNames,
  shadcnClassNames,
} from './class-names'
export { cn } from './cn'
export { CodeBlock, JsonView } from './code'
export { lucideIcons } from './icons'
export { MarkdownView } from './markdown'
export { MessageDetailsSheet } from './message-details'
export {
  type ShadcnComponentsOptions,
  createShadcnComponents,
  shadcnComponents,
} from './registry'
export { Avatar, AvatarFallback } from './ui/avatar'
export { Badge, type BadgeProps, badgeVariants } from './ui/badge'
export { Button, type ButtonProps, buttonVariants } from './ui/button'
export { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible'
export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
} from './ui/drawer'
export { ScrollArea } from './ui/scroll-area'
export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'
