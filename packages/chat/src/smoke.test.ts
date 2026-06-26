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

    // (b) The OS-dark media block targets only roots WITHOUT a data-theme.
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme\]\) \{/)
    // ...and never the bare `:root` (which would override an explicit theme).
    expect(css).not.toMatch(/@media \(prefers-color-scheme: dark\) \{\s*:root \{/)

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
