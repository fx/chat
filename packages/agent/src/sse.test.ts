// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseSSE } from './sse'
import { streamOf } from './test-helpers'

async function collect(parts: string[]): Promise<string[]> {
  const out: string[] = []
  for await (const data of parseSSE(streamOf(parts))) out.push(data)
  return out
}

describe('parseSSE', () => {
  it('yields each event data payload in order', async () => {
    expect(await collect(['data: a\n\ndata: b\n\n'])).toEqual(['a', 'b'])
  })

  it('handles events split at any byte and CRLF / CR line endings', async () => {
    const body = 'data: one\r\n\r\ndata: two\r\rdata: three\n\n'
    const parts = body.split('')
    expect(await collect(parts)).toEqual(['one', 'two', 'three'])
  })

  it('joins multi-line data, skips comments and other fields', async () => {
    expect(await collect([': keepalive\nevent: x\nid: 1\ndata: a\ndata:b\ndata\n\n'])).toEqual([
      'a\nb\n',
    ])
  })

  it('ignores blank lines with no data and flushes an unterminated final event', async () => {
    expect(await collect(['\n\ndata: tail'])).toEqual(['tail'])
    expect(await collect(['data: x\n'])).toEqual(['x'])
    expect(await collect(['data: y\r'])).toEqual(['y'])
  })

  it('cancels the stream when the consumer stops early', async () => {
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: 1\n\ndata: 2\n\n'))
      },
      cancel() {
        cancelled = true
      },
    })
    for await (const data of parseSSE(stream)) {
      expect(data).toBe('1')
      break
    }
    expect(cancelled).toBe(true)
  })
})
