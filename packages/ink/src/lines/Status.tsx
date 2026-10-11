/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */

import {
  type LivePhase,
  type RenderableMessage,
  countActivity,
  formatElapsed,
  livePhase,
  toolLabel,
} from '@fx/chat-core'
/**
 * Fullscreen chrome around the viewport: the status line, queued (pending)
 * message rows, and an empty state. All look comes from the injected theme and
 * glyphs.
 */
import type { ReactNode } from 'react'
import { Styled, appearanceProps, useInkComponents } from '../registry'
import { React, hooks, ink } from '../runtime'
import type { InkAppearance } from '../theme'
import { type Measure, defaultMeasure, truncate } from './measure'

export interface StatusLineProps {
  width: number
  /** The live message, when one streams: drives the pulse and phase. */
  live?: { message: RenderableMessage; startedAt: number } | undefined
  /** Shown when nothing is live. */
  notice?: { text: string; tone: 'positive' | 'danger' } | undefined
  /** The host's own state when nothing is live and there is no notice (before "↓ N more"). */
  idle?: string | undefined
  /** Lines below the viewport window ("↓ N more"). */
  below?: number
  /** Host facts appended while live, e.g. `2 queued`, `^X stop`. */
  extras?: string[]
  /** Host label per phase (return undefined for the default). */
  phaseLabel?: (phase: LivePhase) => string | undefined
  /** Facts appended once a phase has lasted a while (e.g. a cold-start hint). */
  slowHint?: { afterMs: number; text: string; phases: LivePhase['kind'][] }
  /** The pulse's appearance (default: the `accent` role). */
  accent?: InkAppearance
  measure?: Measure
}

function defaultPhaseLabel(phase: LivePhase): string {
  switch (phase.kind) {
    case 'waiting':
      return 'waiting'
    case 'thinking':
      return 'thinking'
    case 'writing':
      return 'writing'
    case 'tool':
      return `running ${truncate(toolLabel(phase.call), 32)}`
  }
}

export function StatusLine({
  width,
  live,
  notice,
  idle,
  below = 0,
  extras = [],
  phaseLabel,
  slowHint,
  accent,
  measure = defaultMeasure,
}: StatusLineProps) {
  const { glyphs, theme } = useInkComponents()
  const ticks = hooks.useTicks(live !== undefined, 1000)
  const now = hooks.useClock(false)
  const rule = glyphs.boxHorizontal
  let label: ReactNode = null
  let labelText = ''
  if (live) {
    const phase = livePhase(live.message)
    const elapsed = now - live.startedAt
    const facts = [
      phaseLabel?.(phase) ?? defaultPhaseLabel(phase),
      formatElapsed(elapsed, { live: true }),
    ]
    const tools = countActivity(live.message.blocks).tools.total
    if (tools > 0) facts.push(`${tools} tool${tools === 1 ? '' : 's'}`)
    if (slowHint && elapsed >= slowHint.afterMs && slowHint.phases.includes(phase.kind))
      facts.push(slowHint.text)
    facts.push(...extras)
    const pulse = glyphs.pulse[ticks % glyphs.pulse.length] ?? ''
    const factText = facts.join(glyphs.separator)
    labelText = ` ${pulse} ${factText} `
    label = (
      <>
        <ink.Text> </ink.Text>
        <ink.Text {...appearanceProps(accent ?? theme.accent)}>{pulse}</ink.Text>
        <Styled tone="muted"> {factText} </Styled>
      </>
    )
  } else if (notice) {
    const text = ` ${notice.tone === 'positive' ? glyphs.success : glyphs.error} ${notice.text} `
    labelText = text
    label = <Styled tone={notice.tone}>{text}</Styled>
  } else if (idle || below > 0) {
    labelText = ` ${[idle, below > 0 ? `↓ ${below} more` : undefined].filter(Boolean).join(glyphs.separator)} `
    label = <Styled tone="muted">{labelText}</Styled>
  }
  const lead = rule.repeat(2)
  const rest = Math.max(0, width - measure(lead) - measure(labelText))
  if (measure(lead) + measure(labelText) > width) {
    return (
      <ink.Box height={1} overflow="hidden">
        <ink.Text wrap="truncate">
          <Styled tone="chrome">{lead}</Styled>
          {truncate(labelText, Math.max(0, width - measure(lead)), measure)}
        </ink.Text>
      </ink.Box>
    )
  }
  return (
    <ink.Box height={1} overflow="hidden">
      <ink.Text wrap="truncate">
        <Styled tone="chrome">{lead}</Styled>
        {label}
        <Styled tone="chrome">{rule.repeat(rest)}</Styled>
      </ink.Text>
    </ink.Box>
  )
}

export interface PendingItem {
  text: string
  attachments?: number
}

export interface PendingRowsProps {
  items: PendingItem[]
  width: number
  /** At most this many rows, newest last (default 3). */
  maxRows?: number
  measure?: Measure
}

/** Messages queued while an answer streams (the queue itself is host state). */
export function PendingRows({
  items,
  width,
  maxRows = 3,
  measure = defaultMeasure,
}: PendingRowsProps) {
  const { glyphs } = useInkComponents()
  if (items.length === 0) return null
  const shown = items.slice(-maxRows)
  const hidden = items.length - shown.length
  return (
    <ink.Box flexDirection="column">
      {shown.map((item, i) => {
        const more = i === 0 && hidden > 0 ? `+${hidden} · ` : ''
        const clip = item.attachments ? `${glyphs.attachment}${item.attachments} ` : ''
        const text = `${more}${clip}${item.text.replace(/\s+/g, ' ').trim()}`
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: queue rows are positional
          <ink.Box key={i} height={1} overflow="hidden">
            <ink.Text wrap="truncate">
              <Styled tone="caution">{glyphs.pending} </Styled>
              <Styled tone="muted">
                {truncate(text, Math.max(1, width - measure(glyphs.pending) - 1), measure)}
              </Styled>
            </ink.Text>
          </ink.Box>
        )
      })}
    </ink.Box>
  )
}

export interface EmptyStateProps {
  title: string
  subtitle?: string
  notes?: string[]
  /** The title's appearance (default: the `accent` role). */
  accent?: InkAppearance
}

/** A centred empty state; pass it as the viewport's `empty`. */
export function EmptyState({ title, subtitle, notes = [], accent }: EmptyStateProps) {
  const { theme } = useInkComponents()
  return (
    <ink.Box flexDirection="column" alignItems="center">
      <ink.Text {...appearanceProps(accent ?? theme.accent)} bold>
        {title}
      </ink.Text>
      {subtitle ? <Styled tone="muted">{subtitle}</Styled> : null}
      {notes.map((note) => (
        <Styled key={note} tone="muted">
          {note}
        </Styled>
      ))}
    </ink.Box>
  )
}
