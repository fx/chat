/**
 * Message layout into lines (see the ink-renderer layout spec). Pure: a
 * function of the message, a layout context and the next message. Structure
 * comes from core's render plan; every glyph, role and hint is injected.
 */
import {
  type ContentBlock,
  type CustomBlock,
  type DetailLevel,
  type PlanBlock,
  type PlannedRow,
  type RenderableBlock,
  type RenderableMessage,
  type ToolCallBlock,
  countActivity,
  earlierLabel,
  formatDuration,
  formatElapsed,
  formatTokensPerSecond,
  getBlockTimelineBehavior,
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
} from '@fx/chat-core'
import { layoutJson, looksLikeJson, parseLooseJson } from '@fx/chat-core/json'
import { stripControls, stripControlsDeep } from '../sanitize'
import type { InkAppearance, InkGlyphs, InkTheme, InkThemeRole } from '../theme'
import { type Measure, truncate, wrapLines } from './measure'
import { type Line, type LineTarget, type Span, span } from './model'

/** A line before its owner is assigned. */
export type LineDraft = Omit<Line, 'owner'> & { owner?: Line['owner'] }

/** Host labels for the keys that act on a message (empty by default). */
export interface FooterHints {
  /** Shown with an outcome, e.g. `^R again`. */
  retry?: string
  /** Collapsed with activity, e.g. `^T details`. */
  details?: string
  /** In details with tool output, e.g. `^T open all`. */
  openAll?: string
  /** In details or full, e.g. `Esc close`. */
  close?: string
}

/** Open state of foldable rows and JSON members, per block (or row key) and path. */
export interface OpenState {
  version: number
  isOpen(blockId: string, path: string): boolean
}

export const NOTHING_OPEN: OpenState = { version: 0, isOpen: () => false }

/** The path a collapsible row's open state is kept under. */
export const ROW_PATH = '#row'

/** A markdown layout: source → lines (owners are assigned by the caller). */
export type MarkdownLayout = (
  source: string,
  width: number,
  options: {
    streaming?: boolean
    measure: Measure
    glyphs: InkGlyphs
    /** Lays out a line that is only an image, when the host draws images. */
    image?: LayoutContext['image']
  },
) => LineDraft[]

/** The default markdown layout: plain text, wrapped, in the `content` role. */
export const plainMarkdownLayout: MarkdownLayout = (source, width, { measure }) =>
  wrapLines(source, width, measure).map((row) => ({
    spans: [span(row.text, { role: 'content' })],
    ...(row.wrap ? { wrap: row.wrap } : {}),
  }))

/** Context for a host's custom block layout. */
export interface BlockLayoutContext {
  width: number
  isLive: boolean
  measure: Measure
}

export interface LayoutContext {
  width: number
  detail: DetailLevel
  placement: 'inline' | 'after-content'
  /** Newest tool rows a collapsed live message shows (default 3). */
  liveTail: number
  isActive: (message: RenderableMessage) => boolean
  /** Whole-second clock for live facts and timers; only live messages read it. */
  now: number
  opened: OpenState
  markdown: MarkdownLayout
  glyphs: InkGlyphs
  theme: InkTheme
  hints: FooterHints
  /** Footer on a live message (default true in the viewport). */
  liveFooter: boolean
  blockLayouts?: Record<string, (block: CustomBlock, ctx: BlockLayoutContext) => LineDraft[]>
  frame: MessageFrame
  accentFor?: ((message: RenderableMessage) => InkThemeRole | InkAppearance) | undefined
  measure: Measure
  /** Lays out a block image line, when the host draws images. */
  image?: ((src: string, alt: string, width: number) => LineDraft[] | undefined) | undefined
  /** Host facts after a message's own footer facts (e.g. `turn 42` in details). */
  footerExtras?: ((message: RenderableMessage, detail: DetailLevel) => string[]) | undefined
  /**
   * A finished answer's activity when collapsed: its own rows (default), or
   * only the footer's counts (every activity row is dropped, in either
   * placement, when the answer has a footer).
   */
  finishedActivity?: 'row' | 'footer' | undefined
  /**
   * A blank decoration line between content and an adjacent activity row or
   * group (default true). Consecutive activity rows stay together.
   */
  activitySpacing?: boolean | undefined
}

/** What a frame needs to wrap a laid-out message. */
export interface FrameInput {
  message: RenderableMessage
  body: LineDraft[]
  /** Footer spans (facts and hints), when the message has a footer. */
  footer?: Span[]
  /** Whether this message shows anything. */
  shows: boolean
  /** Whether the next message (an answer) shows — a frame junction may hang from it. */
  nextShows: boolean
  live: boolean
  /** The message's accent as an explicit appearance. */
  accent: InkAppearance
  ctx: LayoutContext
}

/** A message frame: the injected look around a message. */
export interface MessageFrame {
  /** Stable id (part of the layout cache key). */
  id: string
  /** Width available to the message body inside the frame. */
  innerWidth(message: RenderableMessage, width: number): number
  layout(input: FrameInput): LineDraft[]
}

// ── helpers ──────────────────────────────────────────────────────────────────

const width = (spans: Span[], measure: Measure) =>
  spans.reduce((sum, s) => sum + measure(s.text), 0)

/** Resolve an accent to an explicit appearance. */
export function resolveAccent(
  message: RenderableMessage,
  ctx: Pick<LayoutContext, 'accentFor' | 'theme'>,
): InkAppearance {
  const accent = ctx.accentFor?.(message) ?? 'assistant'
  return typeof accent === 'string' ? ctx.theme[accent] : accent
}

function wrapped(
  text: string,
  w: number,
  measure: Measure,
  extra: Omit<Span, 'text'>,
): LineDraft[] {
  return wrapLines(text, w, measure).map((row) => ({
    spans: [span(row.text, extra)],
    ...(row.wrap ? { wrap: row.wrap } : {}),
  }))
}

function indent(lines: LineDraft[], cells: number): LineDraft[] {
  const pad = span(' '.repeat(cells), { chrome: true })
  return lines.map((line) => ({ ...line, spans: [pad, ...line.spans] }))
}

function owned(lines: LineDraft[], owner: Line['owner']): LineDraft[] {
  return lines.map((line) => (line.owner ? line : { ...line, owner }))
}

interface HeaderParts {
  affordance: Span
  prefix?: Span
  icon?: string
  label: string
  detail?: string | undefined
  qualifier?: Span | undefined
  trailing?: string | undefined
  error?: boolean
  target?: LineTarget
}

/** One header row, truncated to `w` (affordance, icon, qualifier and timer exempt). */
function headerRow(parts: HeaderParts, w: number, ctx: LayoutContext): LineDraft {
  const fixed: Span[] = [parts.affordance, span(' ')]
  if (parts.prefix) fixed.push(parts.prefix, span(' '))
  if (parts.icon) fixed.push(span(parts.icon, { role: 'marker' }), span(' '))
  const tail: Span[] = []
  if (parts.qualifier) tail.push(span(' '), parts.qualifier)
  if (parts.trailing) tail.push(span(` ${parts.trailing}`, { role: 'muted' }))
  const budget = Math.max(1, w - width(fixed, ctx.measure) - width(tail, ctx.measure))
  const label = parts.label.replace(/\s+/g, ' ').trim()
  const detail = parts.detail ? parts.detail.replace(/\s+/g, ' ').trim() : undefined
  const full = detail ? `${label} ${detail}` : label
  const cut = truncate(full, budget, ctx.measure)
  const labelPart = cut.slice(0, Math.min(label.length, cut.length))
  const detailPart = cut.slice(labelPart.length)
  const middle: Span[] = [span(labelPart, { role: parts.error ? 'danger' : 'strong' })]
  if (detailPart) middle.push(span(detailPart, { role: 'muted' }))
  return {
    spans: [...fixed, ...middle, ...tail],
    ...(parts.target ? { target: parts.target } : {}),
  }
}

function spinnerFrame(ctx: LayoutContext): string {
  const frames = ctx.glyphs.spinner
  return frames[Math.floor(ctx.now / 1000) % frames.length] ?? ''
}

function liveTimer(
  startedAt: number | undefined,
  durationMs: number | undefined,
  live: boolean,
  ctx: LayoutContext,
): string | undefined {
  if (durationMs !== undefined) return formatDuration(durationMs)
  if (live && startedAt !== undefined && Number.isFinite(startedAt)) {
    return formatElapsed(ctx.now - startedAt, { live: true })
  }
  return undefined
}

// ── blocks ───────────────────────────────────────────────────────────────────

interface BodyContext {
  message: RenderableMessage
  live: boolean
  activeBlockId?: string | undefined
  width: number
  ctx: LayoutContext
}

function toolGlyph(tool: ToolCallBlock, live: boolean, g: InkGlyphs): Span {
  if (tool.status === 'success') return span(g.toolSuccess, { role: 'positive', dim: true })
  if (tool.status === 'error') return span(g.toolError, { role: 'danger' })
  return span(live ? g.toolRunning : g.toolIdle, { role: 'caution' })
}

const APPROVAL: Record<string, [string, InkThemeRole] | undefined> = {
  denied: ['· denied', 'danger'],
  unavailable: ['· refused', 'danger'],
  pending: ['· awaiting approval', 'caution'],
}

function toolOutput(tool: ToolCallBlock, b: BodyContext): LineDraft[] {
  if (tool.result === undefined) return []
  const { ctx } = b
  const text = toolResultText(tool.result)
  const bar = span(`  ${ctx.glyphs.outputBar} `, { chrome: true, dim: true })
  const inner = Math.max(1, b.width - ctx.measure(bar.text))
  const target: LineTarget = { kind: 'tool-output', blockId: tool.id }
  let rows: LineDraft[]
  if (looksLikeJson(text)) {
    const parsed = parseLooseJson(text)
    const full = ctx.detail === 'full'
    const jsonRows = layoutJson(parsed.node, {
      ...(full ? {} : { maxString: 80 }),
      collapsed: (path) => !full && !ctx.opened.isOpen(tool.id, path),
    })
    rows = jsonRows.flatMap((row): LineDraft[] => {
      const pad = '  '.repeat(row.depth)
      if (row.toggle) {
        const marker = row.toggle.open ? ctx.glyphs.expanded : ctx.glyphs.collapsed
        // Toggles sit on array members (depth ≥ 1): the marker takes the last indent step.
        const lead = '  '.repeat(row.depth - 1)
        const markerSpan = span(`${marker} `, { role: 'link', chrome: true, copyEach: ' ' })
        const size = row.toggle.open ? '' : ` · ${row.toggle.size}`
        const available = Math.max(1, inner - ctx.measure(lead) - 2 - ctx.measure(size))
        return [
          {
            spans: [
              span(lead),
              markerSpan,
              span(truncate(row.text, available, ctx.measure), { role: 'content', dim: true }),
              ...(size ? [span(size, { chrome: true, dim: true })] : []),
            ],
            target: {
              kind: 'json-toggle',
              blockId: tool.id,
              path: row.toggle.path,
              open: row.toggle.open,
            },
          } satisfies LineDraft,
        ]
      }
      const pieces = wrapLines(row.text, Math.max(1, inner - ctx.measure(pad)), ctx.measure)
      return pieces.map((piece, i) => ({
        spans: [span(i === 0 ? pad : `${pad}  `), span(piece.text, { role: 'content', dim: true })],
        ...(piece.wrap ? { wrap: piece.wrap } : {}),
        target,
      }))
    })
    if (parsed.rest)
      rows.push(
        ...wrapped(parsed.rest, inner, ctx.measure, { role: 'content', dim: true }).map((r) => ({
          ...r,
          target,
        })),
      )
  } else {
    rows = wrapped(text, inner, ctx.measure, { role: 'content', dim: true }).map((r) => ({
      ...r,
      target,
    }))
  }
  return rows.map((row) => ({ ...row, spans: [bar, ...row.spans] }))
}

function toolRow(tool: ToolCallBlock, b: BodyContext): LineDraft[] {
  const live = isBlockActive(tool, { isActive: b.live, outcome: b.message.outcome })
  const approval = tool.approval ? APPROVAL[tool.approval.state] : undefined
  const row = headerRow(
    {
      affordance: toolGlyph(tool, live, b.ctx.glyphs),
      label: toolLabel(tool) || 'tool',
      detail: toolDisplayInput(tool),
      qualifier: approval ? span(approval[0], { role: approval[1] }) : undefined,
      error: tool.status === 'error',
      target: { kind: 'row-toggle', rowKey: tool.id },
    },
    b.width,
    b.ctx,
  )
  const showOutput = b.ctx.detail !== 'collapsed' || b.ctx.opened.isOpen(tool.id, ROW_PATH)
  return [row, ...(showOutput ? toolOutput(tool, b) : [])]
}

function planRows(plan: PlanBlock, b: BodyContext): LineDraft[] {
  const g = b.ctx.glyphs
  return plan.entries.flatMap((entry) => {
    const done = entry.status === 'completed'
    const active = entry.status === 'in_progress'
    const marker = done
      ? span(g.planDone, { role: 'positive', dim: true })
      : active
        ? span(g.planActive, { role: 'caution', ...(b.live ? {} : { dim: true }) })
        : span(g.planPending, { dim: true })
    const lead = b.ctx.measure(marker.text) + 1
    const rows = wrapLines(entry.content, Math.max(1, b.width - lead), b.ctx.measure)
    return rows.map((row, i) => ({
      spans: [
        i === 0 ? marker : span(' '.repeat(b.ctx.measure(marker.text)), { chrome: true }),
        span(' ', { chrome: true }),
        span(row.text, { role: 'content', ...(done ? { dim: true } : {}) }),
      ],
      ...(row.wrap ? { wrap: row.wrap } : {}),
    }))
  })
}

function blockLines(block: RenderableBlock, b: BodyContext): LineDraft[] {
  const { ctx } = b
  const live = isBlockActive(block, {
    isActive: b.live,
    activeBlockId: b.activeBlockId,
    outcome: b.message.outcome,
  })
  if (!isCoreBlockType(block.type)) {
    const custom = block as CustomBlock
    const layout = lookupExtension(ctx.blockLayouts, custom.type)
    if (layout) return layout(custom, { width: b.width, isLive: live, measure: ctx.measure })
    return [{ spans: [span(summarizeBlock(custom).label, { role: 'marker' })] }]
  }
  const core = block as ContentBlock
  switch (core.type) {
    case 'text':
      return b.message.role === 'user'
        ? wrapped(core.text, b.width, ctx.measure, { role: 'user' })
        : ctx.markdown(core.text, b.width, {
            ...(live ? { streaming: true } : {}),
            measure: ctx.measure,
            glyphs: ctx.glyphs,
            image: ctx.image,
          })
    case 'reasoning': {
      const summary = summarizeBlock(core, { isActive: live })
      const open = ctx.detail !== 'collapsed' || ctx.opened.isOpen(core.id, ROW_PATH)
      const header = headerRow(
        {
          affordance: live
            ? span(spinnerFrame(ctx), { role: 'marker' })
            : span(open ? ctx.glyphs.expanded : ctx.glyphs.collapsed, { role: 'marker' }),
          icon: ctx.glyphs.brain,
          label: summary.label,
          trailing: summary.showTimer
            ? liveTimer(
                positiveTimestamp(core.startedAt) ?? b.message.createdAt,
                core.durationMs,
                live,
                ctx,
              )
            : undefined,
          target: { kind: 'row-toggle', rowKey: core.id },
        },
        b.width,
        ctx,
      )
      const text = wrapped(core.text, Math.max(1, b.width - 2), ctx.measure, {
        role: 'muted',
        italic: true,
      })
      if (open) return [header, ...indent(text, 2)]
      // Collapsed and live: the last 3 lines of the thinking so far.
      return live ? [header, ...indent(text.slice(-3), 2)] : [header]
    }
    case 'tool_call':
      return toolRow(core, b)
    case 'plan': {
      const summary = summarizeBlock(core)
      const header = headerRow(
        { affordance: span(' '), icon: ctx.glyphs.checklist, label: summary.label },
        b.width,
        ctx,
      )
      return [header, ...indent(planRows(core, { ...b, width: Math.max(1, b.width - 2) }), 2)]
    }
    case 'status':
      return [
        headerRow(
          {
            affordance: live ? span(spinnerFrame(ctx), { role: 'marker' }) : span(' '),
            label: statusLabel(core.phase, live),
            trailing: liveTimer(
              b.message.createdAt,
              b.live ? undefined : b.message.metrics?.durationMs,
              live,
              ctx,
            ),
          },
          b.width,
          ctx,
        ),
      ]
    case 'system':
      return [
        headerRow(
          { affordance: span(' '), icon: ctx.glyphs.gear, label: 'System prompt' },
          b.width,
          ctx,
        ),
        ...(ctx.detail !== 'collapsed'
          ? indent(wrapped(core.text, Math.max(1, b.width - 2), ctx.measure, { role: 'muted' }), 2)
          : []),
      ]
  }
}

function groupLines(key: string, blocks: RenderableBlock[], b: BodyContext): LineDraft[] {
  const { ctx } = b
  const plan = planGroupHeader(blocks, {
    isActive: b.live,
    activeBlockId: b.activeBlockId,
    outcome: b.message.outcome,
    startedAt: b.message.createdAt,
    durationMs: b.message.metrics?.durationMs,
  })
  const open = ctx.detail !== 'collapsed' || ctx.opened.isOpen(key, ROW_PATH)
  const icon = plan.summary.iconName ? ctx.glyphs[plan.summary.iconName] : undefined
  const rate =
    plan.showRate && !b.live ? formatTokensPerSecond(b.message.metrics?.tokensPerSecond) : undefined
  const timer = plan.showTimer
    ? liveTimer(plan.startedAt, plan.durationMs, plan.isActive, ctx)
    : undefined
  const header = headerRow(
    {
      affordance: plan.isActive
        ? span(spinnerFrame(ctx), { role: 'marker' })
        : span(open ? ctx.glyphs.expanded : ctx.glyphs.collapsed, { role: 'marker' }),
      // A planned group holds two or more blocks, so it always hides some.
      prefix: span(`(+${plan.hiddenCount})`, { role: 'marker' }),
      ...(icon ? { icon } : {}),
      label: plan.summary.label,
      trailing: [timer, rate].filter(Boolean).join(' ') || undefined,
      target: { kind: 'row-toggle', rowKey: key },
    },
    b.width,
    ctx,
  )
  if (!open) return [header]
  const inner = { ...b, width: Math.max(1, b.width - 2) }
  return [
    header,
    ...indent(
      blocks.flatMap((block) => blockLines(block, inner)),
      2,
    ),
  ]
}

/** Which side of the content/activity boundary a planned row is on. */
function rowSide(row: PlannedRow): 'content' | 'activity' {
  if (row.kind === 'bare') {
    return getBlockTimelineBehavior(row.block).auxEligible ? 'activity' : 'content'
  }
  return row.kind === 'outcome' ? 'content' : 'activity'
}

/** Lay out a message's body (no frame) at `w` cells. */
export function layoutBody(
  original: RenderableMessage,
  w: number,
  ctx: LayoutContext,
): LineDraft[] {
  const live = ctx.isActive(original)
  // Content enters the line model here, cleaned before anything measures it.
  const message = stripControlsDeep(original)
  const plan = planMessage(message, {
    isActive: live,
    activityPlacement: ctx.placement,
    ...(live && ctx.detail === 'collapsed' ? { liveTail: ctx.liveTail } : {}),
    ...(ctx.detail === 'collapsed' && ctx.finishedActivity
      ? { finishedActivity: ctx.finishedActivity }
      : {}),
  })
  const b: BodyContext = { message, live, activeBlockId: plan.activeBlockId, width: w, ctx }
  const out: LineDraft[] = []
  const spacing = ctx.activitySpacing ?? true
  let lastWasText = false
  let lastSide: 'content' | 'activity' | undefined
  for (const row of plan.rows) {
    // Adjacent text blocks stay separate paragraphs (one blank decoration
    // line, always on), whether they were adjacent or the activity between
    // them is not shown.
    if (row.kind === 'bare' && row.block.type === 'text' && lastWasText) {
      out.push({ spans: [], frame: true })
    }
    lastWasText = row.kind === 'bare' && row.block.type === 'text'
    const side = rowSide(row)
    // Content and activity are set apart by a blank decoration line.
    if (spacing && lastSide !== undefined && side !== lastSide) out.push({ spans: [], frame: true })
    lastSide = side
    switch (row.kind) {
      case 'pending':
        out.push(
          ...blockLines(
            { type: 'status', id: row.id, phase: 'pre-stream' },
            { ...b, activeBlockId: row.id },
          ),
        )
        break
      case 'bare':
        out.push(
          ...owned(blockLines(row.block, b), { messageId: message.id, blockId: row.block.id }),
        )
        break
      case 'group':
        out.push(...groupLines(row.key, row.blocks, b))
        break
      case 'earlier':
        out.push({
          spans: [
            ...(ctx.glyphs.earlier
              ? [span(`${ctx.glyphs.earlier} `, { role: 'marker', chrome: true })]
              : []),
            span(earlierLabel(row), { role: 'muted' }),
          ],
        })
        break
      case 'outcome':
        out.push(
          ...wrapped(`${ctx.glyphs.error} ${row.outcome.message}`, w, ctx.measure, {
            role: 'danger',
          }),
        )
        break
    }
  }
  for (const attachment of message.attachments ?? []) {
    const label = attachment.description ?? attachment.name ?? attachment.mediaType
    out.push({
      spans: [
        span(`${ctx.glyphs.attachment} `, { role: 'link', chrome: true }),
        span(truncate(label, Math.max(1, w - 3), ctx.measure), { dim: true }),
      ],
    })
  }
  return out
}

/** The footer spans of a message: planned facts with injected glyphs, then hints. */
export function footerSpans(original: RenderableMessage, ctx: LayoutContext): Span[] | undefined {
  const live = ctx.isActive(original)
  const message = stripControlsDeep(original)
  const plan = planMessage(message, { isActive: live })
  const shows = showsSomething(message)
  if (!(plan.showFooter || (live && ctx.liveFooter && shows))) return undefined
  const facts = planFooter(message, { isActive: live, detail: ctx.detail, now: ctx.now })
  const glyph: Partial<Record<string, string>> = {
    reasoning: ctx.glyphs.brain,
    plan: ctx.glyphs.checklist,
    tools: ctx.glyphs.wrench,
  }
  const texts = facts.map((fact) =>
    glyph[fact.key] ? `${glyph[fact.key]} ${fact.text}` : fact.text,
  )
  texts.push(...(ctx.footerExtras?.(original, ctx.detail) ?? []))
  const counts = countActivity(message.blocks)
  const hasActivity =
    counts.reasoningChars > 0 || counts.tools.total > 0 || counts.plan !== undefined
  const hasOutput = message.blocks.some(
    (block) => block.type === 'tool_call' && (block as ToolCallBlock).result !== undefined,
  )
  const { hints } = ctx
  if (message.outcome && hints.retry) texts.push(hints.retry)
  if (ctx.detail === 'collapsed' && hasActivity && hints.details) texts.push(hints.details)
  if (ctx.detail === 'details' && hasOutput && hints.openAll) texts.push(hints.openAll)
  if (ctx.detail !== 'collapsed' && hints.close) texts.push(hints.close)
  if (texts.length === 0) return undefined
  return [span(stripControls(texts.join(ctx.glyphs.separator)), { role: 'muted', chrome: true })]
}

/** Whether an answer shows anything: content, reasoning, an outcome, a tool call or a plan. */
export function showsSomething(message: RenderableMessage): boolean {
  return message.outcome !== undefined || message.blocks.some((block) => block.type !== 'status')
}

/** Lay out one message inside its frame. */
export function layoutMessage(
  original: RenderableMessage,
  ctx: LayoutContext,
  next?: RenderableMessage,
): Line[] {
  const live = ctx.isActive(original)
  const message = stripControlsDeep(original)
  // Host callbacks see the message they were handed; the frame draws the clean one.
  const inner = ctx.frame.innerWidth(message, ctx.width)
  const footer = footerSpans(original, ctx)
  const drafts = ctx.frame.layout({
    message,
    body: layoutBody(original, inner, ctx),
    ...(footer ? { footer } : {}),
    shows: message.role !== 'assistant' || showsSomething(message),
    nextShows: next !== undefined && next.role === 'assistant' && showsSomething(next),
    live,
    accent: resolveAccent(original, ctx),
    ctx,
  })
  return owned(drafts, { messageId: original.id }) as Line[]
}
