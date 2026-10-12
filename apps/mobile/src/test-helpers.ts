/** Test helpers: a fake OpenAI-compatible endpoint behind a fetch function. */
import type { FetchLike } from '@fx/chat-agent'

const encoder = new TextEncoder()

export function sseBody(deltas: Array<Record<string, unknown>>, finish = 'stop'): string {
  const chunks = [
    ...deltas.map((delta) => ({
      model: 'fake-1',
      choices: [{ index: 0, delta, finish_reason: null }],
    })),
    { model: 'fake-1', choices: [{ index: 0, delta: {}, finish_reason: finish }] },
  ]
  return `${chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('')}data: [DONE]\n\n`
}

export function sseResponse(body: string): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body))
        controller.close()
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  )
}

/**
 * A fetch that serves `/models`, answers any other non-completion URL with a
 * small HTML page (for the fetch tool), and replays one completion body per
 * `/chat/completions` request, recording request bodies.
 */
export function fakeEndpoint(
  completions: string[],
  models: Array<string | Record<string, unknown>> = ['fake-1', 'fake-2'],
) {
  const requests: Array<{ url: string; body: unknown; headers: Headers }> = []
  const fetch: FetchLike = async (url, init) => {
    requests.push({
      url,
      body: init?.body ? JSON.parse(init.body as string) : undefined,
      headers: new Headers(init?.headers),
    })
    if (url.endsWith('/models'))
      return Response.json({
        data: models.map((m) => (typeof m === 'string' ? { id: m } : m)),
      })
    if (!url.endsWith('/chat/completions')) {
      return new Response('<title>Page</title><p>page text</p>', {
        headers: { 'content-type': 'text/html' },
      })
    }
    const next = completions.shift()
    if (next === undefined) return Response.json({ error: { message: 'no more' } }, { status: 500 })
    return sseResponse(next)
  }
  return { fetch, requests }
}
