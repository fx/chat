/**
 * tx's theme → `@fx-/chat-ink`'s injected theme. tx names nine semantic
 * variables and answers each with an appearance; the chat renderer's roles map
 * onto them, so `tx chat` looks like the rest of tx (greyscale by default,
 * coloured wherever a tx theme override says so).
 */
import type { InkAppearance, InkTheme } from '@fx-/chat-ink'
import type { Appearance, Theme } from '@fx/tx/theme'

export function toInkAppearance(appearance: Appearance): InkAppearance {
  return {
    ...(appearance.hue ? { color: appearance.hue } : {}),
    ...(appearance.dim ? { dim: true } : {}),
    ...(appearance.bold ? { bold: true } : {}),
    ...(appearance.inverse ? { inverse: true } : {}),
  }
}

export function inkThemeFrom(theme: Theme): InkTheme {
  const a = (v: Parameters<Theme['appearance']>[0]) => toInkAppearance(theme.appearance(v))
  return {
    content: a('content'),
    muted: a('muted'),
    strong: a('strong'),
    marker: a('marker'),
    chrome: a('chrome'),
    cursor: a('cursor'),
    positive: a('positive'),
    caution: a('caution'),
    danger: a('danger'),
    // The conversation roles reuse tx's emphasis scale.
    user: a('strong'),
    assistant: a('muted'),
    accent: a('marker'),
    code: a('strong'),
    link: { ...a('content'), underline: true },
    selection: { inverse: true },
  }
}
