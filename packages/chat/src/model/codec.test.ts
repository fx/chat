import { describe, expect, it } from 'vitest'
import {
  ChatMessageAssertionError,
  type HostMessage,
  assertChatMessage,
  attachmentKind,
  deepParseJson,
  defaultToolStatus,
  normalizeMessage,
  normalizeTranscript,
  toJsonSafe,
} from './codec'
import type { ChatMessage, ToolCallBlock } from './types'

function toolBlocks(message: ChatMessage): ToolCallBlock[] {
  return message.blocks.filter((b): b is ToolCallBlock => b.type === 'tool_call')
}

describe('deepParseJson', () => {
  it('returns non-string values unchanged', () => {
    expect(deepParseJson(42)).toBe(42)
    expect(deepParseJson({ a: 1 })).toEqual({ a: 1 })
    expect(deepParseJson(undefined)).toBeUndefined()
  })

  it('parses a single-encoded JSON string', () => {
    expect(deepParseJson('{"a":1}')).toEqual({ a: 1 })
  })

  it('unwraps a multiply-encoded JSON string', () => {
    const doubled = JSON.stringify(JSON.stringify({ ok: true }))
    expect(deepParseJson(doubled)).toEqual({ ok: true })
  })

  it('stops at the iteration bound and returns the last decoded string', () => {
    // Six-times-encoded plain string: each parse peels one layer; after 5
    // iterations a string still remains and is returned as-is.
    let value = 'deep'
    for (let i = 0; i < 6; i++) value = JSON.stringify(value)
    const result = deepParseJson(value)
    expect(typeof result).toBe('string')
    // Five layers peeled, one still encoded.
    expect(result).toBe(JSON.stringify('deep'))
  })

  it('returns the original string when it is not valid JSON', () => {
    expect(deepParseJson('not json')).toBe('not json')
  })

  it('returns a decoded primitive string then stops (number stays parsed)', () => {
    expect(deepParseJson('"hello"')).toBe('hello')
    expect(deepParseJson('123')).toBe(123)
  })
})

describe('toJsonSafe', () => {
  it('passes undefined through unchanged', () => {
    expect(toJsonSafe(undefined)).toBeUndefined()
  })

  it('round-trips a plain JSON value', () => {
    expect(toJsonSafe({ a: 1, b: [2, 3] })).toEqual({ a: 1, b: [2, 3] })
  })

  it('strips nested undefined and function properties', () => {
    const fn = () => 1
    expect(toJsonSafe({ a: 1, b: undefined, c: fn })).toEqual({ a: 1 })
  })

  it('returns null for values that cannot be serialized', () => {
    expect(toJsonSafe(10n)).toBeNull()
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(toJsonSafe(circular)).toBeNull()
  })
})

describe('attachmentKind', () => {
  it('maps image/* to image', () => {
    expect(attachmentKind('image/png')).toBe('image')
  })
  it('maps video/* to video', () => {
    expect(attachmentKind('video/mp4')).toBe('video')
  })
  it('maps audio/* to audio', () => {
    expect(attachmentKind('audio/mpeg')).toBe('audio')
  })
  it('maps anything else to file', () => {
    expect(attachmentKind('application/pdf')).toBe('file')
    expect(attachmentKind('text/plain')).toBe('file')
  })
  it('is case-insensitive on the major type', () => {
    expect(attachmentKind('IMAGE/PNG')).toBe('image')
  })
  it('treats an empty media type as file', () => {
    expect(attachmentKind('')).toBe('file')
  })
})

describe('defaultToolStatus', () => {
  it('is pending when there is no result', () => {
    expect(defaultToolStatus({}, undefined)).toBe('pending')
  })
  it('is error when the result has a truthy error key', () => {
    expect(defaultToolStatus({}, { error: 'boom' })).toBe('error')
  })
  it('is success when the result has a falsy error key', () => {
    expect(defaultToolStatus({}, { error: null })).toBe('success')
  })
  it('is success for a present non-error result', () => {
    expect(defaultToolStatus({}, { data: 1 })).toBe('success')
  })
  it('is success for a primitive result', () => {
    expect(defaultToolStatus({}, 'done')).toBe('success')
  })
  it('is success for a null result', () => {
    expect(defaultToolStatus({}, null)).toBe('success')
  })
})

describe('normalizeMessage — flat-content normalization', () => {
  it('orders blocks [reasoning, text, tool_call…] with parsed values and explicit status', () => {
    const input: HostMessage = {
      id: 'm1',
      role: 'assistant',
      content: 'Here is the answer',
      reasoning: 'thinking hard',
      reasoningDurationMs: 120,
      toolCalls: [
        {
          id: 't1',
          function: { name: 'search', arguments: '{"q":"cats"}' },
          result: '{"hits":3}',
        },
      ],
    }
    const message = normalizeMessage(input)

    expect(message.id).toBe('m1')
    expect(message.role).toBe('assistant')
    expect(message.blocks.map((b) => b.type)).toEqual(['reasoning', 'text', 'tool_call'])

    const [reasoning, text] = message.blocks
    expect(reasoning).toMatchObject({ type: 'reasoning', text: 'thinking hard', durationMs: 120 })
    expect(text).toMatchObject({ type: 'text', text: 'Here is the answer', markdown: true })

    const [tool] = toolBlocks(message)
    expect(tool).toMatchObject({
      type: 'tool_call',
      id: 't1',
      name: 'search',
      arguments: { q: 'cats' },
      result: { hits: 3 },
      status: 'success',
    })
  })

  it('omits the reasoning block when absent and marks user text as non-markdown', () => {
    const message = normalizeMessage({ id: 'u1', role: 'user', content: 'hi' })
    expect(message.blocks).toHaveLength(1)
    expect(message.blocks[0]).toMatchObject({ type: 'text', markdown: false })
  })

  it('omits the reasoning block when reasoning is empty', () => {
    const message = normalizeMessage({ id: 'r0', role: 'assistant', reasoning: '', content: 'hi' })
    expect(message.blocks.map((b) => b.type)).toEqual(['text'])
  })

  it('emits a system block for a system message', () => {
    const message = normalizeMessage({ id: 's1', role: 'system', content: 'be nice' })
    expect(message.blocks[0]).toMatchObject({ type: 'system', text: 'be nice' })
  })

  it('treats an unknown role as assistant', () => {
    const message = normalizeMessage({ id: 'x1', role: 'weird', content: 'hello' })
    expect(message.role).toBe('assistant')
  })

  it('omits the text block when content is empty or non-string', () => {
    expect(normalizeMessage({ id: 'a', role: 'assistant', content: '' }).blocks).toHaveLength(0)
    expect(normalizeMessage({ id: 'b', role: 'assistant' }).blocks).toHaveLength(0)
    expect(
      normalizeMessage({ id: 'c', role: 'assistant', content: 123 as unknown }).blocks,
    ).toHaveLength(0)
  })

  it('generates a fallback message id when host omits it', () => {
    const message = normalizeMessage({ role: 'assistant', content: 'hi' })
    expect(message.id).toBe('fallback-message')
    expect(message.blocks[0]?.id).toBe('fallback-message:text')
  })

  it('honors a custom generateId mapping', () => {
    const message = normalizeMessage(
      { role: 'assistant', content: 'hi' },
      { generateId: (ctx) => `custom-${ctx}` },
    )
    expect(message.id).toBe('custom-message')
  })

  it('carries attachments with derived kind, createdAt, metrics, and meta', () => {
    const message = normalizeMessage({
      id: 'm2',
      role: 'user',
      content: 'see this',
      attachments: [
        { url: 'http://x/a.png', mediaType: 'image/png', name: 'a.png' },
        { url: 'http://x/b.bin', mediaType: 'application/octet-stream' },
      ],
      createdAt: 1000,
      metrics: { durationMs: 5 },
      meta: { source: 'test' },
    })
    expect(message.attachments).toEqual([
      { url: 'http://x/a.png', mediaType: 'image/png', kind: 'image', name: 'a.png' },
      { url: 'http://x/b.bin', mediaType: 'application/octet-stream', kind: 'file' },
    ])
    expect(message.createdAt).toBe(1000)
    expect(message.metrics).toEqual({ durationMs: 5 })
    expect(message.meta).toEqual({ source: 'test' })
  })

  it('sanitizes the opaque meta bag into JSON-safe shape', () => {
    const message = normalizeMessage({
      id: 'm-meta',
      role: 'assistant',
      content: 'x',
      meta: { keep: 1, drop: undefined, fn: () => 1 },
    })
    expect(message.meta).toEqual({ keep: 1 })
    expect(JSON.parse(JSON.stringify(message))).toEqual(message)
  })

  it('drops a meta bag that cannot survive as a plain JSON object', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const message = normalizeMessage({
      id: 'm-bad',
      role: 'assistant',
      content: 'x',
      meta: circular,
    })
    expect('meta' in message).toBe(false)
  })

  it('handles a tool call with flat name/arguments, no result, and timing/media', () => {
    const message = normalizeMessage({
      id: 'm3',
      role: 'assistant',
      toolCalls: [
        {
          id: 't9',
          name: 'gen',
          arguments: { seed: 1 },
          startedAt: 50,
          durationMs: 10,
          media: [{ kind: 'image', url: 'http://x/i.png' }],
        },
      ],
    })
    const [tool] = toolBlocks(message)
    expect(tool).toEqual({
      type: 'tool_call',
      id: 't9',
      name: 'gen',
      arguments: { seed: 1 },
      status: 'pending',
      startedAt: 50,
      durationMs: 10,
      media: [{ kind: 'image', url: 'http://x/i.png' }],
    })
    expect(tool && 'result' in tool).toBe(false)
  })

  it('synthesizes a tool-call id and empty name when host omits them', () => {
    const message = normalizeMessage({ id: 'm4', role: 'assistant', toolCalls: [{}] })
    const [tool] = toolBlocks(message)
    expect(tool?.id).toBe('fallback-tool-0')
    expect(tool?.name).toBe('')
    // Missing arguments default to the JSON-safe sentinel `null`, not `undefined`.
    expect(tool?.arguments).toBeNull()
  })

  it('round-trips an arg-less tool call through JSON and still validates', () => {
    const message = normalizeMessage({ id: 'm4b', role: 'assistant', toolCalls: [{ id: 't' }] })
    const roundTripped = JSON.parse(JSON.stringify(message))
    expect(() => assertChatMessage(roundTripped)).not.toThrow()
    expect(toolBlocks(roundTripped as ChatMessage)[0]?.arguments).toBeNull()
  })

  it('sanitizes already-parsed tool arguments/results into JSON-safe values', () => {
    const message = normalizeMessage({
      id: 'm-sani',
      role: 'assistant',
      toolCalls: [
        {
          id: 't',
          name: 'x',
          arguments: { keep: 1, drop: undefined },
          result: { ok: true, fn: () => 1 },
        },
      ],
    })
    const [tool] = toolBlocks(message)
    expect(tool?.arguments).toEqual({ keep: 1 })
    expect(tool?.result).toEqual({ ok: true })
    // The whole message survives a JSON round-trip unchanged.
    expect(JSON.parse(JSON.stringify(message))).toEqual(message)
  })

  it('honors an explicit host-provided tool status', () => {
    const message = normalizeMessage({
      id: 'm5',
      role: 'assistant',
      toolCalls: [{ id: 't', name: 'x', status: 'running' }],
    })
    expect(toolBlocks(message)[0]?.status).toBe('running')
  })

  it('uses a custom toolStatus mapping', () => {
    const message = normalizeMessage(
      { id: 'm6', role: 'assistant', toolCalls: [{ id: 't', name: 'x', result: { data: 1 } }] },
      { toolStatus: () => 'error' },
    )
    expect(toolBlocks(message)[0]?.status).toBe('error')
  })
})

describe('normalizeTranscript — folding tool-role messages', () => {
  it('folds a matched tool result into the originating assistant block', () => {
    const inputs: HostMessage[] = [
      { id: 'a1', role: 'assistant', toolCalls: [{ id: 't1', name: 'search' }] },
      { id: 'tr1', role: 'tool', toolCallId: 't1', result: '{"hits":3}' },
      { id: 'u1', role: 'user', content: 'thanks' },
    ]
    const out = normalizeTranscript(inputs)

    expect(out.map((m) => m.role)).toEqual(['assistant', 'user'])
    expect(out.map((m) => m.id)).toEqual(['a1', 'u1'])

    const tool = toolBlocks(out[0] as ChatMessage)[0]
    expect(tool?.result).toEqual({ hits: 3 })
    expect(tool?.status).toBe('success')
  })

  it('honors an explicit status on the tool-role message', () => {
    const inputs: HostMessage[] = [
      { id: 'a1', role: 'assistant', toolCalls: [{ id: 't1', name: 's' }] },
      { id: 'tr1', role: 'tool', toolCallId: 't1', result: { x: 1 }, status: 'error' },
    ]
    const out = normalizeTranscript(inputs)
    expect(toolBlocks(out[0] as ChatMessage)[0]?.status).toBe('error')
  })

  it('folds a tool-role message with no result (status recomputed, no result set)', () => {
    const inputs: HostMessage[] = [
      { id: 'a1', role: 'assistant', toolCalls: [{ id: 't1', name: 's' }] },
      { id: 'tr1', role: 'tool', toolCallId: 't1' },
    ]
    const out = normalizeTranscript(inputs)
    const tool = toolBlocks(out[0] as ChatMessage)[0]
    expect(tool && 'result' in tool).toBe(false)
    expect(tool?.status).toBe('pending')
  })

  it('preserves an unmatched tool result on a synthesized assistant message', () => {
    const inputs: HostMessage[] = [
      { id: 'tr-orphan', role: 'tool', toolCallId: 'tX', result: '{"v":9}' },
      { id: 'u1', role: 'user', content: 'hi' },
    ]
    const out = normalizeTranscript(inputs)

    expect(out).toHaveLength(2)
    expect(out[0]?.role).toBe('assistant')
    const tool = toolBlocks(out[0] as ChatMessage)[0]
    expect(tool).toMatchObject({ type: 'tool_call', id: 'tX', name: '', result: { v: 9 } })
    expect(tool?.status).toBe('success')
  })

  it('synthesizes ids when an unmatched tool-role message omits toolCallId and id', () => {
    const out = normalizeTranscript([{ role: 'tool', result: { v: 1 } }])
    const tool = toolBlocks(out[0] as ChatMessage)[0]
    expect(tool?.id).toBe('fallback-0-unmatched-tool')
    expect(out[0]?.id).toBe('fallback-0-unmatched-tool:message')
    expect(tool?.status).toBe('success')
  })

  it('falls back to host id for the message when toolCallId is absent', () => {
    const out = normalizeTranscript([{ id: 'orphanMsg', role: 'tool', result: { v: 1 } }])
    const tool = toolBlocks(out[0] as ChatMessage)[0]
    expect(tool?.id).toBe('orphanMsg')
    expect(out[0]?.id).toBe('orphanMsg')
  })

  it('honors explicit status on an unmatched synthesized tool call', () => {
    const out = normalizeTranscript([
      { role: 'tool', toolCallId: 'tZ', result: { v: 1 }, status: 'error' },
    ])
    expect(toolBlocks(out[0] as ChatMessage)[0]?.status).toBe('error')
  })

  it('preserves an unmatched tool-role message that carries no result', () => {
    const out = normalizeTranscript([{ role: 'tool', toolCallId: 'tNo' }])
    expect(out).toHaveLength(1)
    const tool = toolBlocks(out[0] as ChatMessage)[0]
    expect(tool?.id).toBe('tNo')
    expect(tool && 'result' in tool).toBe(false)
    expect(tool?.status).toBe('pending')
  })

  it('allows a later tool-role message to fold into an earlier synthesized unmatched call', () => {
    const inputs: HostMessage[] = [
      { role: 'tool', toolCallId: 'tDup', result: { first: true } },
      { role: 'tool', toolCallId: 'tDup', result: { second: true }, status: 'running' },
    ]
    const out = normalizeTranscript(inputs)
    // Only one synthesized message; the second folds into it.
    expect(out).toHaveLength(1)
    const tool = toolBlocks(out[0] as ChatMessage)[0]
    expect(tool?.result).toEqual({ second: true })
    expect(tool?.status).toBe('running')
  })

  it('normalizes plain (non-tool) messages without folding', () => {
    const out = normalizeTranscript([{ id: 'u', role: 'user', content: 'hello' }])
    expect(out).toHaveLength(1)
    expect(out[0]?.role).toBe('user')
  })

  it('gives id-less messages unique position-scoped fallback ids', () => {
    const out = normalizeTranscript([
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'two' },
    ])
    expect(out.map((m) => m.id)).toEqual(['fallback-0-message', 'fallback-1-message'])
    // Block ids derive from the message id, so they stay unique too.
    expect(out[0]?.blocks[0]?.id).toBe('fallback-0-message:text')
    expect(out[1]?.blocks[0]?.id).toBe('fallback-1-message:text')
  })

  it('gives id-less unmatched tool results unique position-scoped fallback ids', () => {
    const out = normalizeTranscript([
      { role: 'tool', result: { a: 1 } },
      { role: 'tool', result: { b: 2 } },
    ])
    expect(toolBlocks(out[0] as ChatMessage)[0]?.id).toBe('fallback-0-unmatched-tool')
    expect(toolBlocks(out[1] as ChatMessage)[0]?.id).toBe('fallback-1-unmatched-tool')
  })
})

describe('assertChatMessage', () => {
  const valid: ChatMessage = {
    id: 'm',
    role: 'assistant',
    blocks: [{ type: 'text', id: 'm:text', text: 'hi' }],
  }

  it('passes for a valid ChatMessage', () => {
    expect(() => assertChatMessage(valid)).not.toThrow()
  })

  it('throws a typed error for non-objects', () => {
    expect(() => assertChatMessage(null)).toThrow(ChatMessageAssertionError)
    expect(() => assertChatMessage('x')).toThrow(/expected a ChatMessage object/)
  })

  it('throws when id is missing', () => {
    expect(() => assertChatMessage({ role: 'user', blocks: [] })).toThrow(/id must be a string/)
  })

  it('throws when role is invalid', () => {
    expect(() => assertChatMessage({ id: 'm', role: 'tool', blocks: [] })).toThrow(/role must be/)
    expect(() => assertChatMessage({ id: 'm', role: 5, blocks: [] })).toThrow(/role must be/)
  })

  it('throws when blocks is not an array', () => {
    expect(() => assertChatMessage({ id: 'm', role: 'user', blocks: {} })).toThrow(
      /blocks must be an array/,
    )
  })

  it('throws when a block is not an object', () => {
    expect(() => assertChatMessage({ id: 'm', role: 'user', blocks: [null] })).toThrow(
      /each block must be an object/,
    )
  })

  it('throws when a block has an unknown type', () => {
    expect(() =>
      assertChatMessage({ id: 'm', role: 'user', blocks: [{ type: 'bogus', id: 'b' }] }),
    ).toThrow(/unknown block type: bogus/)
    expect(() => assertChatMessage({ id: 'm', role: 'user', blocks: [{ id: 'b' }] })).toThrow(
      /unknown block type: undefined/,
    )
  })

  it('throws when a block id is not a string', () => {
    expect(() =>
      assertChatMessage({ id: 'm', role: 'user', blocks: [{ type: 'text', text: 'x' }] }),
    ).toThrow(/each block must have a string id/)
  })

  it('throws when a text/reasoning/system block is missing its text', () => {
    for (const type of ['text', 'reasoning', 'system'] as const) {
      expect(() =>
        assertChatMessage({ id: 'm', role: 'assistant', blocks: [{ type, id: 'b' }] }),
      ).toThrow(new RegExp(`${type} block must have a string text`))
    }
  })

  it('accepts a valid reasoning, system, and status block', () => {
    expect(() =>
      assertChatMessage({
        id: 'm',
        role: 'assistant',
        blocks: [
          { type: 'reasoning', id: 'r', text: 'why' },
          { type: 'system', id: 's', text: 'sys' },
          { type: 'status', id: 'st' },
        ],
      }),
    ).not.toThrow()
  })

  it('accepts a status block with a valid phase and rejects an invalid one', () => {
    expect(() =>
      assertChatMessage({
        id: 'm',
        role: 'assistant',
        blocks: [{ type: 'status', id: 'st', phase: 'streaming' }],
      }),
    ).not.toThrow()
    expect(() =>
      assertChatMessage({
        id: 'm',
        role: 'assistant',
        blocks: [{ type: 'status', id: 'st', phase: 'bogus' }],
      }),
    ).toThrow(/status block phase must be one of/)
  })

  it('throws when a tool_call block is missing required payload fields', () => {
    const base = { id: 'm', role: 'assistant' }
    expect(() => assertChatMessage({ ...base, blocks: [{ type: 'tool_call', id: 'tc' }] })).toThrow(
      /tool_call block must have a string name/,
    )
    expect(() =>
      assertChatMessage({ ...base, blocks: [{ type: 'tool_call', id: 'tc', name: 'x' }] }),
    ).toThrow(/tool_call block must have a non-undefined arguments field/)
    expect(() =>
      assertChatMessage({
        ...base,
        blocks: [{ type: 'tool_call', id: 'tc', name: 'x', arguments: undefined }],
      }),
    ).toThrow(/tool_call block must have a non-undefined arguments field/)
    expect(() =>
      assertChatMessage({
        ...base,
        blocks: [{ type: 'tool_call', id: 'tc', name: 'x', arguments: {} }],
      }),
    ).toThrow(/tool_call block status must be one of/)
    expect(() =>
      assertChatMessage({
        ...base,
        blocks: [{ type: 'tool_call', id: 'tc', name: 'x', arguments: {}, status: 'bogus' }],
      }),
    ).toThrow(/tool_call block status must be one of/)
  })

  it('accepts a fully-formed tool_call block', () => {
    expect(() =>
      assertChatMessage({
        id: 'm',
        role: 'assistant',
        blocks: [
          {
            type: 'tool_call',
            id: 'tc',
            name: 'x',
            arguments: {},
            status: 'success',
            startedAt: 1,
            durationMs: 2,
            media: [{ kind: 'image', url: 'http://x/i.png' }],
          },
        ],
      }),
    ).not.toThrow()
  })

  const toolCall = (extra: Record<string, unknown>) => ({
    id: 'm',
    role: 'assistant' as const,
    blocks: [
      { type: 'tool_call', id: 'tc', name: 'x', arguments: {}, status: 'success', ...extra },
    ],
  })

  it('throws for malformed optional tool_call timing fields', () => {
    expect(() => assertChatMessage(toolCall({ startedAt: 'now' }))).toThrow(
      /startedAt must be a number/,
    )
    expect(() => assertChatMessage(toolCall({ durationMs: 'soon' }))).toThrow(
      /durationMs must be a number/,
    )
  })

  it('throws for malformed tool_call media', () => {
    expect(() => assertChatMessage(toolCall({ media: {} }))).toThrow(/media must be an array/)
    expect(() => assertChatMessage(toolCall({ media: [null] }))).toThrow(
      /each media entry must be an object/,
    )
    expect(() => assertChatMessage(toolCall({ media: [{ kind: 'video', url: 'u' }] }))).toThrow(
      /media.kind must be one of image\|audio/,
    )
    expect(() => assertChatMessage(toolCall({ media: [{ kind: 'image', url: 5 }] }))).toThrow(
      /media.url must be a string/,
    )
  })

  it('throws for a malformed optional text markdown flag', () => {
    expect(() =>
      assertChatMessage({
        id: 'm',
        role: 'assistant',
        blocks: [{ type: 'text', id: 't', text: 'x', markdown: 'yes' }],
      }),
    ).toThrow(/text block markdown must be a boolean/)
  })

  it('throws for a malformed optional reasoning durationMs', () => {
    expect(() =>
      assertChatMessage({
        id: 'm',
        role: 'assistant',
        blocks: [{ type: 'reasoning', id: 'r', text: 'x', durationMs: 'slow' }],
      }),
    ).toThrow(/reasoning block durationMs must be a number/)
  })

  it('accepts well-formed optional block fields', () => {
    expect(() =>
      assertChatMessage({
        id: 'm',
        role: 'assistant',
        blocks: [
          { type: 'text', id: 't', text: 'x', markdown: true },
          { type: 'reasoning', id: 'r', text: 'y', durationMs: 3 },
          { type: 'tool_call', id: 'tc', name: 'n', arguments: {}, status: 'success', media: [] },
        ],
      }),
    ).not.toThrow()
  })

  const withOptional = (extra: Record<string, unknown>) => ({
    id: 'm',
    role: 'user' as const,
    blocks: [],
    ...extra,
  })

  it('accepts well-formed optional fields', () => {
    expect(() =>
      assertChatMessage(
        withOptional({
          attachments: [{ url: 'u', mediaType: 'image/png', kind: 'image', name: 'a' }],
          createdAt: 1,
          metrics: { durationMs: 2 },
          meta: { k: 'v' },
        }),
      ),
    ).not.toThrow()
  })

  it('throws when attachments is not an array', () => {
    expect(() => assertChatMessage(withOptional({ attachments: {} }))).toThrow(
      /attachments must be an array/,
    )
  })

  it('throws for malformed attachment entries', () => {
    expect(() => assertChatMessage(withOptional({ attachments: [null] }))).toThrow(
      /each attachment must be an object/,
    )
    expect(() =>
      assertChatMessage(withOptional({ attachments: [{ mediaType: 'image/png', kind: 'image' }] })),
    ).toThrow(/attachment.url must be a string/)
    expect(() =>
      assertChatMessage(withOptional({ attachments: [{ url: 'u', kind: 'image' }] })),
    ).toThrow(/attachment.mediaType must be a string/)
    expect(() =>
      assertChatMessage(
        withOptional({ attachments: [{ url: 'u', mediaType: 'x', kind: 'bogus' }] }),
      ),
    ).toThrow(/attachment.kind must be one of/)
    expect(() =>
      assertChatMessage(
        withOptional({
          attachments: [{ url: 'u', mediaType: 'image/png', kind: 'image', name: 5 }],
        }),
      ),
    ).toThrow(/attachment.name must be a string/)
  })

  it('throws for malformed createdAt, metrics, and meta', () => {
    expect(() => assertChatMessage(withOptional({ createdAt: 'soon' }))).toThrow(
      /createdAt must be a number/,
    )
    expect(() => assertChatMessage(withOptional({ metrics: [] }))).toThrow(
      /metrics must be an object/,
    )
    expect(() => assertChatMessage(withOptional({ metrics: null }))).toThrow(
      /metrics must be an object/,
    )
    expect(() => assertChatMessage(withOptional({ meta: 'nope' }))).toThrow(
      /meta must be an object/,
    )
    expect(() => assertChatMessage(withOptional({ meta: [] }))).toThrow(/meta must be an object/)
  })

  it('validates the metrics field types', () => {
    expect(() => assertChatMessage(withOptional({ metrics: { durationMs: '1' } }))).toThrow(
      /metrics.durationMs must be a number/,
    )
    expect(() => assertChatMessage(withOptional({ metrics: { tokensPerSecond: '1' } }))).toThrow(
      /metrics.tokensPerSecond must be a number/,
    )
    expect(() => assertChatMessage(withOptional({ metrics: { model: 5 } }))).toThrow(
      /metrics.model must be a string/,
    )
    expect(() => assertChatMessage(withOptional({ metrics: { requestModel: 5 } }))).toThrow(
      /metrics.requestModel must be a string/,
    )
    expect(() => assertChatMessage(withOptional({ metrics: { usage: [] } }))).toThrow(
      /metrics.usage must be an object/,
    )
    expect(() => assertChatMessage(withOptional({ metrics: { usage: { prompt: '1' } } }))).toThrow(
      /metrics.usage.prompt must be a number/,
    )
    expect(() =>
      assertChatMessage(withOptional({ metrics: { usage: { completion: '1' } } })),
    ).toThrow(/metrics.usage.completion must be a number/)
    expect(() => assertChatMessage(withOptional({ metrics: { usage: { total: '1' } } }))).toThrow(
      /metrics.usage.total must be a number/,
    )
  })

  it('accepts fully-formed metrics', () => {
    expect(() =>
      assertChatMessage(
        withOptional({
          metrics: {
            durationMs: 1,
            tokensPerSecond: 2,
            model: 'm',
            requestModel: 'rm',
            usage: { prompt: 1, completion: 2, total: 3 },
          },
        }),
      ),
    ).not.toThrow()
  })
})
