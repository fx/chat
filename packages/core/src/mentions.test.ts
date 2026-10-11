import { describe, expect, it } from 'vitest'
import { mentionsToSegments, parseMentions } from './mentions'

describe('parseMentions', () => {
  it('parses a mention at the start of the string', () => {
    expect(parseMentions('@alice hi')).toEqual([{ agentId: 'alice', range: [0, 6] }])
  })

  it('parses a mention after whitespace', () => {
    expect(parseMentions('hi @bob')).toEqual([{ agentId: 'bob', range: [3, 7] }])
  })

  it('does NOT treat email-like @ as a mention', () => {
    expect(parseMentions('mail user@host.com now')).toEqual([])
  })

  it('parses multiple mentions', () => {
    expect(parseMentions('@a and @b')).toEqual([
      { agentId: 'a', range: [0, 2] },
      { agentId: 'b', range: [7, 9] },
    ])
  })

  it('ignores a bare @ with no id', () => {
    expect(parseMentions('@ and @ ')).toEqual([])
  })

  it('ignores a trailing @ at end of string', () => {
    expect(parseMentions('hi @')).toEqual([])
  })

  it('allows dots and hyphens inside the id but trims trailing punctuation', () => {
    expect(parseMentions('@a.b-c.')).toEqual([{ agentId: 'a.b-c', range: [0, 6] }])
  })

  it('trims a trailing hyphen run from the id', () => {
    expect(parseMentions('@name--')).toEqual([{ agentId: 'name', range: [0, 5] }])
  })

  it('returns empty for plain text with no @', () => {
    expect(parseMentions('plain text')).toEqual([])
  })

  it('terminates an id at a comma', () => {
    expect(parseMentions('@alice, hello')).toEqual([{ agentId: 'alice', range: [0, 6] }])
  })
})

describe('mentionsToSegments', () => {
  it('returns an empty array for an empty string', () => {
    expect(mentionsToSegments('')).toEqual([])
  })

  it('returns a single literal for text with no mentions', () => {
    expect(mentionsToSegments('hello world')).toEqual(['hello world'])
  })

  it('interleaves literal and mention segments with stable keys', () => {
    const segments = mentionsToSegments('hi @bob bye')
    expect(segments).toEqual([
      'hi ',
      { mention: { agentId: 'bob', text: '@bob', range: [3, 7] }, key: 'mention-3' },
      ' bye',
    ])
  })

  it('handles a mention at index 0 with no leading literal', () => {
    const segments = mentionsToSegments('@a rest')
    expect(segments[0]).toEqual({
      mention: { agentId: 'a', text: '@a', range: [0, 2] },
      key: 'mention-0',
    })
    expect(segments[1]).toBe(' rest')
  })

  it('handles a mention at the very end with no trailing literal', () => {
    const segments = mentionsToSegments('hi @a')
    expect(segments).toHaveLength(2)
    expect(segments[1]).toEqual({
      mention: { agentId: 'a', text: '@a', range: [3, 5] },
      key: 'mention-3',
    })
  })

  it('emits two adjacent mentions with the between-literal preserved', () => {
    const segments = mentionsToSegments('@a @b')
    expect(segments).toHaveLength(3)
    expect(segments[1]).toBe(' ')
  })
})
