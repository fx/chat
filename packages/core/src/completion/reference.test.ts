/**
 * Reference-provider + contract tests. These exercise pure, DOM-free logic only
 * — no React, no `document` — so they double as proof the contract and provider
 * are importable and usable outside the browser (see `non-dom-import.test.ts`
 * for an explicit no-DOM assertion).
 */
import { describe, expect, it } from 'vitest'
import { REFERENCE_ITEMS, REFERENCE_TRIGGER, referenceProvider } from './reference'
import type { CompletionItem } from './types'

describe('referenceProvider contract shape', () => {
  it('declares a single-char trigger and stable id', () => {
    expect(referenceProvider.id).toBe('reference')
    expect(referenceProvider.trigger).toBe(REFERENCE_TRIGGER)
    expect(referenceProvider.trigger).toHaveLength(1)
  })
})

describe('referenceProvider.match', () => {
  it('matches an active token at the caret after the trigger', () => {
    const text = '~ap'
    expect(referenceProvider.match(text, 3)).toEqual({ query: 'ap', range: [0, 3] })
  })

  it('matches an empty query right after the trigger', () => {
    expect(referenceProvider.match('~', 1)).toEqual({ query: '', range: [0, 1] })
  })

  it('matches a token after whitespace', () => {
    const text = 'hi ~ba'
    expect(referenceProvider.match(text, 6)).toEqual({ query: 'ba', range: [3, 6] })
  })

  it('covers the whole token even when the caret is mid-token', () => {
    // `~apple` with the caret after `ap` (index 3): range must span the full
    // token `[0, 6]`, while the query stays the prefix `ap`.
    expect(referenceProvider.match('~apple', 3)).toEqual({ query: 'ap', range: [0, 6] })
  })

  it('returns null for an out-of-range caret', () => {
    expect(referenceProvider.match('~ap', -1)).toBeNull()
    expect(referenceProvider.match('~ap', 99)).toBeNull()
  })

  it('returns null when the caret is not inside a token', () => {
    expect(referenceProvider.match('hello', 5)).toBeNull()
  })

  it('returns null for a mid-word trigger (a~b)', () => {
    // `a~b` — the trigger is preceded by a non-whitespace char.
    expect(referenceProvider.match('a~b', 3)).toBeNull()
  })

  it('returns null when the trigger is absent before the token run', () => {
    // Caret after `ab` with no trigger anywhere.
    expect(referenceProvider.match('ab', 2)).toBeNull()
  })

  it('stops the token at whitespace', () => {
    // Caret is after the space, so there is no active token run.
    expect(referenceProvider.match('~ab ', 4)).toBeNull()
  })
})

describe('referenceProvider.items', () => {
  it('returns the full set for an empty query', () => {
    const result = referenceProvider.items('', new AbortController().signal)
    expect(result).toEqual([...REFERENCE_ITEMS])
    // A copy, not the frozen source.
    expect(result).not.toBe(REFERENCE_ITEMS)
  })

  it('filters case-insensitively by label substring', () => {
    const result = referenceProvider.items('AP', new AbortController().signal) as CompletionItem[]
    expect(result.map((i) => i.id)).toEqual(['apple', 'apricot'])
  })

  it('returns an empty array when nothing matches', () => {
    const result = referenceProvider.items('zzz', new AbortController().signal)
    expect(result).toEqual([])
  })
})

describe('referenceProvider.apply', () => {
  it('inserts the label with a trailing space and returns the caret', () => {
    // Applying `apple` into `~ap|` (before='', after='').
    const item = REFERENCE_ITEMS[0] as CompletionItem
    const result = referenceProvider.apply(item, '', '')
    expect(result.value).toBe('~apple ')
    expect(result.caret).toBe('~apple '.length)
  })

  it('preserves surrounding text and collapses an existing trailing space', () => {
    // `hi ~ap| more` → before='hi ', after=' more'; the leading space of
    // `after` is dropped so there is exactly one space after the inserted token.
    const item = REFERENCE_ITEMS[1] as CompletionItem
    const result = referenceProvider.apply(item, 'hi ', ' more')
    expect(result.value).toBe('hi ~apricot more')
    expect(result.caret).toBe('hi ~apricot '.length)
  })

  it('does not consume a non-space following character', () => {
    const item = REFERENCE_ITEMS[2] as CompletionItem
    const result = referenceProvider.apply(item, '', '!')
    expect(result.value).toBe('~banana !')
  })
})
