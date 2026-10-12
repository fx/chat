/**
 * The input surface of `@fx-/chat`: the headless `ChatInput` composer, the
 * caret-anchored `CompletionPopup`, the DOM-free completion-provider contract,
 * and the single reference provider.
 *
 * The contract (`./completion/types`) and the reference provider
 * (`./completion/reference`) are DOM-free and safe to import outside the
 * browser; `ChatInput`/`CompletionPopup` are React components that confine DOM
 * access to effects/handlers. Every visual atom + icon is consumed via the
 * component registry — nothing here imports a styled primitive or icon set.
 */
export type { ChatInputProps } from './ChatInput'
export { autosize, ChatInput, computeAtomicMentionDeletion } from './ChatInput'
export type { CaretCoords, PopupAnchor } from './caret'
export { computePopupAnchor, getCaretCoords } from './caret'
export {
  REFERENCE_ITEMS,
  REFERENCE_TRIGGER,
  referenceProvider,
} from '@fx-/chat-core'
export type {
  CompletionApplyResult,
  CompletionItem,
  CompletionMatch,
  CompletionProvider,
} from './completion/types'
export type { CompletionPopupHandle, CompletionPopupProps } from './CompletionPopup'
// `LOADING_DELAY` is an internal popup timing detail — intentionally NOT part of
// the public barrel; it stays a module export only for the popup's own tests.
export { CompletionPopup } from './CompletionPopup'
