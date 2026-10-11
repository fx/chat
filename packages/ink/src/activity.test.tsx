// @vitest-environment node
import type { ChatMessage } from '@fx/chat-core'
import { renderToString } from 'ink'
import { describe, expect, it } from 'vitest'
import { MessageView } from './MessageView'
import { Transcript } from './Transcript'
import { InkChatProvider } from './registry'

const str = (node: React.ReactElement) =>
  renderToString(<InkChatProvider>{node}</InkChatProvider>, { columns: 100 }).trimEnd()

describe('agent activity in the terminal', () => {
  it('labels tools by title with input and approval qualifier', () => {
    const message: ChatMessage = {
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
          result: { error: 'declined' },
        },
        {
          type: 'tool_call',
          id: 'u',
          name: 'shell',
          title: 'Plain',
          arguments: {},
          status: 'success',
          approval: { state: 'approved' },
        },
        { type: 'text', id: 'x', text: 'ok' },
      ],
    }
    const out = str(<MessageView message={message} expanded />)
    expect(out).toContain('⚒ Run tests npm test ✗ Error · denied')
    expect(out).toContain('"error": "declined"')
    expect(out).toContain('⚒ Plain')
    expect(out).not.toContain('Plain ·')
  })

  it('shows error outcomes inside the message and a footer for stopped turns, with a retry hint', () => {
    const failed: ChatMessage = {
      id: 'f',
      role: 'assistant',
      blocks: [{ type: 'tool_call', id: 't', name: 'x', arguments: {}, status: 'running' }],
      outcome: { kind: 'error', message: 'HTTP 500: down' },
      metrics: { model: 'm' },
    }
    const stopped: ChatMessage = {
      id: 's',
      role: 'assistant',
      blocks: [],
      outcome: { kind: 'stopped' },
    }
    const out = str(<Transcript messages={[failed, stopped]} retryHint="/retry" />)
    expect(out).toContain('✗ HTTP 500: down')
    expect(out).toContain('failed · ⚒ 1 tool · m · /retry')
    expect(out).toContain('stopped · /retry')
    expect(out).not.toContain('⠋')
    expect(str(<MessageView message={stopped} />)).toBe('• stopped')
  })
})

describe('plan in the terminal', () => {
  it('lists entries with per-status glyphs when expanded', () => {
    const message: ChatMessage = {
      id: 'p',
      role: 'assistant',
      blocks: [
        {
          type: 'plan',
          id: 'p',
          entries: [
            { id: 'a', content: 'Read', status: 'completed' },
            { content: 'Write', status: 'in_progress' },
            { content: 'Test', status: 'pending' },
          ],
        },
        { type: 'plan', id: 'q', entries: [] },
      ],
    }
    const out = str(<MessageView message={message} expanded isActive />)
    expect(out).toContain('☑ Plan 1/3')
    expect(out).toContain('✓ Read')
    expect(out).toContain('… Write')
    expect(out).toContain('· Test')
    expect(str(<MessageView message={message} />)).toContain('(+1) ☑ Plan')
  })
})

describe('activity planning in the terminal', () => {
  const live: ChatMessage = {
    id: 'l',
    role: 'assistant',
    createdAt: 1000,
    blocks: [
      { type: 'reasoning', id: 'r', text: 'hmm', durationMs: 5 },
      { type: 'tool_call', id: 't1', name: 'a', arguments: {}, status: 'success' },
      { type: 'text', id: 'x', text: 'hi' },
      { type: 'tool_call', id: 't2', name: 'b', arguments: {}, status: 'running' },
    ],
  }

  it('shows a live tail and the opt-in live footer ticking by the second', async () => {
    const { render } = await import('ink-testing-library')
    const { vi } = await import('vitest')
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'],
    })
    vi.setSystemTime(13_400)
    const view = render(
      <InkChatProvider>
        <Transcript messages={[live]} isStreaming streamingMessageId="l" liveTail={1} liveFooter />
      </InkChatProvider>,
    )
    expect(view.lastFrame()).toContain('⚒ +2 earlier')
    expect(view.lastFrame()).toContain('12s · ∴ 3 · ⚒ 2 tools')
    await vi.advanceTimersByTimeAsync(1000)
    expect(view.lastFrame()).toContain('13s ·')
    view.unmount()
    vi.useRealTimers()
  })

  it('places activity after content and hides activity facts when expanded', () => {
    const done: ChatMessage = {
      ...live,
      blocks: live.blocks.slice(0, 3),
      metrics: { durationMs: 2000, context: { used: 1200, size: 8000 } },
    }
    const out = str(<MessageView message={done} activityPlacement="after-content" expanded />)
    expect(out.indexOf('hi')).toBeLessThan(out.indexOf('Thought'))
    expect(out).toContain('2.0s · ctx 1.2k/8k')
    const empty = str(
      <MessageView message={{ id: 'e', role: 'assistant', blocks: [] }} isActive liveFooter />,
    )
    expect(empty).not.toContain('·')
  })
})

describe('transcript options', () => {
  it('passes placement through to finished messages', () => {
    const done: ChatMessage = {
      id: 'd',
      role: 'assistant',
      blocks: [
        { type: 'reasoning', id: 'r', text: 'x', durationMs: 5 },
        { type: 'text', id: 't', text: 'answer' },
      ],
    }
    const out = str(<Transcript messages={[done]} activityPlacement="after-content" />)
    expect(out.indexOf('answer')).toBeLessThan(out.indexOf('Thought'))
  })
})
