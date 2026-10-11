import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '../model'
import { summarizeBlock } from './blockSummary'
import type { RenderableBlock } from './extensions'

describe('summarizeBlock', () => {
  it('reasoning: brain icon + "Thinking…" while active, WITH a live timer pill', () => {
    const block: ContentBlock = { type: 'reasoning', id: 'r', text: 't' }
    expect(summarizeBlock(block, { isActive: true })).toEqual({
      iconName: 'brain',
      label: 'Thinking…',
      // Live timer pill: the "Thinking…" label carries no duration, so the
      // ticking pill surfaces the elapsed time while reasoning streams.
      showTimer: true,
    })
  })

  it('reasoning: "Thought for <dur>" carries durationMs but NO timer pill', () => {
    const block: ContentBlock = { type: 'reasoning', id: 'r', text: 't', durationMs: 1300 }
    expect(summarizeBlock(block, { isActive: false })).toEqual({
      iconName: 'brain',
      label: 'Thought for 1.3s',
      durationMs: 1300,
      // durationMs is carried (callers may use it for the label/tooltip), but
      // showTimer is false: the "1.3s" already lives in the label.
      showTimer: false,
    })
  })

  it('reasoning: a known durationMs means FINISHED even when isActive is passed', () => {
    // summarizeBlock owns the durationMs gate (single source of truth): a
    // public caller passing a stale isActive with a finalized block still gets
    // the finished label and NO live pill.
    const block: ContentBlock = { type: 'reasoning', id: 'r', text: 't', durationMs: 1300 }
    expect(summarizeBlock(block, { isActive: true })).toEqual({
      iconName: 'brain',
      label: 'Thought for 1.3s',
      durationMs: 1300,
      showTimer: false,
    })
  })

  it('reasoning: neutral "Reasoning" when idle with no duration, no timer pill', () => {
    const block: ContentBlock = { type: 'reasoning', id: 'r', text: 't' }
    expect(summarizeBlock(block)).toEqual({
      iconName: 'brain',
      label: 'Reasoning',
      showTimer: false,
    })
  })

  it('reasoning: an OMITTED context defaults to inactive (pins the isActive === true gate)', () => {
    const block: ContentBlock = { type: 'reasoning', id: 'r', text: 't' }
    // No context arg at all, and an empty context object: both read inactive.
    expect(summarizeBlock(block).showTimer).toBe(false)
    expect(summarizeBlock(block).label).toBe('Reasoning')
    expect(summarizeBlock(block, {}).showTimer).toBe(false)
    expect(summarizeBlock(block, {}).label).toBe('Reasoning')
  })

  it('tool_call: wrench icon + tool name + block duration', () => {
    const block: ContentBlock = {
      type: 'tool_call',
      id: 't',
      name: 'search',
      arguments: {},
      status: 'success',
      durationMs: 2000,
    }
    expect(summarizeBlock(block)).toEqual({
      iconName: 'wrench',
      label: 'search',
      durationMs: 2000,
      // A tool row shows its time (duration, or live elapsed while running).
      showTimer: true,
    })
  })

  it('tool_call: omits durationMs when the block carries none', () => {
    const block: ContentBlock = {
      type: 'tool_call',
      id: 't',
      name: 'fetch',
      arguments: {},
      status: 'success',
    }
    expect(summarizeBlock(block)).toEqual({ iconName: 'wrench', label: 'fetch', showTimer: true })
  })

  it('system: gear icon + "System prompt", no timer', () => {
    const block: ContentBlock = { type: 'system', id: 's', text: 'x' }
    expect(summarizeBlock(block)).toEqual({
      iconName: 'gear',
      label: 'System prompt',
      showTimer: false,
    })
  })

  it('status: "Status" label, no icon, no timer', () => {
    const block: ContentBlock = { type: 'status', id: 's' }
    expect(summarizeBlock(block)).toEqual({ label: 'Status', showTimer: false })
  })

  it('text: "Text" label, no icon, no timer', () => {
    const block: ContentBlock = { type: 'text', id: 't', text: 'hi' }
    expect(summarizeBlock(block)).toEqual({ label: 'Text', showTimer: false })
  })

  it('custom (host-defined) kind: labels by its type, no icon, no timer', () => {
    const block = { type: 'custom_widget', id: 'c' } as unknown as RenderableBlock
    expect(summarizeBlock(block)).toEqual({ label: 'custom_widget', showTimer: false })
  })

  it('custom kind: prefers a host-supplied non-blank `label` over the raw type', () => {
    const block = { type: 'job-status', id: 'c', label: 'Job status' } as unknown as RenderableBlock
    expect(summarizeBlock(block)).toEqual({ label: 'Job status', showTimer: false })
  })

  it('custom kind: a PADDED `label` is trimmed before use', () => {
    const block = {
      type: 'job-status',
      id: 'c',
      label: '  Job status  ',
    } as unknown as RenderableBlock
    expect(summarizeBlock(block)).toEqual({ label: 'Job status', showTimer: false })
  })

  it('custom kind: an EMPTY-STRING `label` falls back to the type', () => {
    const block = { type: 'job-status', id: 'c', label: '' } as unknown as RenderableBlock
    expect(summarizeBlock(block)).toEqual({ label: 'job-status', showTimer: false })
  })

  it('custom kind: a WHITESPACE-ONLY `label` falls back to the type', () => {
    const block = { type: 'job-status', id: 'c', label: '  \t ' } as unknown as RenderableBlock
    expect(summarizeBlock(block)).toEqual({ label: 'job-status', showTimer: false })
  })

  it('custom kind: a NON-STRING `label` falls back to the type', () => {
    const block = { type: 'job-status', id: 'c', label: 42 } as unknown as RenderableBlock
    expect(summarizeBlock(block)).toEqual({ label: 'job-status', showTimer: false })
  })
})
