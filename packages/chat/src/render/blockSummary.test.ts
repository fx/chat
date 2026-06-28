import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '../model'
import { summarizeBlock } from './blockSummary'
import type { RenderableBlock } from './extensions'

describe('summarizeBlock', () => {
  it('reasoning: brain icon + "Thinking…" while active, with showTimer', () => {
    const block: ContentBlock = { type: 'reasoning', id: 'r', text: 't' }
    expect(summarizeBlock(block, { isActive: true })).toEqual({
      iconName: 'brain',
      label: 'Thinking…',
      showTimer: true,
    })
  })

  it('reasoning: "Thought for <dur>" with its own durationMs when completed', () => {
    const block: ContentBlock = { type: 'reasoning', id: 'r', text: 't', durationMs: 1300 }
    expect(summarizeBlock(block)).toEqual({
      iconName: 'brain',
      label: 'Thought for 1.3s',
      durationMs: 1300,
      showTimer: true,
    })
  })

  it('reasoning: neutral "Reasoning" when idle with no duration', () => {
    const block: ContentBlock = { type: 'reasoning', id: 'r', text: 't' }
    expect(summarizeBlock(block)).toEqual({
      iconName: 'brain',
      label: 'Reasoning',
      showTimer: true,
    })
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
})
