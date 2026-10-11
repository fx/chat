/**
 * The completion-provider contract, specialized for React: the core contract
 * (`@fx/chat-core`) is renderer-agnostic with a generic `icon` slot; here the
 * icon is a `ReactNode` rendered by the completion popup.
 */
import type {
  CompletionItem as CoreCompletionItem,
  CompletionProvider as CoreProvider,
} from '@fx/chat-core'
import type { ReactNode } from 'react'

export type { CompletionApplyResult, CompletionMatch } from '@fx/chat-core'

/** A completion candidate whose optional `icon` is a React node. */
export type CompletionItem = CoreCompletionItem<ReactNode>

/** A completion strategy yielding React-renderable items. */
export type CompletionProvider<TItem extends CompletionItem = CompletionItem> = CoreProvider<TItem>
