// @vitest-environment node
import type { ChatMessage, ToolCallBlock } from '@fx/chat-core'
import { describe, expect, it, vi } from 'vitest'
import type { Client, CompletionRequest } from './client'
import { runAgent } from './run'
import type { AgentTool, StreamEvent } from './types'

const history: ChatMessage[] = [
  { id: 'u', role: 'user', blocks: [{ type: 'text', id: 'b', text: 'hi' }] },
]

type Script = StreamEvent[] | ((request: CompletionRequest) => AsyncGenerator<StreamEvent>)

/** A fake client replaying one scripted step per completion request. */
function scripted(...steps: Script[]) {
  const requests: CompletionRequest[] = []
  const client: Client = {
    listModels: async () => [],
    async *streamCompletion(request) {
      requests.push(request)
      const step = steps.shift()
      if (!step) throw new Error('unexpected request')
      if (typeof step === 'function') {
        yield* step(request)
        return
      }
      for (const event of step) yield event
    },
  }
  return { client, requests }
}

let clock = 0
const now = () => {
  clock += 10
  return clock
}

const calc: AgentTool = {
  name: 'calc',
  description: 'adds',
  parameters: { type: 'object' },
  execute: (args) => ({ sum: (args as { a: number }).a + 1 }),
}

const callEvents = (id: string, name: string, args = '{"a":1}'): StreamEvent[] => [
  { type: 'tool_call', index: 0, id, name, arguments: args },
  { type: 'finish', reason: 'tool_calls' },
]

describe('runAgent', () => {
  it('completes a turn without tools and reports every snapshot', async () => {
    const { client, requests } = scripted([
      { type: 'model', model: 'served' },
      { type: 'text', text: 'Hello' },
      { type: 'finish', reason: 'stop' },
    ])
    const updates: ChatMessage[] = []
    const result = await runAgent({
      client,
      model: 'm',
      history,
      system: 'sys',
      messageId: 'a1',
      now,
      thinkTags: false,
      body: { temperature: 0 },
      onUpdate: (m) => updates.push(m),
    })
    expect(result.outcome).toBe('complete')
    expect(result.message.id).toBe('a1')
    expect(result.message.blocks).toEqual([
      { type: 'text', id: 'a1-b1', text: 'Hello', markdown: true },
    ])
    expect(result.message.metrics?.model).toBe('served')
    expect(updates.at(-1)).toEqual(result.message)
    expect(requests[0]?.messages[0]).toEqual({ role: 'system', content: 'sys' })
    expect(requests[0]?.messages.at(-1)).toEqual({ role: 'user', content: 'hi' })
    expect(requests[0]?.tools).toEqual([])
    expect(requests[0]?.thinkTags).toBe(false)
    expect(requests[0]?.body).toEqual({ temperature: 0 })
  })

  it('runs tools, sends results back, and continues to the answer', async () => {
    const { client, requests } = scripted(callEvents('c1', 'calc'), [
      { type: 'text', text: 'It is 2.' },
    ])
    const result = await runAgent({ client, model: 'm', history, tools: [calc], now })
    expect(result.outcome).toBe('complete')
    expect(result.message.blocks[0]).toMatchObject({
      type: 'tool_call',
      status: 'success',
      result: { sum: 2 },
      durationMs: 10,
    })
    expect(requests[0]?.tools?.[0]).toEqual({
      type: 'function',
      function: { name: 'calc', description: 'adds', parameters: { type: 'object' } },
    })
    expect(requests[1]?.messages.slice(-2)).toEqual([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'c1', type: 'function', function: { name: 'calc', arguments: '{"a":1}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'c1', content: '{"sum":2}' },
    ])
  })

  it('echoes only field reasoning, each under its own field', async () => {
    const { client, requests } = scripted(
      [
        { type: 'reasoning', text: 'tag ' },
        { type: 'reasoning', text: 'rc1 ', field: 'reasoning_content' },
        { type: 'reasoning', text: 'r1 ', field: 'reasoning' },
        { type: 'reasoning', text: 'rc2', field: 'reasoning_content' },
        { type: 'reasoning', text: ' tag2' },
        ...callEvents('c1', 'calc'),
      ],
      [{ type: 'text', text: 'It is 2.' }],
    )
    const result = await runAgent({ client, model: 'm', history, tools: [calc], now })
    expect(result.message.blocks[0]).toMatchObject({
      type: 'reasoning',
      text: 'tag rc1 r1 rc2 tag2',
    })
    expect(requests[1]?.messages.at(-2)).toEqual({
      role: 'assistant',
      content: null,
      reasoning_content: 'rc1 rc2',
      reasoning: 'r1 ',
      tool_calls: [
        { id: 'c1', type: 'function', function: { name: 'calc', arguments: '{"a":1}' } },
      ],
    })
  })

  it('keeps a reasoning-only step in the next request history', async () => {
    const first = scripted([
      { type: 'reasoning', text: 'just thinking', field: 'reasoning' },
      { type: 'finish', reason: 'stop' },
    ])
    const turn = await runAgent({ client: first.client, model: 'm', history, now })
    const next = scripted([{ type: 'text', text: 'ok' }])
    const followUp: ChatMessage = {
      id: 'u2',
      role: 'user',
      blocks: [{ type: 'text', id: 'b2', text: 'go on' }],
    }
    await runAgent({
      client: next.client,
      model: 'm',
      history: [...history, turn.message, followUp],
      now,
    })
    expect(next.requests[0]?.messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: '', reasoning: 'just thinking' },
      { role: 'user', content: 'go on' },
    ])
  })

  it('records unknown tools, invalid arguments, thrown errors and undefined results', async () => {
    const failing: AgentTool = {
      ...calc,
      name: 'fail',
      execute: () => Promise.reject(new Error('kaput')),
    }
    const weird: AgentTool = {
      ...calc,
      name: 'weird',
      execute: () => {
        throw 'string failure'
      },
    }
    const empty: AgentTool = { ...calc, name: 'empty', execute: () => undefined }
    const { client } = scripted(
      [
        { type: 'tool_call', index: 0, id: 'u', name: 'nope', arguments: '{}' },
        { type: 'tool_call', index: 1, id: 'nameless', arguments: '{}' },
        { type: 'tool_call', index: 2, id: 'bad', name: 'calc', arguments: '{' },
        { type: 'tool_call', index: 3, id: 'f', name: 'fail', arguments: '{}' },
        { type: 'tool_call', index: 4, id: 'w', name: 'weird', arguments: '{}' },
        { type: 'tool_call', index: 5, id: 'e', name: 'empty', arguments: '{}' },
      ],
      [{ type: 'text', text: 'ok' }],
    )
    const result = await runAgent({
      client,
      model: 'm',
      history,
      tools: [calc, failing, weird, empty],
      now,
    })
    const byId = Object.fromEntries(
      result.message.blocks
        .filter((b): b is ToolCallBlock => b.type === 'tool_call')
        .map((b) => [b.id, b]),
    )
    expect(byId.u?.result).toEqual({ error: 'Unknown tool: nope' })
    expect(byId.nameless?.result).toEqual({ error: 'Unknown tool: (unnamed)' })
    expect(byId.bad?.status).toBe('error')
    expect(byId.f).toMatchObject({ status: 'error', result: { error: 'kaput' } })
    expect(byId.w).toMatchObject({ status: 'error', result: { error: 'string failure' } })
    expect(byId.e).toMatchObject({ status: 'success', result: null })
  })

  it('asks for approval and records declines', async () => {
    const guarded: AgentTool = { ...calc, requiresApproval: true, execute: vi.fn(() => 'ran') }
    const approve = vi
      .fn<(call: ToolCallBlock, signal: AbortSignal) => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('ui gone'))
    const { client, requests } = scripted(
      [
        { type: 'tool_call', index: 0, id: 'a', name: 'calc', arguments: '{"a":1}' },
        { type: 'tool_call', index: 1, id: 'b', name: 'calc', arguments: '{"a":1}' },
        { type: 'tool_call', index: 2, id: 'c', name: 'calc', arguments: '{"a":1}' },
      ],
      [{ type: 'text', text: 'done' }],
    )
    const result = await runAgent({ client, model: 'm', history, tools: [guarded], approve, now })
    expect(approve).toHaveBeenCalledTimes(3)
    expect(guarded.execute).toHaveBeenCalledTimes(1)
    const statuses = result.message.blocks.flatMap((b) =>
      b.type === 'tool_call' ? [b.status] : [],
    )
    expect(statuses).toEqual(['success', 'error', 'error'])
    expect(requests[1]?.messages).toContainEqual({
      role: 'tool',
      tool_call_id: 'b',
      content: '{"error":"The user declined this tool call."}',
    })
  })

  it('declines approval-gated tools when no approval handler is given', async () => {
    const guarded: AgentTool = { ...calc, requiresApproval: true }
    const { client } = scripted(callEvents('a', 'calc'), [{ type: 'text', text: 'x' }])
    const result = await runAgent({ client, model: 'm', history, tools: [guarded], now })
    expect(result.message.blocks[0]).toMatchObject({ status: 'error' })
  })

  it('resolves error with the message and keeps the partial turn', async () => {
    const { client } = scripted(async function* () {
      yield { type: 'text', text: 'part' } as StreamEvent
      throw new Error('HTTP 500: down')
    })
    const result = await runAgent({ client, model: 'm', history, now })
    expect(result).toMatchObject({ outcome: 'error', error: 'HTTP 500: down' })
    expect(result.message.blocks[0]).toMatchObject({ text: 'part' })

    const nonError = scripted(async function* () {
      yield* []
      throw { toString: () => 'odd' }
    })
    expect((await runAgent({ client: nonError.client, model: 'm', history, now })).error).toBe(
      'odd',
    )

    const unnamed = scripted(async function* () {
      yield* []
      throw new Error('')
    })
    expect((await runAgent({ client: unnamed.client, model: 'm', history, now })).error).toBe(
      'Error',
    )
  })

  it('resolves aborted when stopped mid-stream, before start, or after a step', async () => {
    const controller = new AbortController()
    const { client } = scripted(async function* () {
      yield { type: 'reasoning', text: 'hmm' } as StreamEvent
      controller.abort()
      throw new DOMException('aborted', 'AbortError')
    })
    const result = await runAgent({ client, model: 'm', history, signal: controller.signal, now })
    expect(result.outcome).toBe('aborted')
    expect(result.message.blocks[0]).toMatchObject({
      type: 'reasoning',
      text: 'hmm',
      durationMs: 10,
    })

    const pre = new AbortController()
    pre.abort()
    expect(
      (await runAgent({ client: scripted().client, model: 'm', history, signal: pre.signal }))
        .outcome,
    ).toBe('aborted')

    const quiet = new AbortController()
    const late = scripted(async function* () {
      yield { type: 'text', text: 'x' } as StreamEvent
      quiet.abort()
    })
    expect(
      (await runAgent({ client: late.client, model: 'm', history, signal: quiet.signal, now }))
        .outcome,
    ).toBe('aborted')
  })

  it('stops at the next event when the transport ignores the abort signal', async () => {
    const controller = new AbortController()
    const { client } = scripted(async function* () {
      yield { type: 'text', text: 'a' } as StreamEvent
      controller.abort()
      yield { type: 'text', text: 'b' } as StreamEvent
    })
    const result = await runAgent({ client, model: 'm', history, signal: controller.signal, now })
    expect(result.outcome).toBe('aborted')
    expect(result.message.blocks).toEqual([
      { type: 'text', id: result.message.blocks[0]?.id, text: 'a', markdown: true },
    ])
  })

  it('stops between and during tool calls when aborted', async () => {
    const controller = new AbortController()
    const slow: AgentTool = {
      ...calc,
      execute: () => {
        controller.abort()
        return 'late'
      },
    }
    const { client } = scripted([
      { type: 'tool_call', index: 0, id: 'a', name: 'calc', arguments: '{}' },
      { type: 'tool_call', index: 1, id: 'b', name: 'calc', arguments: '{}' },
    ])
    const result = await runAgent({
      client,
      model: 'm',
      history,
      tools: [slow],
      signal: controller.signal,
      now,
    })
    expect(result.outcome).toBe('aborted')
    expect(result.message.blocks.map((b) => (b as ToolCallBlock).status)).toEqual([
      'error',
      'error',
    ])
    expect((result.message.blocks[0] as ToolCallBlock).result).toEqual({ error: 'Aborted.' })

    const c2 = new AbortController()
    const throwing: AgentTool = {
      ...calc,
      execute: () => {
        c2.abort()
        throw new Error('cancelled')
      },
    }
    const s2 = scripted(callEvents('a', 'calc'))
    expect(
      (
        await runAgent({
          client: s2.client,
          model: 'm',
          history,
          tools: [throwing],
          signal: c2.signal,
          now,
        })
      ).outcome,
    ).toBe('aborted')

    const c3 = new AbortController()
    const gated: AgentTool = { ...calc, requiresApproval: true }
    const s3 = scripted(callEvents('a', 'calc'))
    const r3 = await runAgent({
      client: s3.client,
      model: 'm',
      history,
      tools: [gated],
      signal: c3.signal,
      approve: async () => {
        c3.abort()
        return true
      },
      now,
    })
    expect(r3.outcome).toBe('aborted')
  })

  it('stops at the step limit', async () => {
    const { client } = scripted(callEvents('a', 'calc'), callEvents('b', 'calc'))
    const result = await runAgent({ client, model: 'm', history, tools: [calc], maxSteps: 2, now })
    expect(result.outcome).toBe('max_steps')
    expect(result.message.blocks).toHaveLength(2)
  })

  it('uses a random id and the real clock by default', async () => {
    const { client } = scripted([{ type: 'text', text: 'x' }])
    const result = await runAgent({ client, model: 'm', history })
    expect(result.message.id).toMatch(/^msg_/)
    expect(result.message.createdAt).toBeGreaterThan(0)
  })

  it('records approval states and the message outcome', async () => {
    const guarded: AgentTool = { ...calc, requiresApproval: true }
    const states: string[] = []
    const { client } = scripted(
      [
        { type: 'tool_call', index: 0, id: 'a', name: 'calc', arguments: '{"a":1}' },
        { type: 'tool_call', index: 1, id: 'b', name: 'calc', arguments: '{"a":1}' },
      ],
      [{ type: 'text', text: 'ok' }],
    )
    const approve = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const result = await runAgent({
      client,
      model: 'm',
      history,
      tools: [guarded],
      approve,
      now,
      onUpdate: (m) => {
        const a = (m.blocks[0] as ToolCallBlock | undefined)?.approval?.state
        if (a && states.at(-1) !== a) states.push(a)
      },
    })
    expect(states).toEqual(['pending', 'approved'])
    expect((result.message.blocks[1] as ToolCallBlock).approval).toEqual({ state: 'denied' })
    expect(result.message.outcome).toBeUndefined()
  })

  it('stamps stopped and error outcomes', async () => {
    const pre = new AbortController()
    pre.abort()
    const stopped = await runAgent({
      client: scripted().client,
      model: 'm',
      history,
      signal: pre.signal,
    })
    expect(stopped.message.outcome).toEqual({ kind: 'stopped' })
    const failing = scripted(async function* () {
      yield* []
      throw new Error('HTTP 500: down')
    })
    const failed = await runAgent({ client: failing.client, model: 'm', history, now })
    expect(failed.message.outcome).toEqual({
      kind: 'error',
      message: 'HTTP 500: down',
      retryable: true,
    })
    const looping = scripted(callEvents('a', 'calc'))
    const limited = await runAgent({
      client: looping.client,
      model: 'm',
      history,
      tools: [calc],
      maxSteps: 1,
      now,
    })
    expect(limited.message.outcome).toEqual({
      kind: 'error',
      message: 'Stopped after 1 tool steps.',
      retryable: true,
    })
  })
})

describe('runAgent abort during host callbacks', () => {
  it('ends a pending approval that never resolves when aborted', async () => {
    const controller = new AbortController()
    const gated: AgentTool = { ...calc, requiresApproval: true, execute: vi.fn() }
    const { client } = scripted(callEvents('a', 'calc'))
    const result = await runAgent({
      client,
      model: 'm',
      history,
      tools: [gated],
      signal: controller.signal,
      approve: (_call, signal) => {
        expect(signal).toBe(controller.signal)
        setTimeout(() => controller.abort(), 0)
        return new Promise<boolean>(() => {})
      },
      now,
    })
    expect(result.outcome).toBe('aborted')
    expect(result.message.outcome).toEqual({ kind: 'stopped' })
    const block = result.message.blocks[0] as ToolCallBlock
    expect(block.status).toBe('error')
    expect(block.result).toEqual({ error: 'Aborted.' })
    expect(gated.execute).not.toHaveBeenCalled()
  })

  it('ends a running tool that never settles when aborted', async () => {
    const controller = new AbortController()
    const stuck: AgentTool = {
      ...calc,
      execute: () => {
        setTimeout(() => controller.abort(), 0)
        return new Promise(() => {})
      },
    }
    const { client } = scripted(callEvents('a', 'calc'))
    const result = await runAgent({
      client,
      model: 'm',
      history,
      tools: [stuck],
      signal: controller.signal,
      now,
    })
    expect(result.outcome).toBe('aborted')
    const block = result.message.blocks[0] as ToolCallBlock
    expect(block.status).toBe('error')
    expect(block.result).toEqual({ error: 'Aborted.' })
  })
})

describe('runAgent with host values that throw', () => {
  const throwingToString = {
    toString: () => {
      throw new Error('no text')
    },
  }
  const throwingMessage = Object.defineProperty(new Error('x'), 'message', {
    get: () => {
      throw new Error('no message')
    },
  })
  const unnamed = Object.assign(new Error(''), { name: '' })

  it.each([
    ['an object whose toString throws', throwingToString],
    ['a null-prototype object', Object.create(null)],
    ['an Error whose message getter throws', throwingMessage],
    ['an Error with no message or name', unnamed],
    ['an empty string', ''],
  ])('records %s thrown by a tool as a failed call', async (_label, thrown) => {
    const tool: AgentTool = {
      ...calc,
      execute: () => {
        throw thrown
      },
    }
    const { client } = scripted(callEvents('t', 'calc'), [{ type: 'text', text: 'ok' }])
    const result = await runAgent({ client, model: 'm', history, tools: [tool], now })
    expect(result.outcome).toBe('complete')
    expect(result.message.blocks[0]).toMatchObject({
      status: 'error',
      result: { error: 'Tool failed.' },
    })
  })

  it('resolves error when the transport throws a value with no text', async () => {
    const { client } = scripted(async function* () {
      yield* []
      throw throwingToString
    })
    expect(await runAgent({ client, model: 'm', history, now })).toMatchObject({
      outcome: 'error',
      error: 'The request failed.',
    })
  })

  it('resolves error, not reject, when onUpdate throws', async () => {
    const { client } = scripted([{ type: 'text', text: 'hi' }])
    let calls = 0
    const onUpdate = () => {
      calls++
      throw new Error('listener broke')
    }
    const result = await runAgent({ client, model: 'm', history, now, onUpdate })
    expect(result).toMatchObject({ outcome: 'error', error: 'listener broke' })
    expect(result.message.outcome).toEqual({
      kind: 'error',
      message: 'listener broke',
      retryable: true,
    })
    expect(calls).toBe(2)
  })

  it('resolves error with a fixed text when a host value throws something unreadable', async () => {
    const { client } = scripted([{ type: 'text', text: 'hi' }])
    const result = await runAgent({
      client,
      model: 'm',
      history,
      now,
      onUpdate: () => {
        throw throwingToString
      },
    })
    expect(result).toMatchObject({ outcome: 'error', error: 'The run failed unexpectedly.' })
  })

  it('resolves aborted when a host value throws after the run is aborted', async () => {
    const controller = new AbortController()
    const { client } = scripted([{ type: 'text', text: 'hi' }])
    const result = await runAgent({
      client,
      model: 'm',
      history,
      now,
      signal: controller.signal,
      onUpdate: () => {
        controller.abort()
        throw new Error('late')
      },
    })
    expect(result.outcome).toBe('aborted')
  })

  it('falls back to the real clock when the injected clock throws', async () => {
    const { client } = scripted([{ type: 'text', text: 'hi' }])
    const result = await runAgent({
      client,
      model: 'm',
      history,
      now: () => {
        throw new Error('no clock')
      },
    })
    expect(result.outcome).toBe('complete')
    expect(result.message.createdAt).toBeGreaterThan(0)
  })
})
