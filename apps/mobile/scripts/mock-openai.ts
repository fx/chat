/**
 * A tiny OpenAI-compatible mock endpoint for developing and testing the app
 * without a real model. `bun apps/mobile/scripts/mock-openai.ts [port]`
 *
 * - `GET /v1/models` lists two models.
 * - `POST /v1/chat/completions` streams reasoning (`reasoning_content`), then:
 *   - if the last user message mentions "calc" and no tool result follows it,
 *     a `calculator` tool call;
 *   - if it mentions "fetch", a `fetch_url` tool call;
 *   - otherwise a markdown answer echoing the prompt (and any tool results).
 * - Sends usage when `stream_options.include_usage` is set. CORS is open so
 *   the browser build works too. Any key is accepted.
 */
const port = Number(process.argv[2] ?? 8787)
const encoder = new TextEncoder()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

type Msg = { role: string; content: unknown; tool_calls?: unknown[] }

function chunk(delta: Record<string, unknown>, finish: string | null = null) {
  return {
    id: 'mock',
    object: 'chat.completion.chunk',
    model: 'mock-1',
    choices: [{ index: 0, delta, finish_reason: finish }],
  }
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content))
    return content
      .map((p) => (p?.type === 'text' ? p.text : p?.type === 'image_url' ? '[image]' : ''))
      .join(' ')
  return ''
}

function plan(messages: Msg[]): Array<Record<string, unknown> | [Record<string, unknown>, string]> {
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf('user')
  const user = textOf(messages[lastUserIndex]?.content)
  const toolResults = messages.slice(lastUserIndex + 1).filter((m) => m.role === 'tool')
  const out: Array<Record<string, unknown> | [Record<string, unknown>, string]> = []
  for (const word of `Thinking about "${user.slice(0, 40)}" step by step.`.split(/(?<= )/)) {
    out.push({ reasoning_content: word })
  }
  const wantsCalc = /calc/i.test(user) && toolResults.length === 0
  const wantsFetch = /fetch/i.test(user) && toolResults.length === 0
  if (wantsCalc || wantsFetch) {
    const name = wantsCalc ? 'calculator' : 'fetch_url'
    const args = wantsCalc ? '{"expression": "(2+3)^2 / 5"}' : '{"url": "https://example.com/"}'
    out.push({
      tool_calls: [
        { index: 0, id: `call_${Date.now()}`, type: 'function', function: { name, arguments: '' } },
      ],
    })
    for (let i = 0; i < args.length; i += 6)
      out.push({ tool_calls: [{ index: 0, function: { arguments: args.slice(i, i + 6) } }] })
    out.push([{}, 'tool_calls'])
    return out
  }
  const answer = toolResults.length
    ? `The tool returned:\n\n\`\`\`json\n${String(toolResults[0]?.content).slice(0, 300)}\n\`\`\`\n\nSo that's the answer.`
    : `You said **${user || '(nothing)'}**.\n\n- This is a *mock* reply\n- with a list\n\n| a | b |\n|---|---|\n| 1 | 2 |`
  for (const word of answer.split(/(?<= )/)) out.push({ content: word })
  out.push([{}, 'stop'])
  return out
}

Bun.serve({
  port,
  hostname: '0.0.0.0',
  async fetch(req) {
    const url = new URL(req.url)
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
    if (url.pathname.endsWith('/models')) {
      return Response.json(
        {
          object: 'list',
          data: [
            { id: 'mock-1', object: 'model' },
            { id: 'mock-fast', object: 'model' },
          ],
        },
        { headers: cors },
      )
    }
    if (url.pathname.endsWith('/chat/completions') && req.method === 'POST') {
      const body = (await req.json()) as {
        messages: Msg[]
        stream_options?: { include_usage?: boolean }
        model?: string
      }
      if (body.model === 'error')
        return Response.json(
          { error: { message: 'Model "error" always fails.' } },
          { status: 400, headers: cors },
        )
      const steps = plan(body.messages)
      const delay = body.model === 'mock-fast' ? 5 : 40
      const stream = new ReadableStream({
        async start(controller) {
          const send = (obj: unknown) =>
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
          send(chunk({ role: 'assistant' }))
          for (const step of steps) {
            await sleep(delay)
            if (Array.isArray(step)) send(chunk(step[0], step[1]))
            else send(chunk(step))
          }
          if (body.stream_options?.include_usage) {
            send({
              id: 'mock',
              object: 'chat.completion.chunk',
              model: 'mock-1',
              choices: [],
              usage: {
                prompt_tokens: 12,
                completion_tokens: steps.length,
                total_tokens: 12 + steps.length,
              },
            })
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        },
      })
      return new Response(stream, {
        headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      })
    }
    return new Response('not found', { status: 404, headers: cors })
  },
})
console.log(`mock OpenAI endpoint on http://0.0.0.0:${port}/v1`)
