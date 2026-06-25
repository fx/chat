/**
 * Headless primitive components.
 *
 * Each primitive is built from semantic HTML and styled exclusively by the
 * package's `--chat-*` CSS custom properties (see `../../styles.css`). No
 * third-party UI kit is referenced. All components are SSR-safe (pure render,
 * no `window`/`document` access at module scope or during render).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useChatComponents } from '../context'
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
 * Headless tooltip. The contract allows a passthrough; this default surfaces
 * only primitive `string`/`number` content via the native `title` attribute
 * (numbers are stringified) for a zero-dependency, SSR-safe, accessible hover/
 * focus hint. Rich (non-primitive) `ReactNode` content cannot be expressed in a
 * `title`, so the trigger renders without a title; host apps that need rich
 * tooltip content must supply their own `Tooltip` slot via the registry.
 */
export function Tooltip({ content, className, children }: TooltipProps) {
  const title =
    typeof content === 'string' || typeof content === 'number' ? String(content) : undefined
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
  const { icons } = useChatComponents()
  const ref = useRef<HTMLDetailsElement>(null)
  // Bumped on every user toggle in controlled mode to force a render (and thus
  // the sync effect below) even when the controlled `open` value is unchanged
  // by the parent.
  const [, forceRender] = useState(0)

  // A native `<details>` flips its own DOM `open` before `onToggle` runs, and
  // React won't re-write `open` when the prop is unchanged (a read-only
  // disclosure, or a parent that rejects the change). After every render in
  // controlled mode, force the DOM back to the authoritative `open` so it never
  // drifts.
  useEffect(() => {
    const el = ref.current
    if (controlled && el && el.open !== open) {
      el.open = open
    }
  })

  const handleToggle = useCallback(
    (event: React.SyntheticEvent<HTMLDetailsElement>) => {
      const next = event.currentTarget.open
      if (controlled) {
        // The reconciliation write (`el.open = open` in the effect) also emits a
        // native toggle; when it fires, `next === open` (the DOM now matches the
        // authoritative value), so we report nothing — only a genuine user
        // change (`next !== open`) is forwarded. This avoids a duplicate
        // `onOpenChange` and is correct regardless of when the toggle fires.
        if (next !== open) {
          onOpenChange?.(next)
          forceRender((n) => n + 1)
        }
      } else {
        setInternalOpen(next)
        onOpenChange?.(next)
      }
    },
    [controlled, onOpenChange, open],
  )

  const Caret = isOpen ? icons.caretDown : icons.caretRight
  return (
    <details
      ref={ref}
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
  const { icons } = useChatComponents()
  const Icon = copied ? icons.check : icons.copy
  // Tracks the latest rendered `value` so async clipboard callbacks and the
  // reset effect can compare against the current prop, not a stale closure.
  const latestValue = useRef<string>(value)
  latestValue.current = value
  const copiedValue = useRef<string>(value)

  // When the prop changes away from what was last copied, the "copied"
  // affordance no longer reflects the clipboard, so reset it. Comparing against
  // the last-copied value (rather than blindly resetting on every `value`
  // render dep) keeps the reset scoped to genuine changes.
  useEffect(() => {
    if (copiedValue.current !== value) {
      copiedValue.current = value
      setCopied(false)
    }
  }, [value])

  const handleClick = useCallback(() => {
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
    // Only reflect success if the resolving write still matches the current
    // value; a stale write for a since-changed value must not re-flip `copied`.
    const done = () => {
      if (latestValue.current === value) {
        copiedValue.current = value
        setCopied(true)
      }
    }
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
