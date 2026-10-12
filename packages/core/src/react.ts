/**
 * `@fx-/chat-core/react` — the DOM-free React hooks shared by every renderer.
 *
 * They need React but never a DOM: environment probes (reduced motion) degrade
 * to a documented default when the environment lacks them, so the same hooks
 * tick identically in a browser, a webview, and a terminal renderer.
 */
export * from './react/index'
