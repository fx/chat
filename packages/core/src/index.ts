/**
 * `@fx/chat-core` — the renderer-agnostic foundation of `@fx/chat`.
 *
 * Pure TypeScript: no React, no DOM, no terminal, no network. Holds the
 * normalized message model + codec, the transcript logic every renderer shares
 * (grouping, timeline merge, block summaries, formatting, mentions, URL
 * safety), the renderer-independent half of the extension API, and the
 * completion-provider contract. DOM-free React hooks live in the separate
 * `@fx/chat-core/react` entry.
 */
export * from './model'
export * from './transcript'
export * from './completion'
export * from './mentions'
