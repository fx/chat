/**
 * `CollapsibleRow` — the shared substrate over the registry `Collapsible` used
 * by every collapsible block (reasoning, tool_call, system, grouped runs).
 *
 * Responsibilities:
 * - A clickable header carrying an affordance icon, a label, optional pills.
 * - Affordance-icon precedence: active → spinner; just-completed → success check
 *   (flash); otherwise → NO affordance icon AND no affordance span at all (an
 *   idle body/filler row emits nothing, so there is no empty box or gap between
 *   the caret and the kind icon/label). The disclosure caret is owned SOLELY by
 *   the registry
 *   `Collapsible` slot — this substrate MUST NOT render its own caret. A running,
 *   expandable row may therefore show BOTH the spinner (this affordance) and the
 *   Collapsible's caret, which is acceptable.
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
import { cx } from '../cx'
import { useChatClassNames, useChatComponents } from '../registry'
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
  /**
   * Optional content rendered in the header AFTER the affordance (when present)
   * and BEFORE the leading kind icon — used by `BlockGroup` for the `(+N)`
   * hidden-count text, so it sits just after the disclosure caret.
   */
  prefix?: ReactNode
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
  prefix,
  className,
}: CollapsibleRowProps) {
  const { Collapsible, Badge, icons } = useChatComponents()
  const cn = useChatClassNames()
  const flash = useFlashComplete(isActive)
  // `elapsed` is consumed ONLY by the timer pill (gated on `showTimer` below),
  // so gate the ticking on the pill actually rendering: without this, an
  // active row with no timer pill would re-render at 10Hz (100ms default tick)
  // for nothing. The hook stays generic — the gating lives at this call site.
  const elapsed = useElapsedTimer({ startedAt, isActive: isActive && showTimer, durationMs })

  // Uncontrolled open state seeded from defaultOpen; re-seed when defaultOpen
  // changes (verbose/expand-all flip resets a manual collapse).
  const controlled = open !== undefined
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const prevDefault = useRef(defaultOpen)
  // Re-seed the uncontrolled open state when `defaultOpen` flips (verbose/
  // expand-all). Skip entirely while controlled — the parent owns `open`, so
  // touching internal state there is a wasted render.
  //
  // This is React's officially-supported "storing information from previous
  // renders" pattern: adjust THIS component's own state during render, guarded
  // by a ref holding the previous prop value so the set runs at most once per
  // `defaultOpen` change (no infinite loop, no StrictMode warning). React
  // re-renders the component immediately without committing the intermediate
  // DOM, so `internalOpen` already reflects the new value this same render and
  // is forwarded to the Collapsible slot below.
  // See https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (!controlled && prevDefault.current !== defaultOpen) {
    prevDefault.current = defaultOpen
    if (internalOpen !== defaultOpen) setInternalOpen(defaultOpen)
  }

  const hasBody = children != null && children !== false
  const timerPill = showTimer && (isActive || durationMs !== undefined)
  // Auto-hide: nothing to show and not forced.
  if (!alwaysShow && !isActive && !flash && !timerPill && !hasBody) return null

  // Affordance-icon precedence. The disclosure caret is NOT emitted here — the
  // registry `Collapsible` slot is the sole caret owner — so a bodied idle row
  // carries the `body` tone (for layout/styling) but renders no affordance icon,
  // exactly like the `filler` tone.
  let Affordance: typeof icons.spinner | undefined
  let affordanceTone: 'active' | 'success' | 'body' | 'filler'
  if (isActive) {
    Affordance = icons.spinner
    affordanceTone = 'active'
  } else if (flash) {
    Affordance = icons.check
    affordanceTone = 'success'
  } else if (hasBody) {
    // Bodied + idle: the Collapsible slot renders the caret; emit no icon here.
    Affordance = undefined
    affordanceTone = 'body'
  } else {
    Affordance = undefined
    affordanceTone = 'filler'
  }

  const LeadingIcon = iconName ? icons[iconName] : undefined
  const tps = formatTokensPerSecond(tokensPerSecond)

  const header = (
    <span className={cx('chat-row-header', cn.rowHeader)} data-affordance={affordanceTone}>
      {/* Render the affordance span ONLY when there is an affordance icon (active
          spinner / flash check). An idle body/filler row emits nothing here, so
          there is no empty width-reserving box between the caret and the kind
          icon/label. */}
      {Affordance ? (
        <span
          className={cx('chat-row-affordance', cn.rowAffordance)}
          data-affordance={affordanceTone}
        >
          <Affordance className={cx('chat-row-affordance-icon', cn.rowAffordanceIcon)} />
        </span>
      ) : null}
      {prefix}
      {LeadingIcon ? <LeadingIcon className={cx('chat-row-icon', cn.rowIcon)} /> : null}
      <span className={cx('chat-row-label', cn.rowLabel)}>{label}</span>
      {error ? (
        // Non-color glanceable marker on the collapsed header: a text "Error"
        // chip (in addition to the error color/border) so the failure reads
        // without relying on color. Pending/running/success rows omit it.
        <Badge className={cx('chat-row-error-marker', cn.rowErrorMarker)} tone="error">
          Error
        </Badge>
      ) : null}
      {timerPill ? (
        <span className={cx('chat-row-timer', cn.rowTimer)}>{formatDuration(elapsed)}</span>
      ) : null}
      {tps ? <span className={cx('chat-row-tps', cn.rowTps)}>{tps}</span> : null}
    </span>
  )

  // When there is no body, render a static (non-toggling) row so an empty
  // disclosure cannot be expanded into nothing. The host class overrides
  // (`cn.row`, and `cn.rowError` only in the error case) are folded into the
  // join after their stable hooks; `className` (e.g. BlockGroup's `chat-group`)
  // trails so an outer styled wrapper keeps the last word.
  const rootClass = cx(
    'chat-row',
    cn.row,
    error ? 'chat-row-error' : null,
    error ? cn.rowError : null,
    className,
  )

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
