import { describe, expect, it } from 'vitest'
import { type JsonNode, layoutJson, looksLikeJson, parseLooseJson, prettyJson } from './index'

const rows = (text: string, options?: Parameters<typeof layoutJson>[1]) =>
  layoutJson(parseLooseJson(text).node, options).map(
    (r) =>
      `${'  '.repeat(r.depth)}${r.text}${r.toggle ? ` [${r.toggle.path} ${r.toggle.open ? 'open' : 'closed'} ${r.toggle.size}]` : ''}`,
  )

describe('looksLikeJson', () => {
  it.each([
    ['{"a":1}', true],
    ['  [1, 2]', true],
    ['[]', true],
    ['["x"]', true],
    ['[{"a":1}]', true],
    ['[true]', true],
    ['[-1]', true],
    ['[glob] 0 matches', false],
    ['[', false],
    ['plain', false],
    ['"string"', false],
  ])('%s → %s', (text, expected) => {
    expect(looksLikeJson(text)).toBe(expected)
  })
})

describe('parseLooseJson', () => {
  it('parses complete values with trailing text as rest', () => {
    const { node, rest } = parseLooseJson(
      '  {"a": [1, true, null, "s\\n\\u0041\\"x"], "b": {}}  then text',
    )
    expect(node).toEqual({
      t: 'obj',
      closed: true,
      entries: [
        [
          'a',
          {
            t: 'arr',
            closed: true,
            items: [
              { t: 'lit', v: '1' },
              { t: 'lit', v: 'true' },
              { t: 'lit', v: 'null' },
              { t: 'str', v: 's\nA"x', closed: true },
            ],
          },
        ],
        ['b', { t: 'obj', closed: true, entries: [] }],
      ],
    })
    expect(rest).toBe('then text')
  })

  it('ends unfinished values without throwing', () => {
    expect(parseLooseJson('{"a": [1, {"b": "cut').node).toEqual({
      t: 'obj',
      closed: false,
      entries: [
        [
          'a',
          {
            t: 'arr',
            closed: false,
            items: [
              { t: 'lit', v: '1' },
              { t: 'obj', closed: false, entries: [['b', { t: 'str', v: 'cut', closed: false }]] },
            ],
          },
        ],
      ],
    })
    expect(parseLooseJson('{"a": 1,').node).toMatchObject({ closed: false })
    expect(parseLooseJson('{"a"').node).toMatchObject({ closed: false, entries: [] })
    expect(parseLooseJson('{"a":').node).toMatchObject({ closed: false, entries: [] })
    expect(parseLooseJson('{oops: 1}').node).toMatchObject({ t: 'obj', closed: false })
    expect(parseLooseJson('["a\\').node).toMatchObject({
      t: 'arr',
      items: [{ t: 'str', v: 'a', closed: false }],
    })
    expect(parseLooseJson('"\\u12').node).toEqual({ t: 'str', v: '', closed: false })
    expect(parseLooseJson('[1').node).toMatchObject({ t: 'arr', closed: false })
    expect(parseLooseJson('').node).toEqual({ t: 'lit', v: '' })
    expect(parseLooseJson('[nope, 2]').node).toEqual({
      t: 'arr',
      closed: true,
      items: [
        { t: 'lit', v: 'nope' },
        { t: 'lit', v: '2' },
      ],
    })
  })

  it('unwraps JSON inside strings up to the limit', () => {
    const text = JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] })
    const node = parseLooseJson(text).node as Extract<JsonNode, { t: 'obj' }>
    const inner = (node.entries[0]?.[1] as Extract<JsonNode, { t: 'arr' }>).items[0] as Extract<
      JsonNode,
      { t: 'obj' }
    >
    expect(inner.entries[1]?.[1]).toEqual({
      t: 'obj',
      closed: true,
      entries: [['ok', { t: 'lit', v: 'true' }]],
    })
    expect(parseLooseJson(JSON.stringify({ s: '{"a":1}' }), { maxUnwrap: 0 }).node).toMatchObject({
      entries: [['s', { t: 'str' }]],
    })
    expect(parseLooseJson(JSON.stringify({ s: '{"a":1} tail' })).node).toMatchObject({
      entries: [['s', { t: 'str' }]],
    })
    expect(parseLooseJson(JSON.stringify({ s: '{"a":' })).node).toMatchObject({
      entries: [['s', { t: 'str' }]],
    })
  })
})

describe('layoutJson', () => {
  it('lays out nested values with commas and indentation', () => {
    expect(rows('{"a": 1, "b": [true, "x"], "my key": {}}')).toEqual([
      '{',
      '  "a": 1,',
      '  "b": [',
      '    true,',
      '    "x"',
      '  ],',
      '  "my key": {',
      '  }',
      '}',
    ])
  })

  it('folds array members by path with previews and size labels', () => {
    const text =
      '{"items": [{"id": "a", "nested": {"x": 1}, "long": "abcdefghijklmnopqrstuvwxyz0123"}, [1, [2]], 3]}'
    expect(
      rows(text, { collapsed: (path) => path === '$.items[0]' || path === '$.items[1]' }),
    ).toEqual([
      '{',
      '  "items": [',
      '    {"id": "a", "nested": {…}, "long": "abcdefghijklmnopqrstuvwx…"}, [$.items[0] closed 3 keys]',
      '    [1, […]], [$.items[1] closed 2 items]',
      '    3',
      '  ]',
      '}',
    ])
    expect(rows('[{"a":1}]')).toEqual(['[', '  { [$[0] open 1 key]', '    "a": 1', '  }', ']'])
    expect(rows('[[1]]', { collapsed: () => true })).toEqual([
      '[',
      '  [1] [$[0] closed 1 item]',
      ']',
    ])
    expect(rows('{"x y": [{}]}', { collapsed: (p) => p === '$["x y"][0]' })).toEqual([
      '{',
      '  "x y": [',
      '    {} [$["x y"][0] closed 0 keys]',
      '  ]',
      '}',
    ])
  })

  it('cuts long strings and marks unfinished input once', () => {
    expect(rows('{"s": "abcdef"}', { maxString: 3 })).toEqual(['{', '  "s": "abc…"', '}'])
    expect(rows('{"a": [1, 2')).toEqual(['{', '  "a": [', '    1,', '    2', '    …'])
    expect(rows('{"a": "cut')).toEqual(['{', '  "a": "cut…'])
    expect(rows('[')).toEqual(['[', '  …'])
  })
})

describe('prettyJson', () => {
  it('renders everything open and uncut, keeping trailing text', () => {
    expect(prettyJson('[{"a": 1}] (truncated)')).toEqual([
      '[',
      '  {',
      '    "a": 1',
      '  }',
      ']',
      '(truncated)',
    ])
    expect(prettyJson('{}')).toEqual(['{', '}'])
  })
})
