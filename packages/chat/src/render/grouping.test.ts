import { describe, expect, it } from 'vitest'
import type {
  ContentBlock,
  ReasoningBlock,
  StatusBlock,
  SystemBlock,
  TextBlock,
  ToolCallBlock,
} from '../model'
import { getTimelineBehavior, groupBlocks, selectHeaderSummary } from './grouping'

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
})
