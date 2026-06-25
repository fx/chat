/**
 * The single reference completion provider shipped by `@fx/chat`.
 *
 * It exists ONLY for demos and tests — it encodes no host domain concepts, does
 * no I/O, and is fully synchronous. It demonstrates the provider contract
 * end-to-end: a single trigger char (`~`), a `match()` that finds the active
 * token under the caret, a sync `items()` filtered over a tiny static list, and
 * an `apply()` that splices the chosen label in followed by the conventional
 * trailing space (so the caret lands ready to keep typing).
 *
 * This module is DOM-free; it only manipulates the textarea's string value and
 * caret offset, so it is importable and testable outside the browser.
 */
import type {
  CompletionApplyResult,
  CompletionItem,
  CompletionMatch,
  CompletionProvider,
} from './types'

/** The reference provider's trigger character. */
export const REFERENCE_TRIGGER = '~'

/**
 * Characters allowed in the reference token after the trigger. A run of
 * word-ish characters; anything else (whitespace, punctuation) terminates the
 * token, matching the `@`-mention id charset's spirit.
 */
const TOKEN_CHAR = /[A-Za-z0-9_-]/

/**
 * The static candidate set. A handful of fixed items — deliberately
 * application-neutral — sufficient to exercise filtering, selection, and apply.
 */
export const REFERENCE_ITEMS: readonly CompletionItem[] = [
  { id: 'apple', label: 'apple', description: 'a pome fruit' },
  { id: 'apricot', label: 'apricot', description: 'a stone fruit' },
  { id: 'banana', label: 'banana', description: 'a berry, botanically' },
  { id: 'cherry', label: 'cherry', description: 'a drupe' },
]

/**
 * Find the active `~`-token ending at `caret`. Walks left from the caret over
 * {@link TOKEN_CHAR} runs; the token is active only when the char immediately
 * before that run is the trigger AND that trigger is at the start of the string
 * or preceded by whitespace (so `a~b` mid-word is not a token). Returns the
 * {@link CompletionMatch} (query + `[triggerIndex, caret]` range) or `null`.
 */
function matchReference(text: string, caret: number): CompletionMatch | null {
  let start = caret
  while (start > 0 && TOKEN_CHAR.test(text[start - 1] as string)) start--
  // The char before the token run must be the trigger.
  const triggerIndex = start - 1
  if (triggerIndex < 0 || text[triggerIndex] !== REFERENCE_TRIGGER) return null
  // The trigger must begin a word (start-of-string or after whitespace).
  const before = text[triggerIndex - 1]
  if (before !== undefined && !/\s/.test(before)) return null
  return { query: text.slice(start, caret), range: [triggerIndex, caret] }
}

/**
 * The reference provider. Static, synchronous, trigger-based; demonstrates the
 * trailing-space apply convention.
 */
export const referenceProvider: CompletionProvider = {
  id: 'reference',
  trigger: REFERENCE_TRIGGER,
  match: matchReference,
  items(query: string): CompletionItem[] {
    const q = query.toLowerCase()
    if (q.length === 0) return [...REFERENCE_ITEMS]
    return REFERENCE_ITEMS.filter((item) => item.label.toLowerCase().includes(q))
  },
  apply(item: CompletionItem, before: string, after: string): CompletionApplyResult {
    // Insert `~label ` (trigger + label + trailing space) and drop a single
    // space that already follows the token, so applying never doubles spaces.
    const trimmedAfter = after.startsWith(' ') ? after.slice(1) : after
    const inserted = `${REFERENCE_TRIGGER}${item.label} `
    return { value: `${before}${inserted}${trimmedAfter}`, caret: before.length + inserted.length }
  },
}
