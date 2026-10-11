// @vitest-environment node
import type { ToolCallBlock } from '@fx/chat-core'
import { describe, expect, it, vi } from 'vitest'
import { FETCH_TEXT_LIMIT, TOOL_INFO, buildTools, stripHtml } from './builtin'

const ctx = {
  signal: new AbortController().signal,
  call: {
    type: 'tool_call',
    id: 'c',
    name: 'x',
    arguments: {},
    status: 'running',
  } as ToolCallBlock,
}

describe('buildTools', () => {
  it('returns only enabled tools, with approval defaulting to network tools', () => {
    const tools = buildTools({ current_time: true, fetch_url: true }, {}, { fetch: vi.fn() })
    expect(tools.map((t) => [t.name, t.requiresApproval])).toEqual([
      ['current_time', false],
      ['fetch_url', true],
    ])
    expect(
      buildTools({ calculator: true }, { calculator: true }, { fetch: vi.fn() })[0]
        ?.requiresApproval,
    ).toBe(true)
    expect(TOOL_INFO).toHaveLength(3)
  })

  it('reports the current time', async () => {
    const [time] = buildTools(
      { current_time: true },
      {},
      { fetch: vi.fn(), now: () => new Date('2026-01-02T03:04:05Z') },
    )
    expect(await time?.execute({}, ctx)).toMatchObject({ iso: '2026-01-02T03:04:05.000Z' })
  })

  it('computes with the calculator and validates arguments', async () => {
    const [calc] = buildTools({ calculator: true }, {}, { fetch: vi.fn() })
    expect(await calc?.execute({ expression: '6*7' }, ctx)).toEqual({
      expression: '6*7',
      result: 42,
    })
    expect(() => calc?.execute(null, ctx)).toThrow('"expression" must be a string')
  })

  it('fetches pages, converting HTML to text and truncating', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          '<html><head><title>T</title><style>x</style></head><body><p>Hi</p><script>bad()</script></body></html>',
          {
            headers: { 'content-type': 'text/html' },
          },
        ),
      )
      .mockResolvedValueOnce(new Response('x'.repeat(FETCH_TEXT_LIMIT + 5), { headers: {} }))
    const [fetchTool] = buildTools({ fetch_url: true }, {}, { fetch: fetchImpl })
    expect(await fetchTool?.execute({ url: 'https://a.test/' }, ctx)).toEqual({
      url: 'https://a.test/',
      status: 200,
      contentType: 'text/html',
      truncated: false,
      text: 'T\n\nHi',
    })
    expect(fetchImpl).toHaveBeenCalledWith('https://a.test/', {
      method: 'GET',
      redirect: 'manual',
      signal: ctx.signal,
    })
    const long = (await fetchTool?.execute({ url: 'http://b.test' }, ctx)) as {
      truncated: boolean
      text: string
      contentType: string
    }
    expect(long.truncated).toBe(true)
    expect(long.text).toHaveLength(FETCH_TEXT_LIMIT)
    expect(long.contentType).toBe('text/plain;charset=UTF-8')
  })

  it('never follows a redirect, naming the absolute target instead', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response('secret', { status: 302, headers: { location: '/next?q=1' } }),
      )
    const [fetchTool] = buildTools({ fetch_url: true }, {}, { fetch: fetchImpl })
    const result = await fetchTool?.execute({ url: 'https://a.test/start' }, ctx)
    expect(result).toBe(
      'The page redirects to https://a.test/next?q=1. The redirect was not followed; call fetch_url again with that URL to load it (it needs its own approval).',
    )
    expect(result).not.toContain('secret')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith('https://a.test/start', {
      method: 'GET',
      redirect: 'manual',
      signal: ctx.signal,
    })
  })

  it('reports a malformed location as an unknown target', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('secret', { status: 301, headers: { location: 'http://[' } }))
    const [fetchTool] = buildTools({ fetch_url: true }, {}, { fetch: fetchImpl })
    const result = await fetchTool?.execute({ url: 'https://a.test/start' }, ctx)
    expect(result).toMatch(/^The page redirects to an unknown location\./)
    expect(result).not.toContain('secret')
  })

  it('compares an unparseable requested URL as is instead of throwing', async () => {
    const response = (url: string) => ({
      type: 'basic',
      status: 200,
      redirected: false,
      url,
      headers: new Headers(),
      text: vi.fn().mockResolvedValue('ok'),
    })
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response('http://['))
      .mockResolvedValueOnce(response('https://a.test/'))
    const [fetchTool] = buildTools({ fetch_url: true }, {}, { fetch: fetchImpl })
    expect(await fetchTool?.execute({ url: 'http://[' }, ctx)).toMatchObject({ text: 'ok' })
    expect(await fetchTool?.execute({ url: 'http://[' }, ctx)).toMatch(
      /^The page redirects to https:\/\/a\.test\/\./,
    )
  })

  it('reports an opaque redirect without a location', async () => {
    const opaque = {
      type: 'opaqueredirect',
      status: 0,
      redirected: false,
      url: 'https://a.test/',
      headers: new Headers(),
      text: vi.fn(),
    }
    const [fetchTool] = buildTools(
      { fetch_url: true },
      {},
      { fetch: vi.fn().mockResolvedValue(opaque) },
    )
    expect(await fetchTool?.execute({ url: 'https://a.test/' }, ctx)).toMatch(
      /^The page redirects to an unknown location\./,
    )
    expect(opaque.text).not.toHaveBeenCalled()
  })

  it('withholds the body when the injected fetch followed a redirect anyway', async () => {
    const followed = (init: { redirected: boolean; url: string }) => ({
      type: 'basic',
      status: 200,
      ...init,
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: vi.fn().mockResolvedValue('internal secret'),
    })
    const moved = followed({ redirected: false, url: 'http://10.0.0.1/admin' })
    const flagged = followed({ redirected: true, url: '' })
    const fetchImpl = vi.fn().mockResolvedValueOnce(moved).mockResolvedValueOnce(flagged)
    const [fetchTool] = buildTools({ fetch_url: true }, {}, { fetch: fetchImpl })
    expect(await fetchTool?.execute({ url: 'https://a.test/' }, ctx)).toMatch(
      /^The page redirects to http:\/\/10\.0\.0\.1\/admin\./,
    )
    expect(await fetchTool?.execute({ url: 'https://a.test/' }, ctx)).toMatch(
      /^The page redirects to an unknown location\./,
    )
    expect(moved.text).not.toHaveBeenCalled()
    expect(flagged.text).not.toHaveBeenCalled()
  })

  it('returns the body when the response URL matches the request apart from normalization', async () => {
    const response = {
      type: 'basic',
      status: 200,
      redirected: false,
      url: 'https://a.test/',
      headers: new Headers(),
      text: vi.fn().mockResolvedValue('ok'),
    }
    const [fetchTool] = buildTools(
      { fetch_url: true },
      {},
      { fetch: vi.fn().mockResolvedValue(response) },
    )
    expect(await fetchTool?.execute({ url: 'https://A.test#top' }, ctx)).toMatchObject({
      status: 200,
      text: 'ok',
    })
  })

  it('rejects non-http URLs', async () => {
    const [fetchTool] = buildTools({ fetch_url: true }, {}, { fetch: vi.fn() })
    await expect(fetchTool?.execute({ url: 'file:///etc/passwd' }, ctx)).rejects.toThrow(
      'absolute http(s) URL',
    )
    await expect(fetchTool?.execute('nope', ctx)).rejects.toThrow('absolute http(s) URL')
  })
})

describe('stripHtml', () => {
  it('drops non-content elements, keeps block breaks and decodes entities', () => {
    expect(
      stripHtml(
        '<html><head><title> T </title><style>x{}</style></head><body><script>bad()</script><h1>Head</h1><p>A &amp; B&nbsp;&#65;&#x42;&bogus;</p><div>c<br>d</div></body></html>',
      ),
    ).toBe('T\n\nHead\nA & B AB&bogus;\nc\nd')
  })

  it('handles documents without a title or text', () => {
    expect(stripHtml('<p>only</p>')).toBe('only')
    expect(stripHtml('')).toBe('')
    expect(stripHtml('&#xZZ;')).toBe('&#xZZ;')
    expect(stripHtml('&#X41;&#x110000;')).toBe('A&#x110000;')
  })

  it('uses an injected converter when given', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('<p>x</p>', { headers: { 'content-type': 'text/html' } }))
    const [tool] = buildTools(
      { fetch_url: true },
      {},
      { fetch: fetchImpl, htmlToText: () => 'custom' },
    )
    expect(await tool?.execute({ url: 'https://a.test' }, ctx)).toMatchObject({ text: 'custom' })
  })

  it('treats a response without a content type as text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(new Uint8Array([60, 98, 62])))
    const [tool] = buildTools({ fetch_url: true }, {}, { fetch: fetchImpl })
    expect(await tool?.execute({ url: 'https://a.test' }, ctx)).toMatchObject({
      contentType: '',
      text: '<b>',
    })
  })

  it('defaults the clock to now', async () => {
    const [time] = buildTools({ current_time: true }, {}, { fetch: vi.fn() })
    expect(await time?.execute({}, ctx)).toHaveProperty('iso')
  })
})
