/**
 * Local conversation fixtures.
 *
 * These are static `ChatMessage[]` values bundled at build time — the demo makes
 * NO runtime network request. The fixtures exercise the breadth of the render
 * surface so every registry adapter is shown rendering the same data: a user
 * message with a mention, attachments, and a long URL; an assistant turn with
 * reasoning, a grouped multi-tool run (one success with media, one error), a
 * status row, and a markdown answer; and a separately-built actively-streaming
 * message driven from synthetic timestamps.
 */
import type { ChatMessage, StatusBlock, TextBlock } from '@fx/chat'

/**
 * A fixed wall-clock anchor (epoch ms) all fixture timestamps derive from, so a
 * build is deterministic and never reads the real clock. `2026-01-01T00:00:00Z`.
 */
export const FIXTURE_EPOCH = Date.UTC(2026, 0, 1, 0, 0, 0)

/** A deliberately long URL to exercise wrapping/overflow in user prose. */
const LONG_URL =
  'https://example.com/datasets/quarterly/2025/q4/aggregate-report-with-a-very-long-path-segment?ref=demo&page=1&sort=desc'

/** Inline data-URI image so the media affordance renders with no network. */
const SAMPLE_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100">' +
    '<rect width="160" height="100" fill="#2563eb"/>' +
    '<text x="80" y="56" font-family="sans-serif" font-size="14" fill="#fff" ' +
    'text-anchor="middle">chart.png</text></svg>',
)}`

/**
 * The primary, fully-resolved conversation. Covers: user text with an
 * `@mention`, image + file attachments, and a long URL; then an assistant turn
 * with reasoning + two tool calls (success-with-media and an error) + a status
 * row that group into a `+N` disclosure, followed by a bare markdown answer.
 */
export const resolvedConversation: ChatMessage[] = [
  {
    id: 'u1',
    role: 'user',
    createdAt: FIXTURE_EPOCH,
    blocks: [
      {
        type: 'text',
        id: 'u1-t',
        text: `@analyst summarize the attached chart and the report at ${LONG_URL}`,
      },
    ],
    attachments: [
      { url: SAMPLE_IMAGE, mediaType: 'image/svg+xml', kind: 'image', name: 'chart.png' },
      {
        url: 'data:text/plain;base64,cmVwb3J0',
        mediaType: 'text/plain',
        kind: 'file',
        name: 'q4-report.txt',
      },
    ],
  },
  {
    id: 'a1',
    role: 'assistant',
    createdAt: FIXTURE_EPOCH + 500,
    blocks: [
      {
        type: 'reasoning',
        id: 'a1-r',
        text: 'Read the chart, then the linked report, then reconcile the totals.',
        durationMs: 1800,
      },
      {
        type: 'tool_call',
        id: 'a1-tc1',
        name: 'render_chart',
        arguments: { series: 'revenue', period: 'Q4' },
        result: { ok: true, points: 13 },
        status: 'success',
        startedAt: FIXTURE_EPOCH + 800,
        durationMs: 1400,
        media: [{ kind: 'image', url: SAMPLE_IMAGE }],
      },
      {
        type: 'tool_call',
        id: 'a1-tc2',
        name: 'fetch_report',
        arguments: { url: LONG_URL },
        result: { error: 'HTTP 504 Gateway Timeout' },
        status: 'error',
        startedAt: FIXTURE_EPOCH + 2300,
        durationMs: 900,
      },
      { type: 'status', id: 'a1-s', phase: 'complete' },
      {
        type: 'text',
        id: 'a1-t',
        markdown: true,
        text: [
          'Revenue rose in **Q4**, driven by the `enterprise` tier.',
          '',
          'Key points:',
          '',
          '- Chart rendered from 13 data points.',
          '- The linked report could not be fetched (`HTTP 504`).',
          '',
          '```ts',
          'const growth = (q4 - q3) / q3',
          '```',
          '',
          'See the [source dataset](https://example.com/datasets) for details.',
        ].join('\n'),
      },
    ],
    metrics: {
      model: 'demo-model',
      durationMs: 4200,
      usage: { prompt: 320, completion: 148, total: 468 },
    },
  },
]

/**
 * The number of synthetic milliseconds the streaming answer spans end-to-end.
 * The streaming driver advances a virtual clock across this window.
 */
export const STREAM_DURATION_MS = 6000

/** Synthetic token count produced by the streaming answer, for tokens/sec. */
export const STREAM_TOKEN_COUNT = 96

/** The full streamed answer text, revealed progressively by the driver. */
export const STREAM_TEXT =
  'Streaming the answer now. The live timer and tokens-per-second pill update ' +
  'from synthetic timestamps, with no backend involved.'

/**
 * Build the streaming conversation for a real start time and current instant.
 *
 * BOTH `startMs` and `nowMs` are real epoch-ms values: the streaming driver
 * passes `Date.now()`-derived values, so the assistant message's `createdAt`
 * (`= startMs`) lines up with the library's `useElapsedTimer`, which derives the
 * live timer from `Date.now() - createdAt`. Tests pass explicit values for
 * determinism. The text reveal and the synthetic tokens/sec are driven from the
 * same `nowMs - startMs` elapsed window, so the live timer and the revealed text
 * stay in agreement. When `nowMs - startMs` reaches {@link STREAM_DURATION_MS}
 * the message is finalized with metrics so the rate freezes.
 */
export function buildStreamingConversation(
  startMs: number,
  nowMs: number = startMs,
): {
  messages: ChatMessage[]
  streamingMessageId: string
  isStreaming: boolean
} {
  const start = startMs
  const elapsed = Math.max(0, nowMs - start)
  const ratio = Math.min(1, elapsed / STREAM_DURATION_MS)
  const isStreaming = ratio < 1
  const revealed = STREAM_TEXT.slice(0, Math.max(1, Math.round(STREAM_TEXT.length * ratio)))

  const statusBlock: StatusBlock = isStreaming
    ? { type: 'status', id: 'stream-s', phase: 'streaming' }
    : { type: 'status', id: 'stream-s', phase: 'complete' }
  const textBlock: TextBlock = { type: 'text', id: 'stream-t', markdown: true, text: revealed }

  // While streaming, the live status row must be the TRAILING block so the
  // renderer (which treats only the trailing block of an active message as the
  // streaming one) shows its "Generating…" label, live timer, and tok/s pill.
  // Once complete, the answer text is the final visible content, so the status
  // row sits above it.
  const blocks: ChatMessage['blocks'] = isStreaming
    ? [textBlock, statusBlock]
    : [statusBlock, textBlock]

  // A synthetic live tokens/sec while streaming (revealed tokens over elapsed
  // seconds), and a finalized metrics bag once complete so the rate freezes.
  const revealedTokens = Math.max(1, Math.round(STREAM_TOKEN_COUNT * ratio))
  const liveRate = elapsed > 0 ? revealedTokens / (elapsed / 1000) : undefined

  const assistant: ChatMessage = {
    id: 'stream-a',
    role: 'assistant',
    createdAt: start,
    blocks,
    metrics: isStreaming
      ? {
          model: 'demo-model',
          ...(liveRate !== undefined ? { tokensPerSecond: liveRate } : {}),
        }
      : {
          model: 'demo-model',
          durationMs: STREAM_DURATION_MS,
          usage: { completion: STREAM_TOKEN_COUNT },
        },
  }

  return {
    messages: [
      {
        id: 'stream-u',
        role: 'user',
        createdAt: start - 1000,
        blocks: [{ type: 'text', id: 'stream-ut', text: 'Show me a live streaming response.' }],
      },
      assistant,
    ],
    streamingMessageId: 'stream-a',
    isStreaming,
  }
}

/**
 * The catalog of selectable fixtures, by id.
 *
 * NOTE: `streaming.messages` is intentionally empty — the streaming fixture is
 * not a static array. Its live messages are produced per-tick by
 * {@link useStreamingDriver} via {@link buildStreamingConversation}, so a
 * consumer must drive it through the hook rather than render `.messages`
 * directly. The empty array is a placeholder kept only so both fixtures share
 * the same shape in the switcher.
 */
export const FIXTURES = {
  resolved: { id: 'resolved', label: 'Resolved turn', messages: resolvedConversation },
  streaming: { id: 'streaming', label: 'Streaming', messages: [] as ChatMessage[] },
} as const

/** A selectable fixture id. */
export type FixtureId = keyof typeof FIXTURES
