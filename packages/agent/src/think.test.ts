// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ThinkSplitter } from './think'

function run(chunks: string[]) {
  const splitter = new ThinkSplitter()
  const out = chunks.flatMap((c) => splitter.push(c))
  return [...out, ...splitter.flush()]
}

describe('ThinkSplitter', () => {
  it('passes plain text through', () => {
    expect(run(['hello', ' world'])).toEqual([
      { kind: 'text', text: 'hello' },
      { kind: 'text', text: ' world' },
    ])
  })

  it('splits think spans, including tags split across chunks', () => {
    expect(run(['<thi', 'nk>plan</th', 'ink>Answer'])).toEqual([
      { kind: 'reasoning', text: 'plan' },
      { kind: 'text', text: 'Answer' },
    ])
  })

  it('handles text before a span and several spans in one chunk', () => {
    expect(run(['a<think>b</think>c<think>d</think>'])).toEqual([
      { kind: 'text', text: 'a' },
      { kind: 'reasoning', text: 'b' },
      { kind: 'text', text: 'c' },
      { kind: 'reasoning', text: 'd' },
    ])
  })

  it('releases a held-back fragment that turned out not to be a tag', () => {
    expect(run(['x <', 'b>'])).toEqual([
      { kind: 'text', text: 'x ' },
      { kind: 'text', text: '<b>' },
    ])
  })

  it('flushes a dangling partial tag as content of the current kind', () => {
    expect(run(['<think>deep</thi'])).toEqual([
      { kind: 'reasoning', text: 'deep' },
      { kind: 'reasoning', text: '</thi' },
    ])
  })
})
