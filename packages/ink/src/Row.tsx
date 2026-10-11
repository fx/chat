/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */

import type { SummaryIconName } from '@fx/chat-core'
import { formatDuration, formatTokensPerSecond, shouldShowTimer } from '@fx/chat-core'
/**
 * One collapsible row — the terminal counterpart of `@fx/chat`'s
 * CollapsibleRow: affordance (spinner while live, a brief ✓ when it finishes,
 * else a disclosure caret when it has a body), optional `+N` prefix, kind
 * glyph, label, error marker, timer, and tokens/sec. The body shows when
 * `expanded`.
 */
import type { ReactNode } from 'react'
import { Spinner } from './Spinner'
import { Styled, useInkComponents } from './registry'
import { React, hooks, ink } from './runtime'
import { Text } from './text'

export interface RowProps {
  label: ReactNode
  /** Secondary text after the label (e.g. a tool's input), muted. */
  detail?: string | undefined
  /** A qualifier after everything else (e.g. `denied`), in the danger tone. */
  qualifier?: string | undefined
  iconName?: SummaryIconName | undefined
  /** Rendered before the icon (e.g. the `(+N)` count). */
  prefix?: ReactNode
  isActive?: boolean | undefined
  startedAt?: number | undefined
  durationMs?: number | undefined
  showTimer?: boolean | undefined
  tokensPerSecond?: number | undefined
  error?: boolean | undefined
  expanded?: boolean | undefined
  children?: ReactNode
}

export function Row({
  label,
  detail,
  qualifier,
  iconName,
  prefix,
  isActive = false,
  startedAt,
  durationMs,
  showTimer = false,
  tokensPerSecond,
  error = false,
  expanded = false,
  children,
}: RowProps) {
  const { glyphs, flashComplete } = useInkComponents()
  const flash = hooks.useFlashComplete(isActive, 1200, flashComplete)
  const elapsed = hooks.useElapsedTimer({ startedAt, isActive: isActive && showTimer, durationMs })
  const hasBody = children != null && children !== false
  const timer = shouldShowTimer({ showTimer, isActive, startedAt, durationMs })
  const tps = formatTokensPerSecond(tokensPerSecond)

  let affordance: ReactNode
  if (isActive) affordance = <Spinner />
  else if (flash) affordance = <Styled tone="positive">{glyphs.success}</Styled>
  else if (hasBody)
    affordance = <Styled tone="marker">{expanded ? glyphs.expanded : glyphs.collapsed}</Styled>
  else affordance = <Text> </Text>

  return (
    <ink.Box flexDirection="column">
      <ink.Box gap={1}>
        {affordance}
        {prefix}
        {iconName ? <Styled tone="marker">{glyphs[iconName]}</Styled> : null}
        <Styled tone={error ? 'danger' : 'strong'} wrap="truncate-end">
          {label}
        </Styled>
        {detail ? (
          <Styled tone="muted" wrap="truncate-end">
            {detail}
          </Styled>
        ) : null}
        {error ? <Styled tone="danger">{glyphs.error} Error</Styled> : null}
        {qualifier ? <Styled tone="danger">· {qualifier}</Styled> : null}
        {timer ? <Styled tone="muted">{formatDuration(elapsed)}</Styled> : null}
        {tps ? <Styled tone="muted">{tps}</Styled> : null}
      </ink.Box>
      {hasBody && expanded ? (
        <ink.Box flexDirection="column" paddingLeft={2}>
          {children}
        </ink.Box>
      ) : null}
    </ink.Box>
  )
}

/** Clip long text to `maxLines`, noting how many lines were hidden. */
export function clipLines(text: string, maxLines: number): string {
  const lines = text.split('\n')
  if (lines.length <= maxLines) return text
  return [...lines.slice(0, maxLines), `… ${lines.length - maxLines} more lines`].join('\n')
}

/** Pretty JSON, tolerating values JSON cannot encode. */
export function toJson(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}
