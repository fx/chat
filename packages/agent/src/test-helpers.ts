/** Test helpers: build streaming `Response`s from SSE payloads. */
const encoder = new TextEncoder()

/** A byte stream emitting `parts` in order (each part is one read). */
export function streamOf(parts: string[]): ReadableStream<Uint8Array> {
  let i = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < parts.length) controller.enqueue(encoder.encode(parts[i++] as string))
      else controller.close()
    },
  })
}

/** SSE text for a sequence of JSON chunks, terminated by `[DONE]`. */
export function sse(chunks: unknown[], done = true): string {
  return (
    chunks.map((c) => `data: ${typeof c === 'string' ? c : JSON.stringify(c)}\n\n`).join('') +
    (done ? 'data: [DONE]\n\n' : '')
  )
}

/** A chunk with a single choice delta. */
export function delta(
  d: Record<string, unknown>,
  finish: string | null = null,
  extra = {},
): unknown {
  return { model: 'm-1', choices: [{ index: 0, delta: d, finish_reason: finish }], ...extra }
}

/** A streaming SSE `Response`, optionally split into several reads. */
export function sseResponse(body: string, splitEvery?: number): Response {
  const parts: string[] = []
  if (splitEvery)
    for (let i = 0; i < body.length; i += splitEvery) parts.push(body.slice(i, i + splitEvery))
  else parts.push(body)
  return new Response(streamOf(parts), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

/** SSE text for one completion of choice deltas, ending with `finish`. */
export function sseBody(deltas: Array<Record<string, unknown>>, finish = 'stop'): string {
  return sse([...deltas.map((d) => delta(d)), delta({}, finish)])
}

/**
 * A fetch that serves `/models`, answers any other non-completion URL with a
 * small HTML page (for the fetch tool), and replays one completion body per
 * `/chat/completions` request, recording requests.
 */
export function fakeEndpoint(completions: string[], models = ['fake-1', 'fake-2']) {
  const requests: Array<{ url: string; body: unknown; headers: Headers }> = []
  const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    requests.push({
      url,
      body: init?.body ? JSON.parse(init.body as string) : undefined,
      headers: new Headers(init?.headers),
    })
    if (url.endsWith('/models')) return Response.json({ data: models.map((id) => ({ id })) })
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
