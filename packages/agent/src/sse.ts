/**
 * Incremental Server-Sent Events parser.
 *
 * Yields the `data` payload of each event, in order, as soon as its
 * terminating blank line arrives. Handles `\n`, `\r\n` and `\r` line endings,
 * multi-line `data:` fields (joined with `\n`), comment lines, other fields
 * (ignored), and a final event left unterminated at end of stream.
 */
export async function* parseSSE(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let data: string[] = []

  function* takeLines(final: boolean): Generator<string> {
    for (;;) {
      const match = /\r\n|\r|\n/.exec(buffer)
      // A lone trailing `\r` may be the first half of `\r\n`; wait for more.
      if (!match || (match[0] === '\r' && match.index === buffer.length - 1 && !final)) {
        if (final && buffer.length > 0) {
          const line = buffer
          buffer = ''
          yield* handleLine(line)
        }
        return
      }
      const line = buffer.slice(0, match.index)
      buffer = buffer.slice(match.index + match[0].length)
      yield* handleLine(line)
    }
  }

  function* handleLine(line: string): Generator<string> {
    if (line === '') {
      if (data.length > 0) yield data.join('\n')
      data = []
      return
    }
    if (line.startsWith(':')) return
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    if (field !== 'data') return
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    data.push(value)
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      yield* takeLines(false)
    }
    buffer += decoder.decode()
    yield* takeLines(true)
    if (data.length > 0) yield data.join('\n')
  } finally {
    // Cancelling also tears down the body when the consumer stops early.
    await reader.cancel().catch(() => {})
  }
}
