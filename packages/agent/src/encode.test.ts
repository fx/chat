// @vitest-environment node
import type { ChatMessage, ToolCallBlock } from '@fx/chat-core'
import { describe, expect, it } from 'vitest'
import { AGENT_META_KEY } from './accumulate'
import { encodeHistory, splitSteps, toolResultContent } from './encode'

const user = (text: string, attachments?: ChatMessage['attachments']): ChatMessage => ({
  id: `u-${text}`,
  role: 'user',
  blocks: [{ type: 'text', id: 'b', text }],
  ...(attachments ? { attachments } : {}),
})

const call = (id: string, extra: Partial<ToolCallBlock> = {}): ToolCallBlock => ({
  type: 'tool_call',
  id,
  name: 'calc',
  arguments: { a: 1 },
  status: 'success',
  result: { value: 2 },
  ...extra,
})

describe('toolResultContent', () => {
  it('stringifies results, passes strings through, and fills missing results', () => {
    expect(toolResultContent(call('c'))).toBe('{"value":2}')
    expect(toolResultContent(call('c', { result: 'text' }))).toBe('text')
    expect(toolResultContent(call('c', { result: undefined, status: 'error' }))).toBe(
      '{"error":"Tool failed."}',
    )
    expect(toolResultContent(call('c', { result: undefined, status: 'pending' }))).toBe(
      '{"error":"No result."}',
    )
  })
})

describe('splitSteps', () => {
  it('uses recorded step starts when present', () => {
    const message: ChatMessage = {
      id: 'a',
      role: 'assistant',
      blocks: [call('1'), { type: 'text', id: 't', text: 'x' }, call('2')],
      meta: {
        [AGENT_META_KEY]: { steps: [{ start: 0 }, { start: 1 }] },
      },
    }
    expect(splitSteps(message).map((s) => s.blocks.length)).toEqual([1, 2])
    expect(splitSteps(message)[1]?.meta).toEqual({ start: 1 })
  })

  it('recovers steps from block order without bookkeeping', () => {
    const message: ChatMessage = {
      id: 'a',
      role: 'assistant',
      blocks: [
        { type: 'reasoning', id: 'r', text: 'r' },
        call('1'),
        call('2'),
        { type: 'text', id: 't', text: 'done' },
      ],
    }
    expect(splitSteps(message).map((s) => s.blocks.map((b) => b.id))).toEqual([
      ['r', '1', '2'],
      ['t'],
    ])
    expect(splitSteps({ ...message, blocks: [] })).toEqual([])
  })
})

describe('encodeHistory', () => {
  it('encodes system prompt, users with images, and multi-step assistant turns', () => {
    const assistant: ChatMessage = {
      id: 'a',
      role: 'assistant',
      blocks: [
        { type: 'reasoning', id: 'r1', text: 'plan' },
        { type: 'text', id: 't1', text: 'Let me ' },
        { type: 'text', id: 't2', text: 'check.' },
        call('c1'),
        call('c2', { arguments: '{"raw":true}' }),
        { type: 'status', id: 's', phase: 'complete' },
        { type: 'reasoning', id: 'r2', text: 'think-tag reasoning' },
        { type: 'text', id: 't3', text: 'Answer' },
      ],
      meta: {
        [AGENT_META_KEY]: {
          steps: [
            { start: 0, reasoning: [{ field: 'reasoning_content', length: 4 }] },
            { start: 6, reasoning: [{ length: 19 }] },
          ],
        },
      },
    }
    const history: ChatMessage[] = [
      { id: 's', role: 'system', blocks: [{ type: 'system', id: 'x', text: 'Be brief.' }] },
      user('hi', [
        { url: 'data:image/png;base64,AA', mediaType: 'image/png', kind: 'image' },
        { url: 'https://f/x.pdf', mediaType: 'application/pdf', kind: 'file' },
      ]),
      assistant,
      user('thanks'),
    ]
    expect(encodeHistory(history, 'You are helpful.')).toEqual([
      { role: 'system', content: 'You are helpful.' },
      { role: 'system', content: 'Be brief.' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'hi' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AA' } },
        ],
      },
      {
        role: 'assistant',
        content: 'Let me check.',
        reasoning_content: 'plan',
        tool_calls: [
          { id: 'c1', type: 'function', function: { name: 'calc', arguments: '{"a":1}' } },
          { id: 'c2', type: 'function', function: { name: 'calc', arguments: '{"raw":true}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'c1', content: '{"value":2}' },
      { role: 'tool', tool_call_id: 'c2', content: '{"value":2}' },
      { role: 'assistant', content: 'Answer' },
      { role: 'user', content: 'thanks' },
    ])
  })

  it('skips empty steps, blank system prompts, and empty system messages', () => {
    const history: ChatMessage[] = [
      { id: 's', role: 'system', blocks: [{ type: 'text', id: 'x', text: 'From text.' }] },
      { id: 's2', role: 'system', blocks: [] },
      user('', [{ url: 'u', mediaType: 'image/png', kind: 'image' }]),
      { id: 'a', role: 'assistant', blocks: [{ type: 'status', id: 's', phase: 'pre-stream' }] },
      {
        id: 'b',
        role: 'assistant',
        blocks: [call('c', { arguments: undefined }), { type: 'reasoning', id: 'r', text: '' }],
        meta: {
          [AGENT_META_KEY]: {
            steps: [{ start: 0, reasoning: [{ field: 'reasoning', length: 0 }] }],
          },
        },
      },
    ]
    expect(encodeHistory(history, '  ')).toEqual([
      { role: 'system', content: 'From text.' },
      { role: 'user', content: [{ type: 'image_url', image_url: { url: 'u' } }] },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'c', type: 'function', function: { name: 'calc', arguments: '{}' } }],
      },
      { role: 'tool', tool_call_id: 'c', content: '{"value":2}' },
    ])
    expect(encodeHistory([])).toEqual([])
  })

  it('echoes field reasoning per field, drops think-tag text, keeps reasoning-only steps', () => {
    const message: ChatMessage = {
      id: 'a',
      role: 'assistant',
      blocks: [
        { type: 'reasoning', id: 'r1', text: 'tagAAbb' },
        { type: 'reasoning', id: 'r2', text: 'Ctag' },
      ],
      meta: {
        [AGENT_META_KEY]: {
          steps: [
            {
              start: 0,
              reasoning: [
                { length: 3 },
                { field: 'reasoning_content', length: 2 },
                { field: 'reasoning', length: 2 },
                { field: 'reasoning_content', length: 1 },
                { length: 3 },
                { field: 'reasoning', length: 4 },
              ],
            },
          ],
        },
      },
    }
    expect(encodeHistory([message])).toEqual([
      { role: 'assistant', content: '', reasoning_content: 'AAC', reasoning: 'bb' },
    ])
  })

  it('sends no reasoning without recorded segments or from think tags alone', () => {
    const blocks: ChatMessage['blocks'] = [{ type: 'reasoning', id: 'r', text: 'hidden' }]
    expect(encodeHistory([{ id: 'a', role: 'assistant', blocks }])).toEqual([])
    expect(
      encodeHistory([
        {
          id: 'a',
          role: 'assistant',
          blocks,
          meta: { [AGENT_META_KEY]: { steps: [{ start: 0, reasoning: [{ length: 6 }] }] } },
        },
      ]),
    ).toEqual([])
  })
})
