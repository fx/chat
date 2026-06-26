/**
 * Fixture + streaming-builder unit tests.
 */
import { describe, expect, it } from 'vitest'
import {
  FIXTURE_EPOCH,
  STREAM_DURATION_MS,
  STREAM_TEXT,
  STREAM_TOKEN_COUNT,
  buildStreamingConversation,
  resolvedConversation,
} from './conversation'

describe('resolvedConversation fixture', () => {
  it('exercises the required render surfaces', () => {
    const [user, assistant] = resolvedConversation
    // User message: a mention + image & file attachments + a long URL.
    expect(user.role).toBe('user')
    expect(user.blocks[0]).toMatchObject({ type: 'text' })
    expect((user.blocks[0] as { text: string }).text).toContain('@analyst')
    expect((user.blocks[0] as { text: string }).text).toMatch(/https?:\/\/\S{60,}/)
    expect(user.attachments?.map((a) => a.kind)).toEqual(['image', 'file'])

    // Assistant turn: reasoning + 2 tool_calls (success+media, error) + status + md.
    const kinds = assistant.blocks.map((b) => b.type)
    expect(kinds).toEqual(['reasoning', 'tool_call', 'tool_call', 'status', 'text'])
    const tools = assistant.blocks.filter((b) => b.type === 'tool_call') as Array<{
      status: string
      media?: unknown[]
    }>
    expect(tools[0]).toMatchObject({ status: 'success' })
    expect(tools[0].media).toHaveLength(1)
    expect(tools[1]).toMatchObject({ status: 'error' })
    // The answer is markdown.
    expect(assistant.blocks.at(-1)).toMatchObject({ type: 'text', markdown: true })
  })

  it('carries no http(s) URL that points at a backend (data URIs only for media)', () => {
    for (const a of resolvedConversation.flatMap((m) => m.attachments ?? [])) {
      expect(a.url.startsWith('data:')).toBe(true)
    }
  })
})

describe('buildStreamingConversation', () => {
  it('reveals a growing prefix while streaming and finalizes at the end', () => {
    const early = buildStreamingConversation(FIXTURE_EPOCH, FIXTURE_EPOCH + 600)
    const mid = buildStreamingConversation(FIXTURE_EPOCH, FIXTURE_EPOCH + STREAM_DURATION_MS / 2)
    const end = buildStreamingConversation(FIXTURE_EPOCH, FIXTURE_EPOCH + STREAM_DURATION_MS)

    expect(early.isStreaming).toBe(true)
    expect(mid.isStreaming).toBe(true)
    expect(end.isStreaming).toBe(false)

    const text = (c: ReturnType<typeof buildStreamingConversation>) =>
      (c.messages[1].blocks.find((b) => b.type === 'text') as { text: string }).text

    // Monotonic growth toward the full text.
    expect(text(early).length).toBeLessThan(text(mid).length)
    expect(text(mid).length).toBeLessThanOrEqual(text(end).length)
    expect(text(end)).toBe(STREAM_TEXT)
  })

  it('marks the streaming status while active and complete when finalized', () => {
    const active = buildStreamingConversation(FIXTURE_EPOCH, FIXTURE_EPOCH + 100)
    const done = buildStreamingConversation(FIXTURE_EPOCH, FIXTURE_EPOCH + STREAM_DURATION_MS)
    const statusOf = (c: ReturnType<typeof buildStreamingConversation>) =>
      c.messages[1].blocks.find((b) => b.type === 'status') as { phase: string }
    expect(statusOf(active).phase).toBe('streaming')
    expect(statusOf(done).phase).toBe('complete')
  })

  it('places the live status row as the trailing block while streaming so it activates', () => {
    // The renderer treats only the TRAILING block of an active message as the
    // streaming one, so the status row must be last while streaming.
    const active = buildStreamingConversation(FIXTURE_EPOCH, FIXTURE_EPOCH + 100)
    expect(active.messages[1].blocks.at(-1)?.type).toBe('status')
    // Once complete, the answer text is the final visible content (status above).
    const done = buildStreamingConversation(FIXTURE_EPOCH, FIXTURE_EPOCH + STREAM_DURATION_MS)
    expect(done.messages[1].blocks.at(-1)?.type).toBe('text')
  })

  it('surfaces a live tokens/sec while streaming and a finalized rate when done', () => {
    const active = buildStreamingConversation(FIXTURE_EPOCH, FIXTURE_EPOCH + 1000)
    expect(active.messages[1].metrics?.tokensPerSecond).toBeGreaterThan(0)
    const done = buildStreamingConversation(FIXTURE_EPOCH, FIXTURE_EPOCH + STREAM_DURATION_MS)
    // Finalized: usage + duration let the library derive a frozen rate.
    expect(done.messages[1].metrics?.usage?.completion).toBe(STREAM_TOKEN_COUNT)
    expect(done.messages[1].metrics?.durationMs).toBe(STREAM_DURATION_MS)
  })

  it('clamps a now earlier than the start to the beginning of the stream', () => {
    const before = buildStreamingConversation(FIXTURE_EPOCH, FIXTURE_EPOCH - 5000)
    expect(before.isStreaming).toBe(true)
    const text = (before.messages[1].blocks.find((b) => b.type === 'text') as { text: string }).text
    expect(text.length).toBeGreaterThanOrEqual(1)
  })

  it('createdAt is anchored to the provided real start time (for the live timer)', () => {
    const realStart = 1_750_000_000_000
    const c = buildStreamingConversation(realStart, realStart + 500)
    expect(c.messages[1].createdAt).toBe(realStart)
  })
})
