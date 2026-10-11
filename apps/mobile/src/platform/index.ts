/**
 * Platform adapters. Every Tauri API is reached through here (and only via
 * dynamic imports), so the same UI runs unchanged in a desktop browser for
 * development and inside the Android shell.
 */
import type { FetchLike } from '@fx/chat-agent'

/** True inside the Tauri shell (desktop or mobile). */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * The fetch used for model endpoints and network tools. In the shell it is
 * the Tauri HTTP plugin's fetch: requests go through the native HTTP stack, so
 * browser CORS rules do not apply and arbitrary user endpoints work. In a
 * browser it is the regular fetch (endpoints must then allow CORS).
 */
export const appFetch: FetchLike = async (input, init) => {
  if (!isTauri()) return globalThis.fetch(input, init)
  const { fetch } = await import('@tauri-apps/plugin-http')
  // An empty Origin drops the header; some local model servers reject the
  // webview's origin otherwise.
  const headers = new Headers(init?.headers)
  headers.set('Origin', '')
  return fetch(input, { ...init, headers })
}

/** A handle that stops listening. */
export type Unlisten = () => void

/**
 * Handle the Android back action. While a handler is registered it replaces
 * the default (which closes the app); unregister to restore the default.
 */
export function onBackButton(handler: () => void): Unlisten {
  if (!isTauri()) return () => {}
  let disposed = false
  let unlisten: Unlisten | undefined
  import('@tauri-apps/api/app')
    .then(({ onBackButtonPress }) => onBackButtonPress(() => handler()))
    .then((listener) => {
      if (disposed) void listener.unregister()
      else unlisten = () => void listener.unregister()
    })
    .catch(() => {})
  return () => {
    disposed = true
    unlisten?.()
  }
}

/**
 * Keep `--app-height` equal to the visual viewport height, so the composer
 * stays above the on-screen keyboard even where the webview does not resize
 * the layout viewport for it.
 */
export function trackVisualViewport(root: HTMLElement): Unlisten {
  const viewport = window.visualViewport
  if (!viewport) return () => {}
  const update = () => root.style.setProperty('--app-height', `${viewport.height}px`)
  update()
  viewport.addEventListener('resize', update)
  return () => viewport.removeEventListener('resize', update)
}

/** Reduce an HTML document to readable text with the webview's own parser. */
export function domHtmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  for (const el of Array.from(doc.querySelectorAll('script, style, noscript, svg, template'))) {
    el.remove()
  }
  const title = doc.title.trim()
  const body = (doc.body?.textContent ?? '').replace(/[ \t\f\v]+/g, ' ').replace(/\s*\n\s*/g, '\n')
  return [title, body.trim()].filter(Boolean).join('\n\n')
}
