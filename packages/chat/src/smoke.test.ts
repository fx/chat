import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = resolve(here, '..')
const pkg = JSON.parse(readFileSync(resolve(pkgDir, 'package.json'), 'utf8'))

/**
 * Escape EVERY regex metacharacter in a string so it can be embedded literally
 * in a `RegExp`. A selector-fragment escape that only handled `[`, `]`, `"` left
 * `.` (and `(`/`)`/`*` etc.) as wildcards — e.g. `.chat-message` would match
 * `Xchat-message` — so exact-selector assertions could pass on the wrong rule.
 */
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Parse the `--chat-*` custom-property declarations out of the first rule body
 * matching `selector` in `css`. Returns a map of token name → trimmed value.
 * Lifted to module scope (NOT exported — Biome `noExportsInTest` forbids
 * exports in test files) so multiple tests can compare token values across
 * `:root`, the explicit light/dark hooks, and the OS-dark media block.
 */
const tokensOf = (css: string, selector: string): Record<string, string> => {
  const m = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))
  const body = m?.[1] ?? ''
  const tokens: Record<string, string> = {}
  for (const decl of body.split(';')) {
    const dm = decl.match(/(--chat-[\w-]+)\s*:\s*(.+)/)
    if (dm?.[1] && dm[2]) tokens[dm[1]] = dm[2].trim()
  }
  return tokens
}

/**
 * Extract the body of the `@media (prefers-color-scheme: dark) { … }` block via
 * balanced-brace scanning so dark-scoped assertions are confined to that block
 * (a `[\s\S]*` regex can run past the closing brace and match unrelated rules).
 * Returns '' when there is no such block.
 */
const extractDarkMediaBody = (source: string): string => {
  const head = source.match(/@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)\s*\{/)
  if (head?.index === undefined) return ''
  let depth = 1
  const start = head.index + head[0].length
  // Track whether we're inside a CSS string literal so a brace that appears in a
  // value like `content: "}"` is NOT treated as structural (which would slice
  // the block short). Only `{`/`}` outside quotes affect the brace depth. A
  // backslash escapes the next character inside a string (e.g. `"\""`).
  let quote: '"' | "'" | null = null
  for (let i = start; i < source.length; i++) {
    const ch = source[i]
    if (quote) {
      if (ch === '\\') {
        i++ // skip the escaped character
      } else if (ch === quote) {
        quote = null
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === '{') {
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) return source.slice(start, i)
    }
  }
  return ''
}

/**
 * Smoke test for the public package surface. Asserts that all three public
 * entry points resolve, and — critically for the architecture spec — that the
 * surface pulls in no UI-kit / icon-set / markdown-engine dependency. We assert
 * agnosticism structurally (the package manifest) rather than from pixels.
 */
describe('@fx/chat public surface', () => {
  it('resolves the root entry point via its package specifier', async () => {
    // Import through the published name so a broken `exports` map or a missing
    // built subpath fails the test exactly as it would fail a consumer.
    const root = await import('@fx/chat')
    expect(typeof root.cx).toBe('function')
    expect(root.version).toBe(pkg.version)
  })

  it('resolves the headless entry point via its package specifier', async () => {
    const headless = await import('@fx/chat/headless')
    expect(headless.headlessComponents).toBeDefined()
    expect(typeof headless.headlessComponents.Button).toBe('function')
    expect(typeof headless.headlessComponents.icons).toBe('object')
  })

  it('declares the three required subpath exports', () => {
    expect(Object.keys(pkg.exports).sort()).toEqual(['.', './headless', './styles.css'])
  })

  it('ships a resolvable ./styles.css entry that defines --chat-* defaults', () => {
    const target = pkg.exports['./styles.css']
    expect(typeof target).toBe('string')
    const cssPath = resolve(pkgDir, target)
    expect(existsSync(cssPath)).toBe(true)
    const css = readFileSync(cssPath, 'utf8')
    expect(css).toContain('--chat-')
  })

  it('keeps React as a peer dependency and bundles no runtime deps', () => {
    expect(pkg.peerDependencies).toHaveProperty('react')
    expect(pkg.peerDependencies).toHaveProperty('react-dom')
    expect(pkg.dependencies ?? {}).toEqual({})
  })

  it('applies the theme foreground at the render root so all message text is legible', () => {
    // The user/system/plain-text path inherits color from the render root; if
    // these declarations regress, dark-theme body text falls back to UA-default
    // black (~1.1:1 on the dark surface). Assert the color is applied on both
    // the log container and the standalone message container.
    const css = readFileSync(resolve(pkgDir, pkg.exports['./styles.css']), 'utf8')
    const block = (selector: string) => {
      const m = css.match(new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`))
      return m?.[1] ?? ''
    }
    expect(block('.chat-log')).toContain('color: var(--chat-fg)')
    expect(block('.chat-message')).toContain('color: var(--chat-fg)')
  })

  it('gives interactive primitives a >=44px touch target', () => {
    // Footer actions (Copy/Regenerate/Fork/Reset/compact reveal) and the
    // disclosure summary row must be comfortably tappable on mobile.
    const css = readFileSync(resolve(pkgDir, pkg.exports['./styles.css']), 'utf8')
    const block = (selector: string) => {
      const m = css.match(new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`))
      return m?.[1] ?? ''
    }
    expect(block('.chat-button')).toContain('min-height: 44px')
    expect(block('.chat-button')).toContain('min-width: 44px')
    expect(block('.chat-copybutton')).toContain('min-height: 44px')
    expect(block('.chat-copybutton')).toContain('min-width: 44px')
    expect(block('.chat-collapsible-header')).toContain('min-height: 44px')
  })

  it('gives interactive controls a token-driven :focus-visible ring', () => {
    // Keyboard users must get a visible focus indicator on every focusable
    // package control, and it must be theme-aware (token-driven via
    // `--chat-accent`) so hosts can restyle it without overriding components.
    const css = readFileSync(resolve(pkgDir, pkg.exports['./styles.css']), 'utf8')
    // Match the rule whose selector list contains `<selector>:focus-visible`,
    // returning the declaration body. Handles both grouped (comma-separated)
    // and standalone focus-visible selectors.
    const focusBlock = (selector: string) => {
      const re = new RegExp(`${escapeRegExp(selector)}:focus-visible[^{]*\\{([^}]*)\\}`)
      return css.match(re)?.[1] ?? ''
    }
    for (const selector of [
      '.chat-button',
      '.chat-copybutton',
      // The collapsible trigger is the `<summary class="chat-collapsible-header">`.
      '.chat-collapsible-header',
      // The attachment download/expand affordances are focusable button/link.
      '.chat-attachment-thumb',
      '.chat-attachment-chip-download',
    ]) {
      const body = focusBlock(selector)
      expect(body).toContain('outline: 2px solid var(--chat-accent)')
      expect(body).toContain('outline-offset: 2px')
    }
    // The popup options are deliberately NOT given a focus ring: focus stays in
    // the textarea (aria-activedescendant model), so they never receive focus.
    expect(css).not.toContain('.chat-completion-option:focus-visible')
  })

  it('makes an explicit data-theme win over prefers-color-scheme', () => {
    // Precedence contract: `[data-theme="light"]` is light always,
    // `[data-theme="dark"]` is dark always, and a root with NO `data-theme`
    // follows the OS. This is encoded by (a) a `[data-theme="light"]` block
    // and (b) scoping the OS-dark media block to `:root:not([data-theme])` so
    // it cannot override an element that explicitly opts into light.
    const css = readFileSync(resolve(pkgDir, pkg.exports['./styles.css']), 'utf8')

    // (a) An explicit light hook exists to reclaim light under OS-dark.
    expect(css).toContain('[data-theme="light"] {')

    // (b) The OS-dark media block must target only roots WITHOUT a data-theme.
    // Strip CSS comments FIRST so they can neither (i) false-trip the bare-`:root`
    // ban, (ii) satisfy the `:root:not(...)` requirement, nor (iii) wedge a stray
    // brace that would throw off balanced-brace scanning. Then extract the body of
    // the `@media (prefers-color-scheme: dark) { … }` block via balanced-brace
    // scanning so the guard is independent of whitespace and formatting — a
    // regression like `:root{` (no space) or a commented `:root {` must NOT slip
    // through.
    const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const darkMediaBody = extractDarkMediaBody(cssNoComments)
    expect(darkMediaBody).not.toBe('')
    // It MUST scope to `:root:not([data-theme])`.
    expect(darkMediaBody).toMatch(/:root:not\(\s*\[data-theme\]\s*\)/)
    // It must NEVER use a bare `:root` (any `:root` not immediately followed by
    // `:` — so `:root:not(...)` is allowed, but `:root {`, `:root{`, `:root,`,
    // `:root>` etc. are banned, regardless of whitespace/formatting).
    expect(darkMediaBody).not.toMatch(/:root(?!:)/)

    // (c) The `:root` light defaults and the `[data-theme="light"]` values must
    // stay in sync — duplicated literals are allowed only if they match exactly.
    const root = tokensOf(css, ':root')
    const explicitLight = tokensOf(css, '\\[data-theme="light"\\]')
    expect(Object.keys(explicitLight).length).toBeGreaterThan(0)
    expect(explicitLight).toEqual(root)
  })

  it('defaults --chat-font-family to inherit in :root and [data-theme="light"]', () => {
    // Change 0009: the base font is inherited from the host page (not a forced
    // system stack) so the chat surface matches the surrounding app. The
    // override seam (`font-family: var(--chat-font-family)` declarations) stays.
    const css = readFileSync(resolve(pkgDir, pkg.exports['./styles.css']), 'utf8')
    const block = (selector: string) => {
      const m = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))
      return m?.[1] ?? ''
    }
    expect(block(':root')).toMatch(/--chat-font-family:\s*inherit\s*;/)
    expect(block('\\[data-theme="light"\\]')).toMatch(/--chat-font-family:\s*inherit\s*;/)
    // The override seam is still present so hosts can restyle via the token.
    expect(css).toContain('font-family: var(--chat-font-family)')
  })

  it('defines the role-bubble tokens with light and dark values', () => {
    // Change 0009: user/assistant bubble tokens exist in the light set and the
    // assistant surface gets a distinct dark value under both dark hooks.
    const css = readFileSync(resolve(pkgDir, pkg.exports['./styles.css']), 'utf8')
    const block = (selector: string) => {
      const m = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))
      return m?.[1] ?? ''
    }
    const bubbleTokens = [
      '--chat-user-bubble-bg',
      '--chat-user-bubble-fg',
      '--chat-assistant-bubble-bg',
      '--chat-assistant-bubble-fg',
      '--chat-bubble-max-width',
    ]
    for (const token of bubbleTokens) {
      expect(block(':root')).toContain(`${token}:`)
    }
    // The light value is the baseline the dark surfaces must differ from.
    const lightAssistantBg = tokensOf(css, ':root')['--chat-assistant-bubble-bg']
    expect(lightAssistantBg).toBeDefined()

    // The assistant bubble has a dedicated dark surface in the explicit dark hook
    // — and it must be a genuinely DIFFERENT value, not a re-statement of the
    // light one (a presence-only check passes even if dark reuses light).
    const explicitDarkAssistantBg = tokensOf(css, '\\[data-theme="dark"\\]')[
      '--chat-assistant-bubble-bg'
    ]
    expect(explicitDarkAssistantBg).toBeDefined()
    expect(explicitDarkAssistantBg).not.toBe(lightAssistantBg)

    // …and under the OS-dark media block (a darker neutral than the light value).
    // Scope the check to the media block's BODY (balanced-brace extraction) so a
    // `[\s\S]*` regex can't satisfy it by matching a declaration past the closing
    // brace.
    const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const darkMediaBody = extractDarkMediaBody(cssNoComments)
    expect(darkMediaBody).not.toBe('')
    // Extract the OS-dark assistant bubble value from the media-block body and
    // assert it, too, differs from the light baseline.
    const mediaDarkAssistantBg = darkMediaBody
      .match(/--chat-assistant-bubble-bg\s*:\s*([^;]+)/)?.[1]
      ?.trim()
    expect(mediaDarkAssistantBg).toBeDefined()
    expect(mediaDarkAssistantBg).not.toBe(lightAssistantBg)
  })

  it('styles the answer-text bubble (not the whole message) from the bubble tokens', () => {
    // Realigned layout: the bubble shape lives ONLY on the answer text block
    // (`.chat-text`), scoped by role — NOT on the message wrapper and NOT on the
    // auxiliary `.chat-row`/`.chat-collapsible` rows. Both roles are LEFT-aligned;
    // the role distinction is the bubble color. Hosts can restyle via the tokens.
    const css = readFileSync(resolve(pkgDir, pkg.exports['./styles.css']), 'utf8')
    const block = (selector: string) => {
      const m = css.match(new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`))
      return m?.[1] ?? ''
    }
    // The user/assistant answer text carries the bubble bg/fg/radius/padding.
    const userText = block('.chat-message[data-role="user"] .chat-text')
    expect(userText).toContain('var(--chat-user-bubble-bg)')
    expect(userText).toContain('var(--chat-user-bubble-fg)')
    expect(userText).toContain('var(--chat-radius)')
    const assistantText = block('.chat-message[data-role="assistant"] .chat-text')
    expect(assistantText).toContain('var(--chat-assistant-bubble-bg)')
    expect(assistantText).toContain('var(--chat-assistant-bubble-fg)')
    expect(assistantText).toContain('var(--chat-radius)')
    // The message wrapper keeps alignment + max-width but NO background. Both
    // roles are left-aligned (align-self: flex-start), and the user wrapper no
    // longer right-aligns via margin-left:auto.
    const wrapper =
      css.match(
        /\.chat-message\[data-role="user"\],\s*\n\.chat-message\[data-role="assistant"\]\s*\{([^}]*)\}/,
      )?.[1] ?? ''
    expect(wrapper).toContain('var(--chat-bubble-max-width)')
    expect(wrapper).toMatch(/align-self:\s*flex-start/)
    expect(wrapper).not.toMatch(/margin-left:\s*auto/)
    expect(wrapper).not.toContain('background')
    // The user footer metrics use the full bubble foreground so they meet WCAG
    // AA contrast (no sub-4.5:1 color-mix).
    const userMetrics = block('.chat-message[data-role="user"] .chat-footer-metrics')
    expect(userMetrics).toContain('var(--chat-user-bubble-fg)')
    expect(userMetrics).not.toContain('color-mix')
    // A mention inside the user TEXT bubble is re-toned to the bubble foreground
    // so it is not accent-on-accent (invisible) — the bubble bg is the accent.
    const userMention = block('.chat-message[data-role="user"] .chat-text .chat-mention')
    expect(userMention).toContain('var(--chat-user-bubble-fg)')
  })

  it('defines the per-block timestamp-gutter layout rules (change 0012)', () => {
    // The gutter is a two-column row: a fixed 56px clock cell + the content. The
    // prior `.chat-message-time` chrome is removed in favor of this layout.
    const css = readFileSync(resolve(pkgDir, pkg.exports['./styles.css']), 'utf8')
    const block = (selector: string) => {
      const m = css.match(new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`))
      return m?.[1] ?? ''
    }
    // The prior per-message timestamp rule is gone.
    expect(css).not.toContain('.chat-message-time')
    // The row is a flex two-column layout.
    const row = block('.chat-gutter-row')
    expect(row).toContain('display: flex')
    expect(row).toMatch(/align-items:\s*flex-start/)
    // The clock cell: fixed 56px width, muted token color, tabular figures.
    const time = block('.chat-gutter-time')
    expect(time).toMatch(/width:\s*3\.5rem/)
    expect(time).toContain('var(--chat-muted)')
    expect(time).toContain('tabular-nums')
    expect(time).toMatch(/flex-shrink:\s*0/)
    expect(time).toMatch(/text-align:\s*right/)
    // The content cell can shrink (min-width:0) and takes the remaining space.
    const content = block('.chat-gutter-content')
    expect(content).toContain('min-width: 0')
    expect(content).toContain('flex: 1')
  })

  it('defines minimal/density-mode rules driven by --chat-gap-compact', () => {
    // Change 0011: minimal mode tightens spacing via a compact gap token, applied
    // to the log and message wrappers keyed off data-minimal. Token-driven and
    // headless-only.
    const css = readFileSync(resolve(pkgDir, pkg.exports['./styles.css']), 'utf8')
    const block = (selector: string) => {
      const m = css.match(new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`))
      return m?.[1] ?? ''
    }
    const tokenBlock = (selector: string) => {
      const m = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))
      return m?.[1] ?? ''
    }
    // The compact token exists in the light set (and stays in :root/[data-theme=light] sync).
    expect(tokenBlock(':root')).toContain('--chat-gap-compact:')
    expect(tokenBlock('\\[data-theme="light"\\]')).toContain('--chat-gap-compact:')
    // …and is present under the explicit dark hook (light+dark coverage).
    expect(tokenBlock('\\[data-theme="dark"\\]')).toContain('--chat-gap-compact:')
    // The minimal rules reference the compact token.
    expect(block('.chat-log[data-minimal="true"]')).toContain('var(--chat-gap-compact)')
    expect(block('.chat-message[data-minimal="true"]')).toContain('var(--chat-gap-compact)')
  })

  it('keeps narrow-width rows from overflowing horizontally (responsive reflow)', () => {
    // At 375px the dense one-line flex rows (footer metrics, the minimal-mode
    // group header) previously overflowed because their content could neither
    // shrink, truncate, nor break. Assert the per-element responsive guards so a
    // regression that drops them fails here instead of in a 375px viewport.
    const css = readFileSync(resolve(pkgDir, pkg.exports['./styles.css']), 'utf8')
    const block = (selector: string) => {
      const m = css.match(new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`))
      return m?.[1] ?? ''
    }

    // The footer reflows (wrap) and can shrink so its metrics child can break.
    // Anchor to the standalone `.chat-footer { … }` rule (newline-prefixed) so
    // the match is not stolen by a descendant rule like
    // `.chat-message[data-minimal="true"] .chat-footer { … }`.
    const footer = css.match(/\n\.chat-footer\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(footer).toContain('flex-wrap: wrap')
    expect(footer).toContain('min-width: 0')

    // The metrics span shrinks and breaks its long "model · ms · tok/s" string.
    // Anchor to the standalone rule (newline-prefixed) so a role-scoped rule
    // like `.chat-message[data-role="user"] .chat-footer-metrics` is not matched.
    const metrics = css.match(/\n\.chat-footer-metrics\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(metrics).toContain('min-width: 0')
    expect(metrics).toContain('overflow-wrap: anywhere')

    // The minimal-mode group label truncates (ellipsis) to keep the dense one
    // line while shrinking inside its flex summary at narrow widths.
    const groupLabel = block('.chat-group-summary-label')
    expect(groupLabel).toContain('min-width: 0')
    expect(groupLabel).toContain('overflow: hidden')
    expect(groupLabel).toContain('text-overflow: ellipsis')
    expect(groupLabel).toContain('white-space: nowrap')

    // The group summary can shrink so its truncating label takes the slack.
    expect(block('.chat-group-summary')).toContain('min-width: 0')

    // The `+N` overflow badge and header pills hold their intrinsic size (the
    // label absorbs the shrink), so they neither collapse nor wrap. The rule is
    // grouped (`.chat-group-more, .chat-row-timer, .chat-row-tps`), so match the
    // body whose selector list contains `.chat-group-more`.
    const groupMoreRule =
      css.match(new RegExp(`${escapeRegExp('.chat-group-more')}[^{]*\\{([^}]*)\\}`))?.[1] ?? ''
    expect(groupMoreRule).toContain('flex-shrink: 0')
  })

  it('depends on no UI kit, icon set, or markdown engine', () => {
    const graph = Object.keys({
      ...(pkg.dependencies ?? {}),
      ...(pkg.peerDependencies ?? {}),
      ...(pkg.optionalDependencies ?? {}),
    })
    // Match by name family/prefix so e.g. any `@radix-ui/*` or `@mui/*` package
    // is caught, not just an exact spelling.
    const forbiddenPrefixes = [
      '@fx/ui',
      'shadcn',
      '@radix-ui/',
      '@mui/',
      '@chakra-ui/',
      'antd',
      'lucide',
      'react-icons',
      '@heroicons/',
      '@tabler/icons',
      'react-markdown',
      'markdown-it',
      'marked',
      'remark',
      'rehype',
    ]
    for (const dep of graph) {
      for (const prefix of forbiddenPrefixes) {
        expect(dep.startsWith(prefix)).toBe(false)
      }
    }
  })
})

describe('extractDarkMediaBody brace scanner', () => {
  const wrap = (body: string) => `@media (prefers-color-scheme: dark) {${body}}`

  it('returns the balanced body for a plain block', () => {
    expect(extractDarkMediaBody(wrap(':root{--x:1}'))).toBe(':root{--x:1}')
  })

  it('ignores braces inside double-quoted string values', () => {
    // A `}` inside `content: "}"` must NOT close the media block early.
    const body = '.a::after{content:"}"}.b{--x:1}'
    expect(extractDarkMediaBody(wrap(body))).toBe(body)
  })

  it('ignores braces inside single-quoted string values', () => {
    const body = ".a::after{content:'{'}.b{--x:1}"
    expect(extractDarkMediaBody(wrap(body))).toBe(body)
  })

  it('honors backslash escapes inside string literals', () => {
    // `"\"}"` — the escaped quote does NOT end the string, so the brace stays
    // quoted and the trailing real quote closes it.
    const body = '.a::after{content:"\\"}"}.b{--x:1}'
    expect(extractDarkMediaBody(wrap(body))).toBe(body)
  })

  it('returns "" when there is no dark media block', () => {
    expect(extractDarkMediaBody(':root{--x:1}')).toBe('')
  })

  it('returns "" when the media block is never closed', () => {
    // No matching closing brace at depth 0 → scan falls through to ''.
    expect(extractDarkMediaBody('@media (prefers-color-scheme: dark) {:root{--x:1}')).toBe('')
  })
})
