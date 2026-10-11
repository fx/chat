import { describe, expect, it } from 'vitest'
import type { ReasoningBlock, StatusBlock, TextBlock, ToolCallBlock } from '../model'
import { collapseTurnAux } from './minimalGrouping'

const text = (id: string): TextBlock => ({ type: 'text', id, text: id })
const reasoning = (id: string): ReasoningBlock => ({ type: 'reasoning', id, text: id })
const tool = (id: string, name = id): ToolCallBlock => ({
  type: 'tool_call',
  id,
  name,
  arguments: {},
  status: 'success',
})
const status = (id: string): StatusBlock => ({ type: 'status', id })

describe('collapseTurnAux', () => {
  it('returns an empty array for no blocks', () => {
    expect(collapseTurnAux([])).toEqual([])
  })

  it('folds all aux blocks into one group at the first aux position', () => {
    const blocks = [reasoning('r'), tool('t1'), tool('t2'), status('s')]
    expect(collapseTurnAux(blocks)).toEqual([{ kind: 'group', blocks }])
  })

  it('folds a SINGLE aux block into a one-item group (diverges from groupBlocks)', () => {
    // groupBlocks renders a lone aux block bare; minimal always folds aux to one
    // line, so a single aux block becomes a one-item group.
    expect(collapseTurnAux([reasoning('r')])).toEqual([{ kind: 'group', blocks: [reasoning('r')] }])
  })

  it('renders a zero-aux stream all bare in order', () => {
    const blocks = [text('a'), text('b')]
    expect(collapseTurnAux(blocks)).toEqual([
      { kind: 'bare', block: text('a') },
      { kind: 'bare', block: text('b') },
    ])
  })

  it('emits the aux group at the first aux index with the bare answer after it', () => {
    // reasoning + tool fold into one group at index 0; the answer text renders
    // bare in its original position after the group.
    const blocks = [reasoning('r'), tool('t'), text('answer')]
    expect(collapseTurnAux(blocks)).toEqual([
      { kind: 'group', blocks: [reasoning('r'), tool('t')] },
      { kind: 'bare', block: text('answer') },
    ])
  })

  it('preserves the position of a non-aux block that precedes the first aux block', () => {
    // A leading bare text keeps slot 0; the aux group is emitted at the FIRST aux
    // block's index (after the text), and a trailing bare text follows.
    const blocks = [text('intro'), reasoning('r'), text('outro')]
    expect(collapseTurnAux(blocks)).toEqual([
      { kind: 'bare', block: text('intro') },
      { kind: 'group', blocks: [reasoning('r')] },
      { kind: 'bare', block: text('outro') },
    ])
  })

  it('folds NON-ADJACENT aux blocks into the SAME single group (minimal divergence)', () => {
    // Two aux blocks separated by a bare text would be two runs under groupBlocks;
    // minimal folds both into ONE group placed at the first aux index.
    const blocks = [reasoning('r'), text('mid'), tool('t')]
    expect(collapseTurnAux(blocks)).toEqual([
      { kind: 'group', blocks: [reasoning('r'), tool('t')] },
      { kind: 'bare', block: text('mid') },
    ])
  })

  it('keeps a custom non-aux block bare and ordered after the group', () => {
    const marker = { type: 'host_marker', id: 'm' }
    const blocks = [reasoning('r'), marker]
    // The custom kind defaults to non-aux: it renders bare after the aux group.
    expect(collapseTurnAux(blocks)).toEqual([
      { kind: 'group', blocks: [reasoning('r')] },
      { kind: 'bare', block: marker },
    ])
  })

  it('folds a host-opted auxEligible custom kind into the group', () => {
    const marker = { type: 'host_marker', id: 'm' }
    const blocks = [reasoning('r'), marker, tool('t')]
    const result = collapseTurnAux(blocks, { host_marker: { auxEligible: true } })
    expect(result).toEqual([{ kind: 'group', blocks: [reasoning('r'), marker, tool('t')] }])
  })

  it('honors a per-tool-NAME non-aux override (keeps that tool bare)', () => {
    const blocks = [reasoning('r'), tool('t1', 'render_ui'), tool('t2', 'search')]
    // render_ui demoted to non-aux renders bare; reasoning + search fold together.
    const result = collapseTurnAux(blocks, { render_ui: { auxEligible: false } })
    expect(result).toEqual([
      { kind: 'group', blocks: [reasoning('r'), tool('t2', 'search')] },
      { kind: 'bare', block: tool('t1', 'render_ui') },
    ])
  })
})
