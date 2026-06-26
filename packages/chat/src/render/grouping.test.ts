import { describe, expect, it } from 'vitest'
import type {
  ContentBlock,
  ReasoningBlock,
  StatusBlock,
  SystemBlock,
  TextBlock,
  ToolCallBlock,
} from '../model'
import {
  getBlockTimelineBehavior,
  getTimelineBehavior,
  groupBlocks,
  selectHeaderSummary,
} from './grouping'

const text = (id: string): TextBlock => ({ type: 'text', id, text: id })
const reasoning = (id: string, durationMs?: number): ReasoningBlock => ({
  type: 'reasoning',
  id,
  text: id,
  ...(durationMs !== undefined ? { durationMs } : {}),
})
const tool = (id: string, name = id): ToolCallBlock => ({
  type: 'tool_call',
  id,
  name,
  arguments: {},
  status: 'success',
})
const status = (id: string): StatusBlock => ({ type: 'status', id })
const system = (id: string): SystemBlock => ({ type: 'system', id, text: id })

describe('getTimelineBehavior', () => {
  it('marks reasoning/tool_call as aux + header-eligible', () => {
    expect(getTimelineBehavior('reasoning')).toEqual({
      auxEligible: true,
      eligibleForHeaderSummary: true,
    })
    expect(getTimelineBehavior('tool_call')).toEqual({
      auxEligible: true,
      eligibleForHeaderSummary: true,
    })
  })

  it('marks status as aux but NOT header-eligible', () => {
    expect(getTimelineBehavior('status')).toEqual({
      auxEligible: true,
      eligibleForHeaderSummary: false,
    })
  })

  it('marks text/system as non-aux', () => {
    expect(getTimelineBehavior('text').auxEligible).toBe(false)
    expect(getTimelineBehavior('system').auxEligible).toBe(false)
  })

  it('defaults an unknown (custom) kind to non-aux, not header-eligible', () => {
    expect(getTimelineBehavior('host_marker')).toEqual({
      auxEligible: false,
      eligibleForHeaderSummary: false,
    })
  })

  it('applies a host override over the custom-kind default (partial flags fill in)', () => {
    expect(getTimelineBehavior('host_marker', { host_marker: { auxEligible: true } })).toEqual({
      auxEligible: true,
      eligibleForHeaderSummary: false,
    })
    expect(
      getTimelineBehavior('host_marker', {
        host_marker: { auxEligible: true, eligibleForHeaderSummary: true },
      }),
    ).toEqual({ auxEligible: true, eligibleForHeaderSummary: true })
  })

  it('fills in only the supplied flag, keeping the base for the other', () => {
    // Override supplies ONLY eligibleForHeaderSummary → auxEligible falls back to
    // the base (custom default false), exercising the `?? base` on auxEligible.
    expect(
      getTimelineBehavior('host_marker', { host_marker: { eligibleForHeaderSummary: true } }),
    ).toEqual({ auxEligible: false, eligibleForHeaderSummary: true })
  })

  it('applies a host override over a CORE kind (e.g. demote a tool to non-aux)', () => {
    expect(getTimelineBehavior('tool_call', { tool_call: { auxEligible: false } })).toEqual({
      auxEligible: false,
      eligibleForHeaderSummary: true,
    })
  })

  it('ignores an overrides map with no entry for the kind', () => {
    expect(getTimelineBehavior('reasoning', { other: { auxEligible: false } })).toEqual({
      auxEligible: true,
      eligibleForHeaderSummary: true,
    })
  })

  it('defaults a custom kind named like an Object.prototype member to non-aux', () => {
    // `constructor`/`toString` are on Object.prototype; the base policy must come
    // from an own-membership check, not the `in` operator — so these resolve to
    // the safe non-aux default, never a prototype function.
    expect(getTimelineBehavior('constructor')).toEqual({
      auxEligible: false,
      eligibleForHeaderSummary: false,
    })
    expect(getTimelineBehavior('toString')).toEqual({
      auxEligible: false,
      eligibleForHeaderSummary: false,
    })
    // A partial override for such a kind fills missing flags from the safe
    // default, not from `undefined`.
    expect(getTimelineBehavior('constructor', { constructor: { auxEligible: true } })).toEqual({
      auxEligible: true,
      eligibleForHeaderSummary: false,
    })
  })
})

describe('getBlockTimelineBehavior', () => {
  it('falls back to type behavior for a non-tool block', () => {
    expect(getBlockTimelineBehavior(reasoning('r'))).toEqual({
      auxEligible: true,
      eligibleForHeaderSummary: true,
    })
  })

  it('applies a per-tool-NAME override over the tool_call base (partial keeps header-eligible)', () => {
    // `{ search: { auxEligible: false } }` demotes ONLY the `search` tool to
    // non-aux while keeping inherited header-eligibility, and without affecting
    // other tools.
    expect(
      getBlockTimelineBehavior(tool('t', 'search'), { search: { auxEligible: false } }),
    ).toEqual({ auxEligible: false, eligibleForHeaderSummary: true })
    // A different tool name is unaffected → inherits the tool_call base policy.
    expect(
      getBlockTimelineBehavior(tool('t2', 'other'), { search: { auxEligible: false } }),
    ).toEqual({ auxEligible: true, eligibleForHeaderSummary: true })
  })

  it('fills in only the supplied name-override flag, inheriting the rest from tool_call', () => {
    // Override supplies ONLY eligibleForHeaderSummary → auxEligible falls back to
    // the tool_call base (true), exercising the `?? base.auxEligible` arm.
    expect(
      getBlockTimelineBehavior(tool('t', 'search'), {
        search: { eligibleForHeaderSummary: false },
      }),
    ).toEqual({ auxEligible: true, eligibleForHeaderSummary: false })
  })

  it('prefers a name-keyed override over a type-keyed one for a tool_call', () => {
    const overrides = {
      tool_call: { auxEligible: false },
      search: { auxEligible: true, eligibleForHeaderSummary: false },
    }
    // The `search` name override wins over the `tool_call` type override.
    expect(getBlockTimelineBehavior(tool('t', 'search'), overrides)).toEqual({
      auxEligible: true,
      eligibleForHeaderSummary: false,
    })
  })

  it('uses the type-keyed override for a tool whose name is not in the map', () => {
    expect(
      getBlockTimelineBehavior(tool('t', 'search'), { tool_call: { auxEligible: false } }),
    ).toEqual({ auxEligible: false, eligibleForHeaderSummary: true })
  })

  it('returns the tool_call base when no overrides are supplied', () => {
    expect(getBlockTimelineBehavior(tool('t', 'search'))).toEqual({
      auxEligible: true,
      eligibleForHeaderSummary: true,
    })
  })

  it('does not match an Object.prototype member for a tool named like one', () => {
    // A tool named `constructor` with an empty overrides map must inherit the
    // tool_call base, NOT an inherited prototype member.
    expect(getBlockTimelineBehavior(tool('t', 'constructor'), {})).toEqual({
      auxEligible: true,
      eligibleForHeaderSummary: true,
    })
  })
})

describe('groupBlocks', () => {
  it('renders a single-item aux run bare', () => {
    const result = groupBlocks([reasoning('r1')])
    expect(result).toEqual([{ kind: 'bare', block: reasoning('r1') }])
  })

  it('collapses a maximal run of aux blocks into one group', () => {
    const blocks: ContentBlock[] = [reasoning('r'), tool('t1'), tool('t2'), status('s')]
    const result = groupBlocks(blocks)
    expect(result).toEqual([{ kind: 'group', blocks }])
  })

  it('renders non-aux blocks bare and breaks runs', () => {
    const blocks: ContentBlock[] = [reasoning('r'), tool('t1'), status('s'), text('a'), tool('t2')]
    const result = groupBlocks(blocks)
    expect(result).toEqual([
      { kind: 'group', blocks: [reasoning('r'), tool('t1'), status('s')] },
      { kind: 'bare', block: text('a') },
      { kind: 'bare', block: tool('t2') },
    ])
  })

  it('renders an all-bare stream with no groups', () => {
    const blocks: ContentBlock[] = [text('a'), system('s'), text('b')]
    const result = groupBlocks(blocks)
    expect(result).toEqual([
      { kind: 'bare', block: text('a') },
      { kind: 'bare', block: system('s') },
      { kind: 'bare', block: text('b') },
    ])
  })

  it('returns an empty array for no blocks', () => {
    expect(groupBlocks([])).toEqual([])
  })

  it('treats a custom block as non-aux by default (breaks aux runs, renders bare)', () => {
    const marker = { type: 'host_marker', id: 'm' }
    const blocks = [reasoning('r'), marker, tool('t')]
    // The custom marker breaks the aux run: reasoning and tool become two
    // separate single-item bare runs, with the marker bare between them.
    expect(groupBlocks(blocks)).toEqual([
      { kind: 'bare', block: reasoning('r') },
      { kind: 'bare', block: marker },
      { kind: 'bare', block: tool('t') },
    ])
  })

  it('folds a custom block into an aux run when the host opts it in', () => {
    const marker = { type: 'host_marker', id: 'm' }
    const blocks = [reasoning('r'), marker, tool('t')]
    const result = groupBlocks(blocks, { host_marker: { auxEligible: true } })
    expect(result).toEqual([{ kind: 'group', blocks }])
  })

  it('breaks a run on a per-tool-NAME non-aux override without affecting other tools', () => {
    const blocks = [reasoning('r'), tool('t1', 'render_ui'), tool('t2', 'search')]
    // `render_ui` is demoted to non-aux; `search` stays aux. The render_ui tool
    // renders bare and breaks the run; reasoning is now a single-item bare run.
    const result = groupBlocks(blocks, { render_ui: { auxEligible: false } })
    expect(result).toEqual([
      { kind: 'bare', block: reasoning('r') },
      { kind: 'bare', block: tool('t1', 'render_ui') },
      { kind: 'bare', block: tool('t2', 'search') },
    ])
  })
})

describe('selectHeaderSummary', () => {
  it('surfaces a trailing ACTIVE header-ineligible status (live row)', () => {
    const blocks: ContentBlock[] = [reasoning('r'), tool('t'), status('s')]
    expect(selectHeaderSummary(blocks, true)).toEqual({ block: status('s'), hiddenCount: 2 })
  })

  it('does NOT surface a trailing status when it is not active (completed run)', () => {
    // Completed run ending in status → latest header-eligible (the tool) wins.
    const blocks: ContentBlock[] = [reasoning('r'), tool('t'), status('s')]
    expect(selectHeaderSummary(blocks)).toEqual({ block: tool('t'), hiddenCount: 2 })
  })

  it('selects the latest header-eligible block when the run does not end in status', () => {
    const blocks: ContentBlock[] = [reasoning('r'), tool('t1'), tool('t2')]
    expect(selectHeaderSummary(blocks)).toEqual({ block: tool('t2'), hiddenCount: 2 })
  })

  it('falls back to the trailing block when none are header-eligible', () => {
    // A run of two status blocks: neither is header-eligible, last is status →
    // first branch (trailing aux + not header-eligible) chooses the last status.
    const blocks: ContentBlock[] = [status('s1'), status('s2')]
    expect(selectHeaderSummary(blocks)).toEqual({ block: status('s2'), hiddenCount: 1 })
  })

  it('falls back to the trailing block when the last is header-eligible but none earlier', () => {
    // Run ends in a header-eligible tool; the else-branch loop picks it.
    const blocks: ContentBlock[] = [reasoning('r'), tool('t')]
    expect(selectHeaderSummary(blocks)).toEqual({ block: tool('t'), hiddenCount: 1 })
  })

  it('falls back to the trailing block when no block is header-eligible (public direct call)', () => {
    // Non-aux blocks never reach selection via the grouping pass, but the
    // function is public: with no header-eligible block and a non-status tail,
    // the else-branch `headerEligible ?? last` fallback selects the trailing
    // block.
    const blocks: ContentBlock[] = [text('a'), text('b')]
    expect(selectHeaderSummary(blocks)).toEqual({ block: text('b'), hiddenCount: 1 })
  })

  it('honors host overrides making a custom kind header-eligible', () => {
    const marker = { type: 'host_marker', id: 'm' }
    const blocks = [reasoning('r'), marker]
    // With the marker opted into header eligibility, it (the latest eligible)
    // heads the summary over the reasoning.
    expect(
      selectHeaderSummary(blocks, false, {
        host_marker: { auxEligible: true, eligibleForHeaderSummary: true },
      }),
    ).toEqual({ block: marker, hiddenCount: 1 })
  })
})
