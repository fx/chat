import { describe, expect, it } from 'vitest'
import { assertChatMessage, normalizeMessage } from './codec'

const base = { id: 'm', role: 'assistant', blocks: [] as unknown[] }
const tool = (extra: Record<string, unknown>) => ({
  ...base,
  blocks: [{ type: 'tool_call', id: 't', name: 'n', arguments: {}, status: 'error', ...extra }],
})

describe('agent-activity fields', () => {
  it('carries tool, attachment and outcome fields through the codec', () => {
    const message = normalizeMessage({
      id: 'm',
      role: 'assistant',
      toolCalls: [
        {
          id: 't',
          name: 'fs_read',
          arguments: '{"path":"a"}',
          status: 'error',
          title: 'Read a',
          kind: 'read',
          inputSummary: 'a',
          approval: { state: 'denied', label: 'deny' },
        },
      ],
      attachments: [
        { url: 'u', mediaType: 'image/png', name: 'x.png', description: 'x · 2 KB', size: 2048 },
      ],
      outcome: { kind: 'error', message: 'boom', retryable: true },
      metrics: { cost: { amount: 0.02 }, context: { used: 100, size: 1000 } },
    })
    expect(message.blocks[0]).toMatchObject({
      title: 'Read a',
      kind: 'read',
      inputSummary: 'a',
      approval: { state: 'denied', label: 'deny' },
    })
    expect(message.attachments?.[0]).toMatchObject({ description: 'x · 2 KB', size: 2048 })
    expect(message.outcome).toEqual({ kind: 'error', message: 'boom', retryable: true })
    expect(() => assertChatMessage(message)).not.toThrow()
    expect(() => assertChatMessage({ ...base, outcome: { kind: 'stopped' } })).not.toThrow()
  })

  it.each([
    [tool({ title: 1 }), 'title must be a string'],
    [tool({ kind: 2 }), 'kind must be a string'],
    [tool({ inputSummary: 3 }), 'inputSummary must be a string'],
    [tool({ approval: 'yes' }), 'approval.state'],
    [tool({ approval: null }), 'approval.state'],
    [tool({ approval: { state: 'maybe' } }), 'approval.state'],
    [tool({ approval: { state: 'approved', label: 4 } }), 'approval.label'],
    [{ ...base, outcome: 'x' }, 'outcome must be an object'],
    [{ ...base, outcome: null }, 'outcome must be an object'],
    [{ ...base, outcome: { kind: 'error' } }, 'outcome must be'],
    [{ ...base, outcome: { kind: 'other' } }, 'outcome must be'],
    [{ ...base, outcome: { kind: 'error', message: 'm', retryable: 'y' } }, 'retryable'],
    [{ ...base, metrics: { cost: 1 } }, 'metrics.cost'],
    [{ ...base, metrics: { cost: null } }, 'metrics.cost'],
    [{ ...base, metrics: { cost: { amount: 1, currency: 2 } } }, 'currency'],
    [{ ...base, metrics: { context: { size: 1 } } }, 'metrics.context'],
    [{ ...base, metrics: { context: null } }, 'metrics.context'],
    [{ ...base, metrics: { context: { used: 1, size: 'x' } } }, 'context.size'],
    [
      { ...base, attachments: [{ url: 'u', mediaType: 'm', kind: 'file', description: 1 }] },
      'description',
    ],
    [{ ...base, attachments: [{ url: 'u', mediaType: 'm', kind: 'file', size: '1' }] }, 'size'],
  ])('rejects malformed fields (%#)', (value, message) => {
    expect(() => assertChatMessage(value)).toThrow(message)
  })
})
