/**
 * Pins `@fx-/chat`'s runtime export surface across the `@fx-/chat-core`
 * extraction (change 0019): every name exported before the move MUST still be
 * exported, so no existing host import breaks. The snapshot was recorded from
 * the pre-extraction build; extend it deliberately when adding exports.
 */
import { describe, expect, it } from 'vitest'
import snapshot from './exports.snapshot.json'
import * as headless from './headless'
import * as root from './index'

describe('public export surface', () => {
  it('keeps every pre-extraction root export', () => {
    const names = Object.keys(root)
    expect(snapshot.root.filter((name) => !names.includes(name))).toEqual([])
  })

  it('keeps every pre-extraction headless export', () => {
    const names = Object.keys(headless)
    expect(snapshot.headless.filter((name) => !names.includes(name))).toEqual([])
  })
})
