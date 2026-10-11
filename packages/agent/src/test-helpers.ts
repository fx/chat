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
