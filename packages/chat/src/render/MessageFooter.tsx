import type { MessageMetrics, MessageOutcome } from '@fx/chat-core'
import {
  formatCost,
  formatDuration,
  formatElapsed,
  formatFooterMetrics,
  formatTokenCount,
  formatTokensPerSecond,
} from '@fx/chat-core'
import { useElapsedTimer } from '@fx/chat-core/react'
/**
 * `MessageFooter` — per-message affordances and metrics.
 *
 * Copy is available whenever the message has copyable text — it needs no host
 * callback (registry `CopyButton`) but renders only when `copyText` has
 * non-whitespace content (a tool-call-only turn has nothing to copy).
 * Regenerate, fork, and reset are available only when their callbacks are
 * provided. In the default (non-compact) layout the controls render inline
 * with their text labels and the metrics line.
 *
 * The footer renders NOTHING at all when it has no affordances or metrics to
 * show — no copyable text, no action callbacks, and no renderable metrics —
 * so a message with nothing actionable gets no empty footer chrome.
 *
 * In COMPACT mode the action buttons (Copy/Regenerate/Fork/Reset) are ALWAYS
 * visible but ICON-ONLY, sitting next to a kebab (`dotsThree`) toggle. The kebab
 * reveals the TEXT LABELS for those actions and the metrics line (model ·
 * duration · tokens/sec). Metrics render only when present and degrade
 * gracefully when absent. When the registry provides a `MessageDetails`
 * presenter, the kebab opens it with the metrics, outcome, copy text and
 * actions instead, and nothing is revealed inline.
 *
 * Every visual atom and icon comes from `useChatComponents()`.
 */
import { useState } from 'react'
import { cx } from '../cx'
import {
  type ActivityFact,
  type IconComponent,
  type IconRegistry,
  type MessageDetail,
  type MessageDetailsAction,
  useChatClassNames,
  useChatComponents,
} from '../registry'

/** Props for {@link MessageFooter}. */
export interface MessageFooterProps {
  /** The text to copy (whole message text). Empty/whitespace-only → the copy control is omitted. */
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
  /** How the message ended, when it did not simply complete (shown as a marker). */
  outcome?: MessageOutcome
  /**
   * Opens the message's `MessageDetails` presenter, owned by the caller (the
   * message). When set, a compact footer's kebab calls it and the footer
   * renders no presenter of its own.
   */
  onOpenDetails?: () => void
  /** A finished message's activity facts, shown as icons (opening details when it can). */
  activity?: ActivityFact[]
}

/** The message actions a `MessageDetails` presenter offers, in footer order. */
export function detailsActions(
  icons: IconRegistry,
  {
    onRegenerate,
    onFork,
    onReset,
  }: Pick<MessageFooterProps, 'onRegenerate' | 'onFork' | 'onReset'>,
): MessageDetailsAction[] {
  const actions: MessageDetailsAction[] = []
  if (onRegenerate)
    actions.push({
      id: 'regenerate',
      label: 'Regenerate',
      icon: icons.regenerate,
      onSelect: onRegenerate,
    })
  if (onFork) actions.push({ id: 'fork', label: 'Fork', icon: icons.fork, onSelect: onFork })
  if (onReset) actions.push({ id: 'reset', label: 'Reset', icon: icons.reset, onSelect: onReset })
  return actions
}

/**
 * Whether a metrics object has any renderable content. Mirrors `Metrics`'
 * own field checks so callers (e.g. the compact reveal gate) agree with what
 * `Metrics` would actually render — an empty/all-undefined metrics object has
 * no content and reveals nothing.
 */
function hasMetricsContent(metrics?: MessageMetrics): boolean {
  return metricsText(metrics) !== undefined
}

/** The metrics line: model · duration · rate, then the cost when reported. */
function metricsText(metrics?: MessageMetrics): string | undefined {
  const parts = [formatFooterMetrics(metrics), metrics?.cost ? formatCost(metrics.cost) : undefined]
  const text = parts.filter(Boolean).join(' · ')
  return text || undefined
}

/** The metrics as labelled facts for a `MessageDetails` presenter, present fields only. */
export function messageDetails(metrics?: MessageMetrics): MessageDetail[] {
  if (!metrics) return []
  const out: MessageDetail[] = []
  const add = (key: MessageDetail['key'], label: string, value: string | undefined) => {
    if (value) out.push({ key, label, value })
  }
  add('model', 'Model', metrics.model)
  add(
    'duration',
    'Duration',
    metrics.durationMs !== undefined ? formatDuration(metrics.durationMs) : undefined,
  )
  add('rate', 'Speed', formatTokensPerSecond(metrics.tokensPerSecond))
  const { prompt, completion, total } = metrics.usage ?? {}
  const tokens = [
    prompt !== undefined ? `${formatTokenCount(prompt)} in` : undefined,
    completion !== undefined ? `${formatTokenCount(completion)} out` : undefined,
  ].filter(Boolean)
  add(
    'tokens',
    'Tokens',
    tokens.length > 0
      ? tokens.join(' · ')
      : total !== undefined
        ? formatTokenCount(total)
        : undefined,
  )
  add('cost', 'Cost', metrics.cost ? formatCost(metrics.cost) : undefined)
  const { context } = metrics
  add(
    'context',
    'Context',
    context
      ? `${formatTokenCount(context.used)}${context.size !== undefined ? ` of ${formatTokenCount(context.size)}` : ''}`
      : undefined,
  )
  return out
}

/**
 * Whether the footer has ANYTHING to render: non-whitespace copyable text, at
 * least one action callback, or renderable metrics. This is the single source
 * of truth for the zero-affordance decision — `MessageFooter` uses it for its
 * own early return (safety net), and parents (e.g. `MessageItem`'s timestamp-
 * gutter wrapper) use it to skip the footer branch entirely so no empty
 * wrapper chrome (a gutter row with a blank clock cell) is emitted around a
 * footer that would render nothing.
 *
 * The parameter maps the relevant {@link MessageFooterProps} keys to REQUIRED
 * keys (indexed access keeps `undefined` in the optional ones' types), so
 * callers can pass destructured locals directly even under
 * `exactOptionalPropertyTypes`.
 */
export function hasFooterContent(
  props: { outcome?: MessageOutcome | undefined } & {
    [K in 'copyText' | 'onRegenerate' | 'onFork' | 'onReset' | 'metrics']: MessageFooterProps[K]
  },
): boolean {
  return Boolean(
    props.outcome ||
      props.copyText.trim().length > 0 ||
      props.onRegenerate ||
      props.onFork ||
      props.onReset ||
      hasMetricsContent(props.metrics),
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
  return (
    <span className={cx('chat-footer-metrics', cn.footerMetrics)} data-testid="chat-footer-metrics">
      {metricsText(metrics)}
    </span>
  )
}

/** A finished message's activity facts as icons with their text; a button when they open details. */
function ActivityFacts({
  facts,
  onOpen,
}: { facts: ActivityFact[]; onOpen?: (() => void) | undefined }) {
  const { Button, icons } = useChatComponents()
  const cn = useChatClassNames()
  const iconFor = {
    tools: icons.wrench,
    reasoning: icons.brain,
    // Optional in a registry, but the provider's merge always supplies it.
    plan: icons.checklist as IconComponent,
  }
  const chips = facts.map((fact) => {
    const Icon = iconFor[fact.key]
    return (
      <span
        key={fact.key}
        className={cx('chat-footer-fact', cn.footerFact)}
        data-fact={fact.key}
        {...(fact.failed ? { 'data-failed': String(fact.failed) } : {})}
      >
        <Icon className={cx('chat-footer-fact-icon', cn.footerFactIcon)} />
        <span className={cx('chat-footer-fact-text', cn.footerFactText)}>{fact.text}</span>
      </span>
    )
  })
  const label = facts.map((fact) => fact.label).join(' · ')
  return onOpen ? (
    <Button
      className={cx('chat-footer-activity', cn.footerActivity)}
      aria-label={label}
      onClick={onOpen}
    >
      {chips}
    </Button>
  ) : (
    <span className={cx('chat-footer-activity', cn.footerActivity)} title={label}>
      {chips}
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
  outcome,
  compact = false,
  onOpenDetails,
  activity,
}: MessageFooterProps) {
  const { Button, CopyButton, MessageDetails, icons } = useChatComponents()
  const cn = useChatClassNames()
  const [revealed, setRevealed] = useState(false)
  const RegenerateIcon = icons.regenerate
  const ForkIcon = icons.fork
  const ResetIcon = icons.reset

  // Copy is gated on non-whitespace content: a whitespace-only payload is as
  // uncopyable as an empty one. The raw `copyText` remains the copied value.
  const showCopy = copyText.trim().length > 0
  const hasMetrics = hasMetricsContent(metrics)

  // Nothing to show at all — no copyable text, no action callbacks, and no
  // renderable metrics — so render no footer chrome whatsoever. `MessageItem`
  // gates its footer branch (and its gutter-row wrapper) on the same predicate;
  // this early return remains as the safety net for direct consumers.
  if (!hasFooterContent({ copyText, onRegenerate, onFork, onReset, metrics, outcome })) {
    return null
  }

  // Text labels for the action buttons show inline in the default layout, and in
  // compact mode only once the kebab reveals them. Each button renders only when
  // its gate holds (Copy needs non-whitespace `copyText`; regenerate/fork/reset
  // need their callback), but a rendered button's icon is visible in both modes —
  // compact mode only hides the labels, never the buttons.
  // A presenter takes over what the compact kebab reveals: the caller's (the
  // message's, via `onOpenDetails`) or, standalone, the footer's own.
  const delegated = compact && onOpenDetails ? onOpenDetails : undefined
  const Presenter = compact && !delegated ? MessageDetails : undefined
  const showLabels = !compact || (revealed && !Presenter && !delegated)
  // The metrics line is always shown in the default layout, but in compact mode
  // it is part of what the kebab reveals.
  const showMetrics = showLabels
  // The kebab reveals action labels and the metrics line. In compact mode it is
  // only worth rendering when there is actually something to reveal: at least one
  // action callback (regenerate/fork/reset) OR metrics with renderable content.
  // An empty/all-undefined metrics object renders nothing, so it does not count.
  // With nothing to reveal, toggling it would show nothing, so omit the kebab.
  const hasRevealable = Boolean(onRegenerate || onFork || onReset || hasMetrics)

  const label = (text: string) =>
    showLabels ? <span className={cx('chat-footer-label', cn.footerLabel)}>{text}</span> : null

  return (
    <div className={cx('chat-footer', cn.footer)} data-compact={compact ? 'true' : undefined}>
      {outcome ? (
        <span className={cx('chat-footer-outcome', cn.footerOutcome)} data-outcome={outcome.kind}>
          {outcome.kind === 'stopped' ? 'Stopped' : 'Failed'}
        </span>
      ) : null}
      {activity && activity.length > 0 ? (
        <ActivityFacts facts={activity} onOpen={onOpenDetails} />
      ) : null}
      {compact && hasRevealable ? (
        <Button
          className={cx('chat-footer-reveal', cn.footerReveal)}
          aria-label={
            Presenter || delegated ? 'Message details' : revealed ? 'Hide actions' : 'Show actions'
          }
          onClick={delegated ?? (() => setRevealed((v) => !v))}
        >
          <icons.dotsThree className={cx('chat-footer-icon', cn.footerIcon)} />
        </Button>
      ) : null}
      {showCopy ? (
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
      {metrics && showMetrics && hasMetrics ? <Metrics metrics={metrics} /> : null}
      {Presenter && hasRevealable ? (
        <Presenter
          open={revealed}
          onOpenChange={setRevealed}
          details={messageDetails(metrics)}
          outcome={
            outcome?.kind === 'error' ? { kind: 'error', message: outcome.message } : outcome
          }
          copyText={showCopy ? copyText : ''}
          actions={detailsActions(icons, {
            ...(onRegenerate ? { onRegenerate } : {}),
            ...(onFork ? { onFork } : {}),
            ...(onReset ? { onReset } : {}),
          })}
        />
      ) : null}
    </div>
  )
}

/** Props for {@link LiveFooter}. */
export interface LiveFooterProps {
  /** Epoch-ms creation time of the live message. */
  startedAt?: number | undefined
}

/**
 * The opt-in footer of a LIVE message: whole-second elapsed time since the
 * message began, re-rendering at most once a second (the completion footer's
 * gate is unchanged; this is a separate, host-enabled row).
 */
export function LiveFooter({ startedAt }: LiveFooterProps) {
  const cn = useChatClassNames()
  const elapsed = useElapsedTimer({ startedAt, isActive: true, intervalMs: 1000 })
  if (startedAt === undefined || !Number.isFinite(startedAt)) return null
  return (
    <div className={cx('chat-footer', cn.footer)} data-live="true">
      <span className={cx('chat-footer-elapsed', cn.footerElapsed)}>
        {formatElapsed(elapsed, { live: true })}
      </span>
    </div>
  )
}
