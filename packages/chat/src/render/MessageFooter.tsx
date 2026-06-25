/**
 * `MessageFooter` — per-message affordances and metrics.
 *
 * Copy is always AVAILABLE — it needs no host callback (registry `CopyButton`)
 * — whereas regenerate, fork, and reset are available only when their callbacks
 * are provided. In the default (non-compact) layout the controls render inline.
 * In compact mode every control, Copy included, is hidden behind the reveal
 * toggle until the user reveals them. Metrics (model, duration, tokens/sec)
 * render only when present and degrade gracefully when absent.
 *
 * Every visual atom and icon comes from `useChatComponents()`.
 */
import { useState } from 'react'
import type { MessageMetrics } from '../model'
import { useChatComponents } from '../registry'
import { formatDuration, formatTokensPerSecond } from './format'

/** Props for {@link MessageFooter}. */
export interface MessageFooterProps {
  /** The text to copy (whole message text). */
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

/** Renders the metrics line (model · duration · tokens/sec) for present fields. */
function Metrics({ metrics }: { metrics: MessageMetrics }) {
  const parts: string[] = []
  if (metrics.model) parts.push(metrics.model)
  if (metrics.durationMs !== undefined) parts.push(formatDuration(metrics.durationMs))
  const tps = formatTokensPerSecond(metrics.tokensPerSecond)
  if (tps) parts.push(tps)
  if (parts.length === 0) return null
  return (
    <span className="chat-footer-metrics" data-testid="chat-footer-metrics">
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
  const [revealed, setRevealed] = useState(false)
  const RegenerateIcon = icons.regenerate
  const ForkIcon = icons.fork
  const ResetIcon = icons.reset

  const showControls = !compact || revealed

  return (
    <div className="chat-footer" data-compact={compact ? 'true' : undefined}>
      {compact ? (
        <Button
          className="chat-footer-reveal"
          aria-label={revealed ? 'Hide actions' : 'Show actions'}
          onClick={() => setRevealed((v) => !v)}
        >
          <icons.gear className="chat-footer-icon" />
        </Button>
      ) : null}
      {showControls ? (
        <>
          <CopyButton value={copyText} aria-label="Copy message" className="chat-footer-copy" />
          {onRegenerate ? (
            <Button
              className="chat-footer-regenerate"
              aria-label="Regenerate"
              onClick={onRegenerate}
            >
              <RegenerateIcon className="chat-footer-icon" />
            </Button>
          ) : null}
          {onFork ? (
            <Button className="chat-footer-fork" aria-label="Fork" onClick={onFork}>
              <ForkIcon className="chat-footer-icon" />
            </Button>
          ) : null}
          {onReset ? (
            <Button className="chat-footer-reset" aria-label="Reset" onClick={onReset}>
              <ResetIcon className="chat-footer-icon" />
            </Button>
          ) : null}
        </>
      ) : null}
      {metrics ? <Metrics metrics={metrics} /> : null}
    </div>
  )
}
