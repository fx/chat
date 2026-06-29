/**
 * `headless` registry adapter.
 *
 * The zero-dependency baseline: it re-exports the package's built-in
 * {@link headlessComponents} registry verbatim — no UI kit, no icon set, no
 * markdown engine, only the library's own primitives (semantic HTML on the
 * stable `.chat-*` hooks). Like every pane it is styled by the shared
 * `classNames` theme; the primitives' own chrome (button/badge/code/disclosure)
 * is provided by a small scoped block in `index.css`. This is the honest "bring
 * nothing but a stylesheet" reference adapter.
 */
import { type ChatComponents, headlessComponents } from '@fx/chat/headless'

/** The headless adapter registry (the library defaults, unchanged). */
export const headlessRegistry: ChatComponents = headlessComponents
