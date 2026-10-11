/**
 * Minimal / density-mode grouping pass.
 *
 * Where {@link groupBlocks} collapses only MAXIMAL runs of consecutive
 * auxiliary blocks (so a turn with text between two aux runs yields two
 * disclosures, and a single aux block renders bare), the minimal pass folds
 * ALL of a turn's auxiliary blocks into ONE disclosure regardless of position,
 * while every non-aux block renders bare in its original order. This is the
 * "density" view: one collapsed metadata line per turn, with the answer (and any
 * other custom/generative content) visible beneath it.
 *
 * Chronology is preserved: the single aux group is emitted at the index of the
 * FIRST auxiliary block, so it appears where the turn's metadata began rather
 * than always at the top or bottom.
 *
 * Divergences from {@link groupBlocks} (intentional):
 *  - A single auxiliary block still collapses into a one-item group (there is no
 *    "render a lone aux block bare" rule — minimal always folds aux to one line).
 *  - Non-adjacent aux blocks are folded into the SAME group.
 *
 * Pure: no React, no DOM. A single linear walk, fully unit-testable. Block
 * behavior (auxEligible) and header-summary selection are delegated to the
 * shared grouping policy so there is one source of truth.
 */
import type { RenderableBlock } from './extensions'
import type { GroupedItem, TimelineBehavior } from './grouping'
import { getBlockTimelineBehavior } from './grouping'

/**
 * Collapse ALL of a turn's `auxEligible` blocks into a single group, emitted at
 * the first aux block's position; every non-aux block renders bare in order.
 *
 * @param blocks The turn's flat block stream (may span consecutive steps).
 * @param overrides Optional per-kind / per-tool-name timeline-behavior overrides
 *   (same shape as {@link groupBlocks}), so host-opted custom kinds fold in.
 * @returns The grouped stream: bare items and AT MOST one aux group.
 */
export function collapseTurnAux(
  blocks: RenderableBlock[],
  overrides?: Record<string, Partial<TimelineBehavior>>,
): GroupedItem[] {
  const aux: RenderableBlock[] = []
  // The output slots in original order. The aux group occupies a single slot,
  // placed at the FIRST aux block's index; later aux blocks contribute no slot.
  const out: GroupedItem[] = []
  let auxSlot = -1

  for (const block of blocks) {
    if (getBlockTimelineBehavior(block, overrides).auxEligible) {
      if (auxSlot === -1) {
        // Reserve the slot for the single aux group at the first aux position.
        auxSlot = out.length
        out.push({ kind: 'group', blocks: aux })
      }
      aux.push(block)
    } else {
      out.push({ kind: 'bare', block })
    }
  }

  return out
}
