/**
 * Headless primitive components.
 *
 * Each primitive is built from semantic HTML and styled exclusively by the
 * package's `--chat-*` CSS custom properties (see `../../styles.css`). No
 * third-party UI kit is referenced. All components are SSR-safe (pure render,
 * no `window`/`document` access at module scope or during render).
 */
import { useCallback, useState } from 'react'
import type {
  AvatarProps,
  BadgeProps,
  ButtonProps,
  CodeBlockProps,
  CollapsibleProps,
  CopyButtonProps,
  JsonViewProps,
  ScrollAreaProps,
  TooltipProps,
} from '../contract'
import { headlessIcons } from './icons'

/** Joins truthy class-name parts with a single space. */
function classes(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/** Pressable button rendered as a native `<button type="button">`. */
export function Button({
  onClick,
  disabled,
  className,
  children,
  'aria-label': ariaLabel,
}: ButtonProps) {
  return (
    <button
      type="button"
      className={classes('chat-button', className)}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  )
}

/** Small status/label chip rendered as a `<span>` carrying a tone data-attr. */
export function Badge({ tone, className, children }: BadgeProps) {
  return (
    <span className={classes('chat-badge', className)} data-tone={tone ?? 'default'}>
      {children}
    </span>
  )
}

/**
 * Headless tooltip. The contract allows a passthrough; this default renders the
 * trigger and exposes the content via `title` for a native hover/focus hint —
 * zero dependency, SSR-safe, and accessible.
 */
export function Tooltip({ content, className, children }: TooltipProps) {
  const title = typeof content === 'string' ? content : undefined
  return (
    <span className={classes('chat-tooltip', className)} title={title}>
      {children}
    </span>
  )
}

/**
 * Disclosure primitive. Supports controlled (`open` + `onOpenChange`) and
 * uncontrolled (`defaultOpen`) usage. Built on `<details>`/`<summary>` so it
 * works without JavaScript and is SSR-safe.
 */
export function Collapsible({
  open,
  defaultOpen,
  onOpenChange,
  header,
  className,
  children,
}: CollapsibleProps) {
  const controlled = open !== undefined
  const [internalOpen, setInternalOpen] = useState(defaultOpen ?? false)
  const isOpen = controlled ? open : internalOpen

  const handleToggle = useCallback(
    (event: React.SyntheticEvent<HTMLDetailsElement>) => {
      const next = event.currentTarget.open
      if (!controlled) setInternalOpen(next)
      onOpenChange?.(next)
    },
    [controlled, onOpenChange],
  )

  const Caret = isOpen ? headlessIcons.caretDown : headlessIcons.caretRight
  return (
    <details
      className={classes('chat-collapsible', className)}
      open={isOpen}
      onToggle={handleToggle}
    >
      <summary className="chat-collapsible-header">
        <Caret className="chat-collapsible-caret" />
        {header}
      </summary>
      <div className="chat-collapsible-body">{children}</div>
    </details>
  )
}

/** Preformatted code/text with optional language exposed as a data-attr. */
export function CodeBlock({ code, language, className }: CodeBlockProps) {
  return (
    <pre
      className={classes('chat-codeblock', className)}
      {...(language ? { 'data-language': language } : {})}
    >
      <code>{code}</code>
    </pre>
  )
}

/** JSON viewer composed on top of {@link CodeBlock} via pretty-printed JSON. */
export function JsonView({ value, className }: JsonViewProps) {
  let text: string
  try {
    text = JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    // Circular or otherwise non-serializable values: fall back to a safe label.
    text = String(value)
  }
  return <CodeBlock code={text} language="json" className={classes('chat-jsonview', className)} />
}

/** Scroll container for the message log and popups. */
export function ScrollArea({ className, children }: ScrollAreaProps) {
  return <div className={classes('chat-scrollarea', className)}>{children}</div>
}

/** Optional role/author avatar: a labelled initial derived from the role. */
export function Avatar({ role, className }: AvatarProps) {
  const initial = role.charAt(0).toUpperCase()
  return (
    <span className={classes('chat-avatar', className)} data-role={role} aria-label={role}>
      {initial}
    </span>
  )
}

/**
 * Copy-to-clipboard affordance. Uses the async Clipboard API when available
 * (guarded so it's SSR-safe and degrades when unavailable) and reflects a
 * transient `copied` state via `data-copied` and the icon shown.
 */
export function CopyButton({ value, className, 'aria-label': ariaLabel }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const Icon = copied ? headlessIcons.check : headlessIcons.copy

  const handleClick = useCallback(() => {
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
    const done = () => setCopied(true)
    if (clipboard?.writeText) {
      clipboard.writeText(value).then(done, done)
    } else {
      done()
    }
  }, [value])

  return (
    <button
      type="button"
      className={classes('chat-copybutton', className)}
      onClick={handleClick}
      data-copied={copied ? 'true' : undefined}
      aria-label={ariaLabel ?? 'Copy'}
    >
      <Icon className="chat-copybutton-icon" />
    </button>
  )
}
