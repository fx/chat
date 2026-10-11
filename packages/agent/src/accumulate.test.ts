// @vitest-environment node
import type { ToolCallBlock } from '@fx/chat-core'
import { describe, expect, it } from 'vitest'
import {
  AGENT_META_KEY,
  type TurnState,
  applyEvent,
  beginStep,
  createTurn,
  endStep,
  finalizeTurn,
  readAgentMeta,
  updateToolCall,
} from './accumulate'
import type { StreamEvent } from './types'

function feed(state: TurnState, events: Array<[StreamEvent, number]>): TurnState {
  return events.reduce((s, [e, t]) => applyEvent(s, e, t), state)
}

const start = () => beginStep(createTurn('t', 1000, 'req-model'))

describe('accumulator', () => {
  it('creates an empty assistant turn with bookkeeping', () => {
    const state = createTurn('t', 1000, 'req')
    expect(state.message).toEqual({
      id: 't',
      role: 'assistant',
      blocks: [],
      createdAt: 1000,
      metrics: { requestModel: 'req' },
      meta: { [AGENT_META_KEY]: { steps: [] } },
    })
    expect(readAgentMeta(beginStep(state).message)).toEqual({ steps: [{ start: 0 }] })
  })

  it('readAgentMeta ignores absent or malformed bookkeeping', () => {
    const { message } = createTurn('t', 0, 'm')
    expect(readAgentMeta({ ...message, meta: undefined as never })).toBeUndefined()
    expect(readAgentMeta({ ...message, meta: { [AGENT_META_KEY]: { steps: 1 } } })).toBeUndefined()
  })

  it('streams reasoning then text, stamping reasoning start and duration', () => {
    const state = feed(start(), [
      [{ type: 'model', model: 'served' }, 1100],
      [{ type: 'reasoning', text: 'th', field: 'reasoning_content' }, 1200],
      [{ type: 'reasoning', text: 'ink', field: 'reasoning_content' }, 1300],
      [{ type: 'text', text: 'Hel' }, 1700],
      [{ type: 'text', text: 'lo' }, 1800],
      [{ type: 'finish', reason: 'stop' }, 1900],
    ])
    expect(state.message.blocks).toEqual([
      { type: 'reasoning', id: 't-b1', text: 'think', startedAt: 1200, durationMs: 500 },
      { type: 'text', id: 't-b2', text: 'Hello', markdown: true },
    ])
    expect(state.message.metrics?.model).toBe('served')
    expect(readAgentMeta(state.message)?.steps).toEqual([
      { start: 0, reasoning: [{ field: 'reasoning_content', length: 5 }] },
    ])
  })

  it('records reasoning provenance per segment while keeping one block', () => {
    const state = feed(start(), [
      [{ type: 'reasoning', text: 'ab', field: 'reasoning' }, 1],
      [{ type: 'reasoning', text: 'c', field: 'reasoning' }, 2],
      [{ type: 'reasoning', text: 'de', field: 'reasoning_content' }, 3],
      [{ type: 'reasoning', text: 'think' }, 4],
      [{ type: 'reasoning', text: 'f', field: 'reasoning' }, 5],
    ])
    expect(state.message.blocks).toEqual([
      { type: 'reasoning', id: 't-b1', text: 'abcdethinkf', startedAt: 1 },
    ])
    expect(readAgentMeta(state.message)?.steps[0]).toEqual({
      start: 0,
      reasoning: [
        { field: 'reasoning', length: 3 },
        { field: 'reasoning_content', length: 2 },
        { length: 5 },
        { field: 'reasoning', length: 1 },
      ],
    })
    const think = feed(start(), [[{ type: 'reasoning', text: 'a' }, 1]])
    expect(readAgentMeta(think.message)?.steps[0]).toEqual({
      start: 0,
      reasoning: [{ length: 1 }],
    })
  })

  it('tolerates a reasoning field arriving with no step begun', () => {
    const state = applyEvent(
      createTurn('t', 0, 'm'),
      { type: 'reasoning', text: 'x', field: 'reasoning' },
      5,
    )
    expect(state.message.blocks).toHaveLength(1)
    expect(readAgentMeta(state.message)?.steps).toEqual([])
  })

  it('starts a new reasoning block after a closed one', () => {
    const state = feed(start(), [
      [{ type: 'reasoning', text: 'a' }, 10],
      [{ type: 'text', text: 'x' }, 20],
      [{ type: 'reasoning', text: 'b' }, 30],
    ])
    expect(state.message.blocks.map((b) => b.type)).toEqual(['reasoning', 'text', 'reasoning'])
  })

  it('accumulates tool calls by index with fragmented arguments and names', () => {
    let state = feed(start(), [
      [{ type: 'reasoning', text: 'r' }, 10],
      [{ type: 'tool_call', index: 0, id: 'c1', name: 'calcu', arguments: '{"expr' }, 20],
      [{ type: 'tool_call', index: 0, name: 'lator', arguments: 'ession":"1+1"}' }, 30],
      [{ type: 'tool_call', index: 0, name: 'calculator' }, 35],
      [{ type: 'tool_call', index: 1, name: 'now' }, 40],
      [{ type: 'tool_call', index: 2 }, 41],
      [{ type: 'tool_call', index: 2, arguments: '{bad' }, 42],
    ])
    const live = state.message.blocks[1] as ToolCallBlock
    expect(live).toMatchObject({ name: 'calculator', arguments: '{"expression":"1+1"}' })
    const ended = endStep(state, 100)
    state = ended.state
    expect(state.message.blocks[0]).toMatchObject({ type: 'reasoning', durationMs: 10 })
    expect(ended.calls).toEqual([
      {
        type: 'tool_call',
        id: 'c1',
        name: 'calculator',
        arguments: { expression: '1+1' },
        status: 'pending',
      },
      { type: 'tool_call', id: 'call_t-b3', name: 'now', arguments: {}, status: 'pending' },
      {
        type: 'tool_call',
        id: 'call_t-b4',
        name: '',
        arguments: '{bad',
        status: 'error',
        result: { error: 'The tool arguments were not valid JSON.' },
      },
    ])
  })

  it('ignores tool calls from earlier steps when ending a step', () => {
    let state = feed(start(), [[{ type: 'tool_call', index: 0, id: 'a', name: 'x' }, 1]])
    state = endStep(state, 2).state
    state = beginStep(state)
    state = feed(state, [[{ type: 'tool_call', index: 0, id: 'b', name: 'y', arguments: '{}' }, 3]])
    const { calls } = endStep(state, 4)
    expect(calls.map((c) => c.id)).toEqual(['b'])
    expect(readAgentMeta(state.message)?.steps).toEqual([{ start: 0 }, { start: 1 }])
  })

  it('sums usage across steps and keeps absent fields absent', () => {
    const state = feed(start(), [
      [{ type: 'usage', usage: { prompt: 5, completion: 2 } }, 1],
      [{ type: 'usage', usage: { completion: 3 } }, 2],
    ])
    expect(state.usage).toEqual({ prompt: 5, completion: 5 })
  })

  it('updates a tool call in place', () => {
    let state = feed(start(), [
      [{ type: 'text', text: 'x' }, 1],
      [{ type: 'tool_call', index: 0, id: 'c', name: 'n' }, 2],
    ])
    state = updateToolCall(state, 'c', { status: 'running', startedAt: 5 })
    expect(state.message.blocks[1]).toMatchObject({ status: 'running', startedAt: 5 })
    expect(state.message.blocks[0]).toEqual({ type: 'text', id: 't-b1', text: 'x', markdown: true })
  })

  it('finalizes duration, usage and tokens/sec from reported usage', () => {
    let state = feed(start(), [
      [{ type: 'text', text: 'hello' }, 2000],
      [{ type: 'usage', usage: { completion: 10 } }, 3000],
    ])
    state = endStep(state, 4000).state
    const message = finalizeTurn(state, 5000)
    expect(message.metrics).toEqual({
      requestModel: 'req-model',
      durationMs: 4000,
      usage: { completion: 10 },
      tokensPerSecond: 5,
    })
  })

  it('finalizes an open step, estimating tokens and failing unsettled tool calls', () => {
    let state = feed(start(), [
      [{ type: 'reasoning', text: 'aaaaaaaa' }, 2000],
      [{ type: 'tool_call', index: 0, id: 'c', name: 'n', arguments: '{}' }, 3000],
    ])
    state = updateToolCall(state, 'c', { status: 'running' })
    const message = finalizeTurn(state, 4000, 'Aborted.')
    expect(message.blocks[0]).toMatchObject({ durationMs: 1000 })
    expect(message.blocks[1]).toMatchObject({ status: 'error', result: { error: 'Aborted.' } })
    expect(message.metrics?.tokensPerSecond).toBe(1)
  })

  it('keeps an existing result, uses defaults, and skips rates without generation time', () => {
    let state = feed(start(), [[{ type: 'tool_call', index: 0, id: 'c', name: 'n' }, 1000]])
    state = endStep(state, 1000).state
    state = updateToolCall(state, 'c', { result: 'partial' })
    const message = finalizeTurn(state, 1500)
    expect(message.blocks[0]).toMatchObject({ status: 'error', result: 'partial' })
    expect(message.metrics).toEqual({ requestModel: 'req-model', durationMs: 500 })
    const bare = finalizeTurn(
      {
        ...createTurn('x', 0, 'm'),
        message: { ...createTurn('x', 0, 'm').message, createdAt: undefined as never },
      },
      10,
    )
    expect(bare.metrics?.durationMs).toBe(0)
  })

  it('finalizes a pending call with the default reason', () => {
    const state = feed(start(), [[{ type: 'tool_call', index: 0, id: 'c', name: 'n' }, 1]])
    expect(finalizeTurn(state, 2).blocks[0]).toMatchObject({ result: { error: 'aborted' } })
  })

  it('treats a reasoning block with no start as zero-length when closed', () => {
    const base = start()
    const state: TurnState = {
      ...base,
      message: { ...base.message, blocks: [{ type: 'reasoning', id: 'r', text: 'x' }] },
    }
    expect(applyEvent(state, { type: 'text', text: 'y' }, 50).message.blocks[0]).toMatchObject({
      durationMs: 0,
    })
  })
})

describe('accumulator edge cases', () => {
  it('begins a step on a message whose bookkeeping was stripped', () => {
    const base = createTurn('t', 0, 'm')
    const stripped = { ...base, message: { ...base.message, meta: {} } }
    expect(readAgentMeta(beginStep(stripped).message)?.steps).toEqual([{ start: 0 }])
  })

  it('ends a step that received no events without adding generation time', () => {
    const { state, calls } = endStep(start(), 99)
    expect(calls).toEqual([])
    expect(state.generationMs).toBe(0)
  })

  it('records cost (summed) and context use (last step) in the finalized metrics', () => {
    let state = feed(start(), [
      [{ type: 'text', text: 'x' }, 1000],
      [{ type: 'usage', usage: { prompt: 10, completion: 5, cost: 0.01 } }, 1100],
      [{ type: 'usage', usage: { prompt: 20, completion: 7, cost: 0.02 } }, 1200],
    ])
    state = endStep(state, 1300).state
    const metrics = finalizeTurn(state, 1400).metrics
    expect(metrics?.cost?.amount).toBeCloseTo(0.03)
    expect(metrics?.context).toEqual({ used: 27 })
    expect(metrics?.usage).toEqual({ prompt: 30, completion: 12 })
    const noContext = finalizeTurn(
      feed(start(), [[{ type: 'usage', usage: { total: 3 } }, 1]]),
      2,
    ).metrics
    expect(noContext?.context).toBeUndefined()
    expect(noContext?.cost).toBeUndefined()
  })
})
