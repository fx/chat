/**
 * `GutterRow` — the two-column TIMESTAMP GUTTER row primitive: a fixed left
 * clock cell (`.chat-gutter-time`) + the row content (`.chat-gutter-content`),
 * wrapped in `.chat-gutter-row`. It is purely presentational — it emits the
 * three stable `.chat-gutter-*` hooks and the pre-formatted clock label; the
 * package is HEADLESS, so the two-column VISUAL LAYOUT (the fixed clock-cell
 * width, the muted/tabular look) is host-supplied via `classNames` onto those
 * hooks.
 *
 * The clock cell is ALWAYS emitted so the host can reserve its width even when
 * empty, and is `aria-hidden` when the label is blank (`''`) so screen readers
 * skip a width-only cell.
 *
 * Shared by both gutter emitters so the markup lives in ONE place:
 * `MessageItem` wraps its per-message rows (clock via its own per-render
 * de-duper), and `MessageLog` wraps standalone host timeline items (clock from
 * the item's `at`). Neither owns the markup.
 */
import type { ReactNode } from 'react'
import { cx } from '../cx'
import { useChatClassNames } from '../registry'

/** Props for {@link GutterRow}. */
export interface GutterRowProps {
  /**
   * The pre-formatted clock label (local 24-hour `HH:MM:SS`). An empty string
   * renders a blank, `aria-hidden`, width-reserving cell — callers pass `''`
   * for a de-duped/blank/invalid timestamp.
   */
  clock: string
  /** The row content rendered in the right-hand content cell. */
  children: ReactNode
}

/** Renders one two-column gutter row (clock cell + content cell). */
export function GutterRow({ clock, children }: GutterRowProps) {
  const cn = useChatClassNames()
  return (
    <div className={cx('chat-gutter-row', cn.gutterRow)}>
      <span
        className={cx('chat-gutter-time', cn.gutterTime)}
        data-testid="chat-gutter-time"
        {...(clock === '' ? { 'aria-hidden': true } : {})}
      >
        {clock}
      </span>
      <div className={cx('chat-gutter-content', cn.gutterContent)}>{children}</div>
    </div>
  )
}
