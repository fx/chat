/**
 * `CollapsibleRow` — the shared substrate over the registry `Collapsible` used
 * by every collapsible block (reasoning, tool_call, system, grouped runs).
 *
 * Responsibilities:
 * - A clickable header carrying an affordance icon, a label, optional pills.
 * - Affordance-icon precedence: active → spinner; just-completed → success check
 *   (flash); has-body → caret (open/closed); otherwise → muted filler.
 * - Optional live-timer pill and tokens/sec pill.
 * - Controlled (`open`/`onOpenChange`) and uncontrolled (`defaultOpen`) use,
 *   where a change to the host's `defaultOpen` (e.g. a verbose/expand-all flip)
 *   resets any manual toggle.
 * - Auto-hide when there is no active state, no flash, no timer, and no body,
 *   unless `alwaysShow` is set.
 *
 * Every visual atom and icon comes from `useChatComponents()` — no styled
 * primitive or icon is imported directly.
 */
import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useChatComponents } from '../registry'
import { formatDuration, formatTokensPerSecond } from './format'
import { useElapsedTimer, useFlashComplete } from './hooks'

/** Props for {@link CollapsibleRow}. */
export interface CollapsibleRowProps {
  /** Header label content (text or rich node). */
  label: ReactNode
  /** Body content; absence of body affects the affordance + auto-hide rules. */
  children?: ReactNode
  /** Whether the row's activity is in progress (drives spinner + live timer). */
  isActive?: boolean | undefined
  /** Epoch-ms start for the live timer pill. */
  startedAt?: number | undefined
  /** Finalized duration in ms; wins over the live ticker. */
  durationMs?: number | undefined
  /** Whether to render a live timer pill. */
  showTimer?: boolean | undefined
  /** Tokens/second to show as a pill, when present. */
  tokensPerSecond?: number | undefined
  /** Controlled open state. */
  open?: boolean | undefined
  /** Controlled open-change callback. */
  onOpenChange?: ((open: boolean) => void) | undefined
  /** Uncontrolled default-open; a change resets any manual toggle. */
  defaultOpen?: boolean | undefined
  /** Force the row visible even when the auto-hide rule would drop it. */
  alwaysShow?: boolean
  /** Error styling hook (sets `data-tone="error"`). */
  error?: boolean
  /** Optional leading icon name (e.g. `wrench`, `brain`, `gear`). */
  iconName?: 'wrench' | 'brain' | 'gear'
  /** Extra className on the disclosure root. */
  className?: string
}

/**
 * Renders a collapsible row, or `null` when the auto-hide rule applies. The
 * uncontrolled open state re-seeds from `defaultOpen` whenever `defaultOpen`
 * changes, so a host "expand all" toggle overrides a prior manual collapse.
 */
export function CollapsibleRow({
  label,
  children,
  isActive = false,
  startedAt,
  durationMs,
  showTimer = false,
  tokensPerSecond,
  open,
  onOpenChange,
  defaultOpen = false,
  alwaysShow = false,
  error = false,
  iconName,
  className,
}: CollapsibleRowProps) {
  const { Collapsible, Badge, icons } = useChatComponents()
  const flash = useFlashComplete(isActive)
  const elapsed = useElapsedTimer({ startedAt, isActive, durationMs })

  // Uncontrolled open state seeded from defaultOpen; re-seed when defaultOpen
  // changes (verbose/expand-all flip resets a manual collapse).
  const controlled = open !== undefined
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const prevDefault = useRef(defaultOpen)
  // Re-seed the uncontrolled open state when `defaultOpen` flips (verbose/
  // expand-all). Skip entirely while controlled — the parent owns `open`, so
  // touching internal state there is a wasted render.
  if (!controlled && prevDefault.current !== defaultOpen) {
    prevDefault.current = defaultOpen
    if (internalOpen !== defaultOpen) setInternalOpen(defaultOpen)
  }
  const isOpen = controlled ? (open as boolean) : internalOpen

  const hasBody = children != null && children !== false
  const timerPill = showTimer && (isActive || durationMs !== undefined)
  // Auto-hide: nothing to show and not forced.
  if (!alwaysShow && !isActive && !flash && !timerPill && !hasBody) return null

  // Affordance-icon precedence.
  let Affordance: typeof icons.spinner | undefined
  let affordanceTone: 'active' | 'success' | 'body' | 'filler'
  if (isActive) {
    Affordance = icons.spinner
    affordanceTone = 'active'
  } else if (flash) {
    Affordance = icons.check
    affordanceTone = 'success'
  } else if (hasBody) {
    Affordance = isOpen ? icons.caretDown : icons.caretRight
    affordanceTone = 'body'
  } else {
    Affordance = undefined
    affordanceTone = 'filler'
  }

  const LeadingIcon = iconName ? icons[iconName] : undefined
  const tps = formatTokensPerSecond(tokensPerSecond)

  const header = (
    <span className="chat-row-header" data-affordance={affordanceTone}>
      <span className="chat-row-affordance" data-affordance={affordanceTone}>
        {Affordance ? <Affordance className="chat-row-affordance-icon" /> : null}
      </span>
      {LeadingIcon ? <LeadingIcon className="chat-row-icon" /> : null}
      <span className="chat-row-label">{label}</span>
      {timerPill ? (
        <Badge className="chat-row-timer" tone="default">
          {formatDuration(elapsed)}
        </Badge>
      ) : null}
      {tps ? (
        <Badge className="chat-row-tps" tone="default">
          {tps}
        </Badge>
      ) : null}
    </span>
  )

  // When there is no body, render a static (non-toggling) row so an empty
  // disclosure cannot be expanded into nothing.
  const rootClass = ['chat-row', error ? 'chat-row-error' : null, className]
    .filter(Boolean)
    .join(' ')

  if (!hasBody) {
    return (
      <div className={rootClass} data-tone={error ? 'error' : undefined}>
        {header}
      </div>
    )
  }

  const collapsibleProps = controlled
    ? { open: open as boolean, ...(onOpenChange ? { onOpenChange } : {}) }
    : { open: internalOpen, onOpenChange: setInternalOpen }

  return (
    <Collapsible className={rootClass} header={header} {...collapsibleProps}>
      {children}
    </Collapsible>
  )
}
