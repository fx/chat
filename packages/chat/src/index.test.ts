import { describe, expect, it } from 'vitest'
import {
  ChatInput,
  CompletionPopup,
  REFERENCE_TRIGGER,
  autosize,
  computeAtomicMentionDeletion,
  computePopupAnchor,
  cx,
  getCaretCoords,
  referenceProvider,
  version,
} from './index'
// Compile-time assertion that the barrel re-exports the input type surface; if
// any of these type exports is removed, this import (and the build) fails.
import type {
  CaretCoords,
  ChatInputProps,
  CompletionApplyResult,
  CompletionItem,
  CompletionMatch,
  CompletionPopupHandle,
  CompletionPopupProps,
  CompletionProvider,
  PopupAnchor,
} from './index'

describe('version', () => {
  it('exposes a non-empty string version', () => {
    expect(typeof version).toBe('string')
    expect(version.length).toBeGreaterThan(0)
  })
})

describe('cx', () => {
  it('returns an empty string with no arguments', () => {
    expect(cx()).toBe('')
  })

  it('joins truthy string values with a single space', () => {
    expect(cx('a', 'b', 'c')).toBe('a b c')
  })

  it('ignores all falsy values', () => {
    expect(cx('a', false, null, undefined, 0, '', 'b')).toBe('a b')
  })

  it('stringifies non-empty numbers', () => {
    expect(cx('a', 1, 2)).toBe('a 1 2')
  })

  it('flattens nested arrays recursively', () => {
    expect(cx('a', ['b', ['c', false, 'd']], 'e')).toBe('a b c d e')
  })

  it('drops nested arrays that produce no output', () => {
    expect(cx('a', [false, null, []], 'b')).toBe('a b')
  })
})

describe('input surface re-exports', () => {
  it('re-exports the composer, popup, completion contract, and caret utils', () => {
    expect(typeof ChatInput).toBe('function')
    // forwardRef yields an exotic object, not a plain function.
    expect(CompletionPopup).toBeDefined()
    expect(CompletionPopup.displayName).toBe('CompletionPopup')
    expect(typeof computeAtomicMentionDeletion).toBe('function')
    expect(typeof autosize).toBe('function')
    expect(typeof getCaretCoords).toBe('function')
    expect(typeof computePopupAnchor).toBe('function')
    expect(referenceProvider.trigger).toBe(REFERENCE_TRIGGER)
  })

  it('re-exports the input type surface (compile-time check)', () => {
    // Reference each imported type so the type-only imports are "used" and the
    // test fails to compile if any export is dropped from the barrel.
    type _Assert = [
      ChatInputProps,
      CaretCoords,
      PopupAnchor,
      CompletionItem,
      CompletionMatch,
      CompletionApplyResult,
      CompletionProvider,
      CompletionPopupHandle,
      CompletionPopupProps,
    ]
    const _used: _Assert | undefined = undefined
    expect(_used).toBeUndefined()
  })
})
