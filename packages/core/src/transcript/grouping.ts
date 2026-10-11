/**
 * Timeline-behavior registry and the pure auxiliary-block grouping pass.
 *
 * This module is the SINGLE SOURCE OF TRUTH for which block kinds fold into a
 * collapsed disclosure and which can surface as the disclosure's header summary.
 * Renderers MUST consult {@link getTimelineBehavior} rather than branching on
 * block kind with ad-hoc conditionals.
 *
 * Pure: no React, no DOM. The grouping pass is a single linear walk over a
 * flattened block stream, so it is fully unit-testable without rendering.
 */
import type { ContentBlock } from '../model'
import type { RenderableBlock } from './extensions'
import { NON_AUX_BEHAVIOR, isCoreBlockType, lookupExtension } from './extensions'

/** Per-kind timeline behavior flags. */
export interface TimelineBehavior {
  /** Folds into an adjacent run of auxiliary (metadata) blocks. */
  auxEligible: boolean
  /** May become the collapsed header's visible summary chip / counted in `+N`. */
  eligibleForHeaderSummary: boolean
}

/**
 * Behavior registry keyed by `ContentBlock['type']`. Reasoning, tool_call, and
 * status are auxiliary; reasoning and tool_call may head a summary; status is
 * auxiliary but never a header summary (its live timer surfaces via the
 * trailing-active rule instead). Text and system are never auxiliary.
 */
const BEHAVIOR: Record<ContentBlock['type'], TimelineBehavior> = {
  reasoning: { auxEligible: true, eligibleForHeaderSummary: true },
  tool_call: { auxEligible: true, eligibleForHeaderSummary: true },
  plan: { auxEligible: true, eligibleForHeaderSummary: true },
  status: { auxEligible: true, eligibleForHeaderSummary: false },
  text: { auxEligible: false, eligibleForHeaderSummary: false },
  system: { auxEligible: false, eligibleForHeaderSummary: false },
}

/**
 * Returns the {@link TimelineBehavior} for a block kind. Pure and total.
 *
 * For a CORE kind, returns the built-in policy, optionally overridden by a
 * host-supplied entry (e.g. a host overriding a tool's grouping). For a CUSTOM
 * (non-core) kind, the host-supplied entry — when present — fills in its flags
 * over the safe default (non-aux, not header-eligible), so an unknown block never
 * folds silently into a collapsed disclosure unless the host opts in.
 */
export function getTimelineBehavior(
  kind: string,
  overrides?: Record<string, Partial<TimelineBehavior>>,
): TimelineBehavior {
  // `isCoreBlockType` is a Set membership check (own keys only), so a custom kind
  // named like an inherited Object member (e.g. `constructor`, `toString`) does
  // NOT resolve to a prototype function — it correctly gets the non-aux default.
  const base: TimelineBehavior = isCoreBlockType(kind) ? BEHAVIOR[kind] : NON_AUX_BEHAVIOR
  const override = lookupExtension(overrides, kind)
  if (!override) return base
  return {
    auxEligible: override.auxEligible ?? base.auxEligible,
    eligibleForHeaderSummary: override.eligibleForHeaderSummary ?? base.eligibleForHeaderSummary,
  }
}

/**
 * Resolve the {@link TimelineBehavior} for a concrete block, honoring per-tool
 * overrides. For a `tool_call`, a host override keyed by the tool `name` wins (so
 * one tool's grouping can change WITHOUT affecting every `tool_call`); when no
 * name-keyed override exists, it falls back to the `tool_call` type behavior. For
 * any other block, this is the type-keyed {@link getTimelineBehavior}.
 */
export function getBlockTimelineBehavior(
  block: RenderableBlock,
  overrides?: Record<string, Partial<TimelineBehavior>>,
): TimelineBehavior {
  if (block.type === 'tool_call') {
    const name = (block as Extract<ContentBlock, { type: 'tool_call' }>).name
    // A name-keyed override is resolved over the `tool_call` base policy so a
    // partial `{ auxEligible }` keeps the inherited header-eligibility. Own-prop
    // lookup avoids matching inherited members for a tool literally named e.g.
    // `constructor`.
    const override = lookupExtension(overrides, name)
    if (override) {
      const base = getTimelineBehavior('tool_call')
      return {
        auxEligible: override.auxEligible ?? base.auxEligible,
        eligibleForHeaderSummary:
          override.eligibleForHeaderSummary ?? base.eligibleForHeaderSummary,
      }
    }
  }
  return getTimelineBehavior(block.type, overrides)
}

/** A bare (ungrouped) item in the grouped output. */
export interface BareItem {
  kind: 'bare'
  block: RenderableBlock
}

/** A collapsed run of consecutive auxiliary blocks. */
export interface GroupItem {
  kind: 'group'
  /** The auxiliary blocks folded under one disclosure, in order. */
  blocks: RenderableBlock[]
}

/** One entry in the grouped stream: a bare block or a collapsed group. */
export type GroupedItem = BareItem | GroupItem

/**
 * Collapse maximal runs of consecutive `auxEligible` blocks into single groups.
 * Non-aux blocks render bare and break runs. A single-item run renders bare
 * (no pointless one-item disclosure).
 *
 * The input is a flat block stream that MAY span multiple consecutive internal
 * assistant steps — the caller flattens those into one array, and this pass
 * folds an aux run that crosses step boundaries into one disclosure.
 */
export function groupBlocks(
  blocks: RenderableBlock[],
  overrides?: Record<string, Partial<TimelineBehavior>>,
): GroupedItem[] {
  const out: GroupedItem[] = []
  let run: RenderableBlock[] = []

  const flush = () => {
    if (run.length === 0) return
    if (run.length === 1) {
      out.push({ kind: 'bare', block: run[0] as RenderableBlock })
    } else {
      out.push({ kind: 'group', blocks: run })
    }
    run = []
  }

  for (const block of blocks) {
    if (getBlockTimelineBehavior(block, overrides).auxEligible) {
      run.push(block)
    } else {
      flush()
      out.push({ kind: 'bare', block })
    }
  }
  flush()
  return out
}

/**
 * The header-summary selection for a collapsed group: the chosen block plus the
 * number of remaining (hidden) blocks for a `+N` badge.
 */
export interface HeaderSummary {
  /** The block whose label heads the collapsed disclosure. */
  block: RenderableBlock
  /** Count of the other blocks in the group (the `+N` badge value). */
  hiddenCount: number
}

/**
 * Select a group's header summary block:
 * 1. a trailing active-but-header-ineligible status row (to keep its LIVE timer
 *    visible) — but ONLY when that trailing block is currently active; else
 * 2. the latest header-eligible block; else
 * 3. the trailing block.
 *
 * `trailingActive` reflects whether the run's last block is the live/streaming
 * one. A completed run ending in a status therefore surfaces the latest
 * tool/reasoning summary instead of a generic "Status" label.
 *
 * `hiddenCount` is always `blocks.length - 1`. The group is guaranteed
 * non-empty by construction (groups only exist for runs of length ≥ 2).
 */
export function selectHeaderSummary(
  blocks: RenderableBlock[],
  trailingActive = false,
  overrides?: Record<string, Partial<TimelineBehavior>>,
): HeaderSummary {
  const last = blocks[blocks.length - 1] as RenderableBlock
  const lastBehavior = getBlockTimelineBehavior(last, overrides)
  let chosen: RenderableBlock
  if (trailingActive && lastBehavior.auxEligible && !lastBehavior.eligibleForHeaderSummary) {
    // Trailing ACTIVE header-ineligible item (the live status row) wins so its
    // timer stays visible on the collapsed header.
    chosen = last
  } else {
    // Latest header-eligible block, else fall back to the trailing block.
    let headerEligible: RenderableBlock | undefined
    for (const block of blocks) {
      if (getBlockTimelineBehavior(block, overrides).eligibleForHeaderSummary)
        headerEligible = block
    }
    chosen = headerEligible ?? last
  }
  return { block: chosen, hiddenCount: blocks.length - 1 }
}
