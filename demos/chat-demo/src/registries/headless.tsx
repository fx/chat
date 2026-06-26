/**
 * `headless` registry adapter.
 *
 * The zero-dependency baseline: it re-exports the package's built-in
 * {@link headlessComponents} registry verbatim and imports the package
 * stylesheet so the headless primitives are styled by the `--chat-*` CSS
 * variables. No UI kit, no icon set, no markdown engine — only the library's own
 * defaults. This is the honest "bring nothing" reference adapter.
 */
import '@fx/chat/styles.css'
import { type ChatComponents, headlessComponents } from '@fx/chat/headless'

/** The headless adapter registry (the library defaults, unchanged). */
export const headlessRegistry: ChatComponents = headlessComponents
