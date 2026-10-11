import { describe, expect, it } from 'vitest'
import * as model from './index'
import type {
  Attachment,
  ChatMessage,
  ContentBlock,
  MessageMetrics,
  ReasoningBlock,
  Role,
  StatusBlock,
  SystemBlock,
  TextBlock,
  ToolCallBlock,
  ToolMedia,
  ToolStatus,
} from './index'

describe('model barrel', () => {
  it('re-exports the codec functions', () => {
    expect(typeof model.normalizeMessage).toBe('function')
    expect(typeof model.normalizeTranscript).toBe('function')
    expect(typeof model.deepParseJson).toBe('function')
    expect(typeof model.assertChatMessage).toBe('function')
    expect(typeof model.attachmentKind).toBe('function')
    expect(typeof model.defaultToolStatus).toBe('function')
  })

  it('is importable in a non-DOM context (no document/window reference)', () => {
    // Exercising the codec without any DOM API proves the surface is pure data.
    const out = model.normalizeMessage({ id: 'm', role: 'assistant', content: 'hi' })
    model.assertChatMessage(out)
    expect(out.blocks[0]?.type).toBe('text')
  })

  it('exposes the type surface (compile-time witness)', () => {
    // These bindings exist only to assert the types are exported and assignable;
    // referencing them keeps `noUnusedLocals` happy while documenting the shape.
    const role: Role = 'user'
    const status: ToolStatus = 'pending'
    const media: ToolMedia = { kind: 'image', url: 'http://x/i.png' }
    const text: TextBlock = { type: 'text', id: 't', text: 'x' }
    const reasoning: ReasoningBlock = { type: 'reasoning', id: 'r', text: 'y' }
    const statusBlock: StatusBlock = { type: 'status', id: 's' }
    const system: SystemBlock = { type: 'system', id: 'sy', text: 'z' }
    const tool: ToolCallBlock = { type: 'tool_call', id: 'tc', name: 'n', arguments: {}, status }
    const block: ContentBlock = text
    const attachment: Attachment = { url: 'u', mediaType: 'image/png', kind: 'image' }
    const metrics: MessageMetrics = { durationMs: 1 }
    const message: ChatMessage = {
      id: 'm',
      role,
      blocks: [block, reasoning, statusBlock, system, tool],
    }

    expect(message.blocks).toHaveLength(5)
    expect([role, status, media, attachment, metrics]).toBeDefined()
  })
})
