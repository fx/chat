/** Test helpers: a fake OpenAI-compatible endpoint and ink-testing-library keys. */
import type { FetchLike } from '@fx/chat-agent'

const encoder = new TextEncoder()

export function sseBody(
  deltas: Array<Record<string, unknown>>,
  finish = 'stop',
  delayMs = 0,
  signal?: AbortSignal,
): Response {
  const chunks = [
    ...deltas.map((delta) => ({
      model: 'fake-1',
      choices: [{ index: 0, delta, finish_reason: null }],
    })),
    { model: 'fake-1', choices: [{ index: 0, delta: {}, finish_reason: finish }] },
  ]
  let i = 0
  return new Response(
    new ReadableStream({
      async pull(controller) {
        // Like a real body, an abort ends the wait.
        if (delayMs)
          await new Promise((r) => {
            const timer = setTimeout(r, delayMs)
            signal?.addEventListener('abort', () => {
              clearTimeout(timer)
              r(undefined)
            })
          })
        if (signal?.aborted) return controller.error(new DOMException('aborted', 'AbortError'))
        if (i < chunks.length)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunks[i++])}\n\n`))
        else {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        }
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  )
}

/** Serves /models and replays one completion per request; other URLs get a small page. */
export function fakeEndpoint(
  completions: Array<(signal?: AbortSignal) => Response>,
  models = ['fake-1', 'fake-2'],
) {
  const requests: Array<{ url: string; body: unknown }> = []
  const fetch: FetchLike = async (url, init) => {
    requests.push({ url, body: init?.body ? JSON.parse(init.body as string) : undefined })
    if (url.endsWith('/models')) return Response.json({ data: models.map((id) => ({ id })) })
    if (!url.endsWith('/chat/completions'))
      return new Response('<title>Page</title><p>text</p>', {
        headers: { 'content-type': 'text/html' },
      })
    const next = completions.shift()
    if (!next) return Response.json({ error: { message: 'no more' } }, { status: 500 })
    return next(init?.signal ?? undefined)
  }
  return { fetch, requests }
}

export const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms))

export const KEYS = {
  enter: '\r',
  escape: '\u001b',
  down: '\u001b[B',
  tab: '\t',
  ctrl: (c: string) => String.fromCharCode(c.charCodeAt(0) - 96),
}
