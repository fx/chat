/**
 * `MessageFooter` — per-message affordances and metrics.
 *
 * Copy is available whenever the message has copyable text — it needs no host
 * callback (registry `CopyButton`) but renders only when `copyText` is a
 * non-empty string (a tool-call-only turn has nothing to copy). Regenerate,
 * fork, and reset are available only when their callbacks are provided. In the
 * default (non-compact) layout the controls render inline with their text
 * labels and the metrics line.
 *
 * In COMPACT mode the action buttons (Copy/Regenerate/Fork/Reset) are ALWAYS
 * visible but ICON-ONLY, sitting next to a kebab (`dotsThree`) toggle. The kebab
 * reveals the TEXT LABELS for those actions and the metrics line (model ·
 * duration · tokens/sec). Metrics render only when present and degrade
 * gracefully when absent.
 *
 * Every visual atom and icon comes from `useChatComponents()`.
 */
import { useState } from 'react'
import { cx } from '../cx'
import type { MessageMetrics } from '../model'
import { useChatClassNames, useChatComponents } from '../registry'
import { formatDuration, formatTokensPerSecond } from './format'

/** Props for {@link MessageFooter}. */
export interface MessageFooterProps {
  /** The text to copy (whole message text). Empty → the copy control is omitted. */
  copyText: string
  /** Optional regenerate callback; its control renders only when provided. */
  onRegenerate?: () => void
  /** Optional fork callback; its control renders only when provided. */
  onFork?: () => void
  /** Optional reset callback; its control renders only when provided. */
  onReset?: () => void
  /** Per-message metrics; each field renders only when present. */
  metrics?: MessageMetrics
  /** Compact (icon-only behind a reveal toggle) mode. */
  compact?: boolean
}

/**
 * Whether a metrics object has any renderable content. Mirrors `Metrics`'
 * own field checks so callers (e.g. the compact reveal gate) agree with what
 * `Metrics` would actually render — an empty/all-undefined metrics object has
 * no content and reveals nothing.
 */
function hasMetricsContent(metrics?: MessageMetrics): boolean {
  if (!metrics) return false
  return Boolean(
    metrics.model ||
      metrics.durationMs !== undefined ||
      formatTokensPerSecond(metrics.tokensPerSecond),
  )
}

/**
 * Renders the metrics line (model · duration · tokens/sec) for present fields.
 * The caller MUST gate rendering on `hasMetricsContent` — this renderer assumes
 * at least one field is presentable (it is the single source of truth for the
 * field checks; the emptiness decision lives in `hasMetricsContent`).
 */
function Metrics({ metrics }: { metrics: MessageMetrics }) {
  const cn = useChatClassNames()
  const parts: string[] = []
  if (metrics.model) parts.push(metrics.model)
  if (metrics.durationMs !== undefined) parts.push(formatDuration(metrics.durationMs))
  const tps = formatTokensPerSecond(metrics.tokensPerSecond)
  if (tps) parts.push(tps)
  return (
    <span className={cx('chat-footer-metrics', cn.footerMetrics)} data-testid="chat-footer-metrics">
      {parts.join(' · ')}
    </span>
  )
}

/** Renders the message footer affordances + metrics. */
export function MessageFooter({
  copyText,
  onRegenerate,
  onFork,
  onReset,
  metrics,
  compact = false,
}: MessageFooterProps) {
  const { Button, CopyButton, icons } = useChatComponents()
  const cn = useChatClassNames()
  const [revealed, setRevealed] = useState(false)
  const RegenerateIcon = icons.regenerate
  const ForkIcon = icons.fork
  const ResetIcon = icons.reset

  // Text labels for the action buttons show inline in the default layout, and in
  // compact mode only once the kebab reveals them. The buttons (icon) themselves
  // are ALWAYS visible in both modes.
  const showLabels = !compact || revealed
  // The metrics line is always shown in the default layout, but in compact mode
  // it is part of what the kebab reveals.
  const showMetrics = !compact || revealed
  // The kebab reveals action labels and the metrics line. In compact mode it is
  // only worth rendering when there is actually something to reveal: at least one
  // action callback (regenerate/fork/reset) OR metrics with renderable content.
  // An empty/all-undefined metrics object renders nothing, so it does not count.
  // With nothing to reveal, toggling it would show nothing, so omit the kebab.
  const hasRevealable = Boolean(onRegenerate || onFork || onReset || hasMetricsContent(metrics))

  const label = (text: string) =>
    showLabels ? <span className={cx('chat-footer-label', cn.footerLabel)}>{text}</span> : null

  return (
    <div className={cx('chat-footer', cn.footer)} data-compact={compact ? 'true' : undefined}>
      {compact && hasRevealable ? (
        <Button
          className={cx('chat-footer-reveal', cn.footerReveal)}
          aria-label={revealed ? 'Hide actions' : 'Show actions'}
          onClick={() => setRevealed((v) => !v)}
        >
          <icons.dotsThree className={cx('chat-footer-icon', cn.footerIcon)} />
        </Button>
      ) : null}
      {copyText ? (
        <CopyButton
          value={copyText}
          aria-label="Copy message"
          className={cx('chat-footer-copy', cn.footerCopy)}
        />
      ) : null}
      {onRegenerate ? (
        <Button
          className={cx('chat-footer-regenerate', cn.footerRegenerate)}
          aria-label="Regenerate"
          onClick={onRegenerate}
        >
          <RegenerateIcon className={cx('chat-footer-icon', cn.footerIcon)} />
          {label('Regenerate')}
        </Button>
      ) : null}
      {onFork ? (
        <Button
          className={cx('chat-footer-fork', cn.footerFork)}
          aria-label="Fork"
          onClick={onFork}
        >
          <ForkIcon className={cx('chat-footer-icon', cn.footerIcon)} />
          {label('Fork')}
        </Button>
      ) : null}
      {onReset ? (
        <Button
          className={cx('chat-footer-reset', cn.footerReset)}
          aria-label="Reset"
          onClick={onReset}
        >
          <ResetIcon className={cx('chat-footer-icon', cn.footerIcon)} />
          {label('Reset')}
        </Button>
      ) : null}
      {metrics && showMetrics && hasMetricsContent(metrics) ? <Metrics metrics={metrics} /> : null}
    </div>
  )
}
