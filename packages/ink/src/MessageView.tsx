/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */

import {
  type ContentBlock,
  type CustomBlock,
  type MessageOutcome,
  type PlanEntry,
  type RenderableBlock,
  type RenderableMessage,
  approxTokenCount,
  earlierLabel,
  isBlockActive,
  isCoreBlockType,
  lookupExtension,
  planFooter,
  planGroupHeader,
  planMessage,
  positiveTimestamp,
  statusLabel,
  summarizeBlock,
  toolDisplayInput,
  toolLabel,
  toolResultText,
} from '@fx-/chat-core'
/**
 * A message in the terminal: a projection of the core render plan
 * (`planMessage` / `planGroupHeader`), so grouping, labels, timers and the
 * footer gate match `@fx-/chat` exactly.
 */
import type { ComponentType } from 'react'
import { Row, clipLines, toJson } from './Row'
import { Spinner } from './Spinner'
import { Styled, useInkComponents } from './registry'
import { React, hooks, ink } from './runtime'
import { stripControlsDeep } from './sanitize'

/** Props passed to a host renderer for a custom block kind. */
export interface InkBlockRendererProps {
  block: CustomBlock
  message: RenderableMessage
  isStreaming: boolean
}

export interface InkExtensions {
  /** Renderers keyed by custom block `type`. */
  blockRenderers?: Record<string, ComponentType<InkBlockRendererProps>>
}

export interface MessageViewProps {
  message: RenderableMessage
  /** Whether this is the live, streaming message. */
  isActive?: boolean
  /** Show group and row bodies (reasoning text, tool input/output). */
  expanded?: boolean
  /** Fold each assistant turn's auxiliary blocks into one group. */
  minimal?: boolean
  showFooter?: boolean
  /** Maximum lines of any tool input/output or reasoning body. */
  bodyLines?: number
  /** Host label for retrying, shown in the footer of a stopped or failed message (e.g. "/retry"). */
  retryHint?: string
  /** Activity after content instead of in stream order. */
  activityPlacement?: 'inline' | 'after-content'
  /** While live and collapsed, show only the newest N activity blocks after an `N earlier` row. */
  liveTail?: number
  /** Show the footer (whole-second elapsed and activity facts) while live (opt-in). */
  liveFooter?: boolean
  extensions?: InkExtensions
}

interface Ctx {
  message: RenderableMessage
  isActive: boolean
  activeBlockId?: string | undefined
  startedAt?: number | undefined
  durationMs?: number | undefined
  tokensPerSecond?: number | undefined
  expanded: boolean
  bodyLines: number
  extensions?: InkExtensions | undefined
  outcome?: MessageOutcome | undefined
}

const APPROVAL_TEXT: Record<string, string | undefined> = {
  denied: 'denied',
  unavailable: 'refused',
  pending: 'awaiting approval',
}

function BlockRow({ block, ctx }: { block: RenderableBlock; ctx: Ctx }) {
  const { Markdown } = useInkComponents()
  const live = isBlockActive(block, ctx)
  if (!isCoreBlockType(block.type)) {
    const custom = block as CustomBlock
    const Renderer = lookupExtension(ctx.extensions?.blockRenderers, custom.type)
    if (Renderer) {
      return <Renderer block={custom} message={ctx.message} isStreaming={live} />
    }
    return <Row label={summarizeBlock(custom).label} />
  }
  const core = block as ContentBlock
  switch (core.type) {
    case 'text':
      return ctx.message.role === 'user' ? (
        <Styled tone="user">{core.text}</Styled>
      ) : (
        <Markdown content={core.text} {...(live ? { streaming: true } : {})} />
      )
    case 'reasoning': {
      const summary = summarizeBlock(core, { isActive: live })
      return (
        <Row
          label={summary.label}
          iconName="brain"
          isActive={live}
          startedAt={positiveTimestamp(core.startedAt) ?? ctx.startedAt}
          durationMs={core.durationMs}
          showTimer={summary.showTimer}
          expanded={ctx.expanded}
        >
          {core.text ? <Styled tone="muted">{clipLines(core.text, ctx.bodyLines)}</Styled> : null}
        </Row>
      )
    }
    case 'tool_call': {
      const isError = core.status === 'error'
      const input = toolDisplayInput(core)
      const approval = core.approval ? APPROVAL_TEXT[core.approval.state] : undefined
      return (
        <Row
          label={toolLabel(core) || 'tool'}
          {...(input ? { detail: input } : {})}
          {...(approval ? { qualifier: approval } : {})}
          iconName="wrench"
          isActive={live}
          startedAt={core.startedAt}
          durationMs={core.durationMs}
          showTimer
          error={isError}
          expanded={ctx.expanded}
        >
          <ink.Box flexDirection="column">
            <Styled tone="muted">input</Styled>
            <Styled tone="content">{clipLines(toJson(core.arguments), ctx.bodyLines)}</Styled>
            {core.result !== undefined ? (
              <>
                <Styled tone="muted">output</Styled>
                <Styled tone={isError ? 'danger' : 'content'}>
                  {clipLines(toolResultText(core.result), ctx.bodyLines)}
                </Styled>
              </>
            ) : null}
          </ink.Box>
        </Row>
      )
    }
    case 'status':
      return (
        <Row
          label={statusLabel(core.phase, live)}
          isActive={live}
          startedAt={ctx.startedAt}
          durationMs={ctx.durationMs}
          showTimer
          {...(live ? { tokensPerSecond: ctx.tokensPerSecond } : {})}
        />
      )
    case 'plan': {
      const summary = summarizeBlock(core)
      return (
        <Row label={summary.label} iconName="checklist" expanded={ctx.expanded}>
          {core.entries.length > 0 ? (
            <PlanEntries entries={core.entries} live={ctx.isActive} />
          ) : null}
        </Row>
      )
    }
    case 'system':
      return (
        <Row label="System prompt" iconName="gear" expanded={ctx.expanded}>
          <Styled tone="muted">{clipLines(core.text, ctx.bodyLines)}</Styled>
        </Row>
      )
  }
}

function PlanEntries({ entries, live }: { entries: PlanEntry[]; live: boolean }) {
  const { glyphs } = useInkComponents()
  return (
    <ink.Box flexDirection="column">
      {entries.map((entry, index) => {
        const marker =
          entry.status === 'completed'
            ? glyphs.planDone
            : entry.status === 'in_progress'
              ? glyphs.planActive
              : glyphs.planPending
        const tone =
          entry.status === 'completed'
            ? 'muted'
            : entry.status === 'in_progress' && live
              ? 'caution'
              : 'content'
        return (
          <ink.Box key={entry.id ?? index} gap={1}>
            {entry.status === 'in_progress' && live ? (
              <Spinner />
            ) : (
              <Styled tone={entry.status === 'completed' ? 'positive' : 'marker'}>{marker}</Styled>
            )}
            <Styled tone={tone}>{entry.content}</Styled>
          </ink.Box>
        )
      })}
    </ink.Box>
  )
}

function GroupRow({ blocks, ctx }: { blocks: RenderableBlock[]; ctx: Ctx }) {
  const plan = planGroupHeader(blocks, ctx)
  const tokensPerSecond = plan.showRate ? ctx.tokensPerSecond : undefined
  // A one-call group reads as that call's row: its error state and approval qualifier.
  const only = plan.tools?.only
  const approval = only?.approval ? APPROVAL_TEXT[only.approval.state] : undefined
  return (
    <Row
      label={plan.summary.label}
      {...(approval ? { qualifier: approval } : {})}
      error={only !== undefined && plan.tools?.failed === 1}
      iconName={plan.summary.iconName}
      prefix={plan.hiddenCount > 0 ? <Styled tone="marker">(+{plan.hiddenCount})</Styled> : null}
      isActive={plan.isActive}
      startedAt={plan.startedAt}
      durationMs={plan.durationMs}
      showTimer={plan.showTimer}
      tokensPerSecond={tokensPerSecond}
      expanded={ctx.expanded}
    >
      {blocks.map((block) => (
        <BlockRow key={block.id} block={block} ctx={ctx} />
      ))}
    </Row>
  )
}

export function MessageView({
  message: original,
  isActive = false,
  expanded = false,
  minimal = false,
  showFooter = true,
  bodyLines = 12,
  extensions,
  retryHint,
  activityPlacement,
  liveTail,
  liveFooter = false,
}: MessageViewProps) {
  const { glyphs } = useInkComponents()
  // Content is cleaned of terminal controls before anything (or a host's Markdown) draws it.
  const message = stripControlsDeep(original)
  const live = isActive && liveFooter
  const now = hooks.useElapsedTimer({ startedAt: 0, isActive: live, intervalMs: 1000 })
  const tokensPerSecond = hooks.useLiveTokensPerSecond({
    startedAt: message.createdAt,
    isActive,
    tokenCount: isActive ? approxTokenCount(message.blocks) : undefined,
    metrics: message.metrics,
  })
  const plan = planMessage(message, {
    isActive,
    minimal,
    showFooter,
    ...(activityPlacement ? { activityPlacement } : {}),
    ...(liveTail !== undefined && !expanded ? { liveTail } : {}),
  })
  const ctx: Ctx = {
    message,
    isActive,
    activeBlockId: plan.activeBlockId,
    startedAt: message.createdAt,
    durationMs: message.metrics?.durationMs,
    tokensPerSecond,
    expanded,
    bodyLines,
    extensions,
    outcome: message.outcome,
  }
  const showsSomething = message.blocks.length > 0 || message.outcome !== undefined
  const footerFacts =
    plan.showFooter || (live && showsSomething)
      ? planFooter(message, {
          isActive,
          detail: expanded ? 'details' : 'collapsed',
          ...(live ? { now } : {}),
        })
      : undefined
  const factGlyph: Partial<Record<string, string>> = {
    reasoning: glyphs.brain,
    plan: glyphs.checklist,
    tools: glyphs.wrench,
  }
  const footer = footerFacts
    ? [
        ...footerFacts.map((fact) =>
          factGlyph[fact.key] ? `${factGlyph[fact.key]} ${fact.text}` : fact.text,
        ),
        ...(message.outcome && retryHint ? [retryHint] : []),
      ].join(glyphs.separator) || undefined
    : undefined
  const isUser = message.role === 'user'
  const attachments = message.attachments ?? []

  return (
    <ink.Box flexDirection="column" marginBottom={1}>
      <ink.Box gap={1}>
        <Styled tone={isUser ? 'user' : 'assistant'}>
          {isUser ? glyphs.user : glyphs.assistant}
        </Styled>
        <ink.Box flexDirection="column" flexGrow={1}>
          {plan.rows.map((row) =>
            row.kind === 'pending' ? (
              <BlockRow
                key={row.id}
                block={{ type: 'status', id: row.id, phase: 'pre-stream' }}
                ctx={{ ...ctx, activeBlockId: row.id }}
              />
            ) : row.kind === 'bare' ? (
              <BlockRow key={row.block.id} block={row.block} ctx={ctx} />
            ) : row.kind === 'earlier' ? (
              <Styled key={row.key} tone="muted">
                {glyphs.earlier ? `${glyphs.earlier} ${earlierLabel(row)}` : earlierLabel(row)}
              </Styled>
            ) : row.kind === 'outcome' ? (
              <Styled key="outcome" tone="danger">
                {glyphs.error} {row.outcome.message}
              </Styled>
            ) : (
              <GroupRow key={row.key} blocks={row.blocks} ctx={ctx} />
            ),
          )}
          {attachments.map((a, i) => (
            <Styled key={`${a.url}-${i}`} tone="muted">
              [{a.kind}] {a.name ?? a.mediaType}
            </Styled>
          ))}
          {footer ? <Styled tone="muted">{footer}</Styled> : null}
        </ink.Box>
      </ink.Box>
    </ink.Box>
  )
}
