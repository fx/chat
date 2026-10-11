/**
 * Cross-renderer parity: the same conversation rendered by `@fx/chat` (DOM)
 * and `@fx/chat-ink` (terminal) shows the same group summaries, durations and
 * footer metrics — both project the shared core render plan.
 */
import { ChatProvider, MessageLog } from '@fx/chat'
import type { ChatMessage } from '@fx/chat-core'
import { render } from '@testing-library/react'
import { renderToString } from 'ink'
import { describe, expect, it } from 'vitest'
import { Transcript } from './Transcript'
import { InkChatProvider } from './registry'

const conversation: ChatMessage[] = [
  { id: 'u', role: 'user', blocks: [{ type: 'text', id: 'u1', text: 'what is 6*7?' }] },
  {
    id: 'a',
    role: 'assistant',
    createdAt: 1000,
    metrics: { model: 'm-1', durationMs: 3200, tokensPerSecond: 21.5 },
    blocks: [
      { type: 'reasoning', id: 'r1', text: 'multiply', startedAt: 1000, durationMs: 2400 },
      {
        type: 'tool_call',
        id: 't1',
        name: 'calculator',
        arguments: { expression: '6*7' },
        result: { result: 42 },
        status: 'success',
        durationMs: 12,
      },
      { type: 'reasoning', id: 'r2', text: 'done', startedAt: 3300, durationMs: 400 },
      { type: 'text', id: 'x1', text: 'It is 42.' },
    ],
  },
]

describe('renderer parity', () => {
  it('shows the same summary label, count, durations and metrics in DOM and terminal', () => {
    const dom = render(
      <ChatProvider>
        <MessageLog messages={conversation} showFooter />
      </ChatProvider>,
    )
    const domText = dom.container.textContent ?? ''
    const term = renderToString(
      <InkChatProvider>
        <Transcript messages={conversation} />
      </InkChatProvider>,
      { columns: 100 },
    )
    // The footer's arrangement is each renderer's own (DOM keeps its metrics
    // line; the terminal draws planned facts), but every value agrees.
    for (const expected of ['Thought for 0.4s', '(+2)', 'It is 42.', 'm-1', '3.2s', '21.5 tok/s']) {
      expect(domText).toContain(expected)
      expect(term).toContain(expected)
    }
  })

  it('agrees on tool titles, inputs, approval qualifiers and error outcomes', () => {
    const turn: ChatMessage[] = [
      {
        id: 'a',
        role: 'assistant',
        blocks: [
          {
            type: 'tool_call',
            id: 't',
            name: 'shell',
            title: 'Run tests',
            arguments: { command: 'npm test' },
            status: 'error',
            approval: { state: 'denied' },
          },
          { type: 'text', id: 'x', text: 'Could not run.' },
        ],
        outcome: { kind: 'error', message: 'HTTP 500: down' },
      },
    ]
    const domText =
      render(
        <ChatProvider>
          <MessageLog messages={turn} showFooter />
        </ChatProvider>,
      ).container.textContent ?? ''
    const term = renderToString(
      <InkChatProvider>
        <Transcript messages={turn} />
      </InkChatProvider>,
      { columns: 100 },
    )
    for (const expected of ['Run tests', 'npm test', 'denied', 'HTTP 500: down']) {
      expect(domText).toContain(expected)
      expect(term).toContain(expected)
    }
  })

  it('agrees on the live tail’s earlier label and a lone activity block after content', () => {
    const live: ChatMessage = {
      id: 'l',
      role: 'assistant',
      createdAt: 1000,
      blocks: [
        { type: 'reasoning', id: 'r', text: 'hmm', durationMs: 400 },
        { type: 'tool_call', id: 't1', name: 'a', arguments: {}, status: 'success' },
        { type: 'text', id: 'x', text: 'hi' },
        { type: 'tool_call', id: 't2', name: 'b', arguments: {}, status: 'running' },
      ],
    }
    const domLive =
      render(
        <ChatProvider>
          <MessageLog messages={[live]} isStreaming streamingMessageId="l" liveTail={1} />
        </ChatProvider>,
      ).container.textContent ?? ''
    const termLive = renderToString(
      <InkChatProvider>
        <Transcript messages={[live]} isStreaming streamingMessageId="l" liveTail={1} />
      </InkChatProvider>,
      { columns: 100 },
    )
    expect(domLive).toContain('+2 earlier steps (1 tool call)')
    expect(termLive).toContain('+2 earlier steps (1 tool call)')

    const done: ChatMessage = {
      id: 'd',
      role: 'assistant',
      blocks: [
        { type: 'reasoning', id: 'r', text: 'hmm', durationMs: 400 },
        { type: 'text', id: 'x', text: 'hi' },
      ],
    }
    const domDone =
      render(
        <ChatProvider>
          <MessageLog messages={[done]} activityPlacement="after-content" />
        </ChatProvider>,
      ).container.textContent ?? ''
    const termDone = renderToString(
      <InkChatProvider>
        <Transcript messages={[done]} activityPlacement="after-content" />
      </InkChatProvider>,
      { columns: 100 },
    )
    for (const out of [domDone, termDone]) {
      expect(out.split('Thought for 0.4s')).toHaveLength(2)
      expect(out).not.toContain('(+')
    }
  })
})
