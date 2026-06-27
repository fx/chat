import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = resolve(here, '..')
const pkg = JSON.parse(readFileSync(resolve(pkgDir, 'package.json'), 'utf8'))

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
    const extractDarkMediaBody = (source: string): string => {
      const head = source.match(/@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)\s*\{/)
      if (head?.index === undefined) return ''
      let depth = 1
      const start = head.index + head[0].length
      for (let i = start; i < source.length; i++) {
        const ch = source[i]
        if (ch === '{') depth++
        else if (ch === '}') {
          depth--
          if (depth === 0) return source.slice(start, i)
        }
      }
      return ''
    }
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
    const tokensOf = (selector: string): Record<string, string> => {
      const m = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))
      const body = m?.[1] ?? ''
      const tokens: Record<string, string> = {}
      for (const decl of body.split(';')) {
        const dm = decl.match(/(--chat-[\w-]+)\s*:\s*(.+)/)
        if (dm?.[1] && dm[2]) tokens[dm[1]] = dm[2].trim()
      }
      return tokens
    }
    const root = tokensOf(':root')
    const explicitLight = tokensOf('\\[data-theme="light"\\]')
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
    // The assistant bubble has a dedicated dark surface in the explicit dark hook.
    expect(block('\\[data-theme="dark"\\]')).toContain('--chat-assistant-bubble-bg:')
    // …and under the OS-dark media block (a darker neutral than the light value).
    const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(cssNoComments).toMatch(
      /@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)\s*\{[\s\S]*--chat-assistant-bubble-bg:/,
    )
  })

  it('styles user/assistant role bubbles from the bubble tokens', () => {
    // Change 0009: the data-role bubble rules exist and reference the tokens, so
    // a turn reads as a conversation and hosts can restyle via the variables.
    const css = readFileSync(resolve(pkgDir, pkg.exports['./styles.css']), 'utf8')
    const block = (selector: string) => {
      const m = css.match(new RegExp(`${selector.replace(/[[\]"]/g, '\\$&')}\\s*\\{([^}]*)\\}`))
      return m?.[1] ?? ''
    }
    const user = block('.chat-message[data-role="user"]')
    expect(user).toContain('var(--chat-user-bubble-bg)')
    expect(user).toContain('var(--chat-user-bubble-fg)')
    expect(user).toContain('var(--chat-bubble-max-width)')
    expect(user).toMatch(/margin-left:\s*auto/)
    const assistant = block('.chat-message[data-role="assistant"]')
    expect(assistant).toContain('var(--chat-assistant-bubble-bg)')
    expect(assistant).toContain('var(--chat-assistant-bubble-fg)')
    expect(assistant).toContain('var(--chat-bubble-max-width)')
    // The user-bubble footer metrics use the full bubble foreground so they meet
    // WCAG AA contrast on the accent surface (no longer a sub-4.5:1 color-mix).
    const userMetrics = block('.chat-message[data-role="user"] .chat-footer-metrics')
    expect(userMetrics).toContain('var(--chat-user-bubble-fg)')
    expect(userMetrics).not.toContain('color-mix')
    // A mention inside a user bubble is re-toned to the bubble foreground so it is
    // not accent-on-accent (invisible) — the user bubble bg defaults to the accent.
    const userMention = block('.chat-message[data-role="user"] .chat-mention')
    expect(userMention).toContain('var(--chat-user-bubble-fg)')
  })

  it('defines minimal/density-mode rules driven by --chat-gap-compact', () => {
    // Change 0011: minimal mode tightens spacing via a compact gap token, applied
    // to the log and message wrappers keyed off data-minimal. Token-driven and
    // headless-only.
    const css = readFileSync(resolve(pkgDir, pkg.exports['./styles.css']), 'utf8')
    const block = (selector: string) => {
      const m = css.match(new RegExp(`${selector.replace(/[[\]"]/g, '\\$&')}\\s*\\{([^}]*)\\}`))
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
