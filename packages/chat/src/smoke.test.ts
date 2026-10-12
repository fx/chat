import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = resolve(here, '..')
const pkg = JSON.parse(readFileSync(resolve(pkgDir, 'package.json'), 'utf8'))

/** Read the package's shipped structure stylesheet once for the CSS assertions. */
const readStructureCss = (): string =>
  readFileSync(resolve(pkgDir, pkg.exports['./structure.css']), 'utf8')

/**
 * Smoke test for the public package surface. Asserts that all three public
 * entry points resolve, that the package is HEADLESS — it ships ONLY layout
 * mechanics in `structure.css` and NO visual theme (colors/tokens/bubbles come
 * from the host via the `classNames` API) — and that the surface pulls in no
 * UI-kit / icon-set / markdown-engine dependency. We assert these structurally
 * (the package manifest + the stylesheet text) rather than from pixels.
 */
describe('@fx-/chat public surface', () => {
  it('resolves the root entry point via its package specifier', async () => {
    // Import through the published name so a broken `exports` map or a missing
    // built subpath fails the test exactly as it would fail a consumer.
    const root = await import('@fx-/chat')
    expect(typeof root.cx).toBe('function')
    expect(root.version).toBe(pkg.version)
  })

  it('resolves the headless entry point via its package specifier', async () => {
    const headless = await import('@fx-/chat/headless')
    expect(headless.headlessComponents).toBeDefined()
    expect(typeof headless.headlessComponents.Button).toBe('function')
    expect(typeof headless.headlessComponents.icons).toBe('object')
  })

  it('declares the three required subpath exports (CSS export is structure.css)', () => {
    // The CSS subpath is now `./structure.css` (layout mechanics only); the old
    // `./styles.css` theme export was removed when the package went headless.
    expect(Object.keys(pkg.exports).sort()).toEqual(['.', './headless', './structure.css'])
    expect(pkg.exports).not.toHaveProperty('./styles.css')
  })

  it('points the CSS export and the published files list at structure.css, not styles.css', () => {
    expect(pkg.exports['./structure.css']).toBe('./src/structure.css')
    // `files` ships the structure stylesheet (so the source subpath resolves for
    // consumers) and never the deleted theme stylesheet.
    expect(pkg.files).toContain('src/structure.css')
    expect(pkg.files).not.toContain('src/styles.css')
  })

  it('ships structure.css but no longer ships styles.css', () => {
    const structurePath = resolve(pkgDir, pkg.exports['./structure.css'])
    expect(existsSync(structurePath)).toBe(true)
    // The deleted visual stylesheet must stay gone — its old on-disk location.
    expect(existsSync(resolve(pkgDir, 'src/styles.css'))).toBe(false)
  })

  it('keeps React as a peer dependency and depends only on @fx-/chat-core', () => {
    expect(pkg.peerDependencies).toHaveProperty('react')
    expect(pkg.peerDependencies).toHaveProperty('react-dom')
    expect(pkg.dependencies ?? {}).toEqual({ '@fx-/chat-core': 'workspace:*' })
  })

  it('ships the animation keyframes that raw-CSS consumers cannot supply as utilities', () => {
    // @keyframes cannot be expressed as a per-element host utility class, so the
    // package must carry the spinner + lightbox-fade keyframes itself.
    const css = readStructureCss()
    expect(css).toMatch(/@keyframes\s+chat-spin\s*\{/)
    expect(css).toMatch(/@keyframes\s+chat-lightbox-fade\s*\{/)
  })

  it('drives the active-affordance + completion spinner from the chat-spin keyframes', () => {
    // The active-affordance icon and the completion loader animate via the
    // package-owned `chat-spin` keyframes (a host may ignore these hooks and
    // supply its own spinner utility).
    const css = readStructureCss()
    const block = (selector: string) => {
      const m = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))
      return m?.[1] ?? ''
    }
    // The completion spinner carries the animation shorthand referencing chat-spin.
    const spinner = block('\\.chat-completion-spinner')
    expect(spinner).toMatch(/animation:\s*chat-spin/)
  })

  it('ships the mention-overlay alignment box shared by the overlay and textarea', () => {
    // The highlight overlay sits behind the textarea; both MUST share one box so
    // highlighted runs line up exactly with the typed text. The shared metrics
    // are mechanical (box-model/font/wrapping), not thematic.
    const css = readStructureCss()
    const shared = css.match(
      /\.chat-input-overlay,\s*\n?\s*\.chat-input-textarea\s*\{([^}]*)\}/,
    )?.[1]
    expect(shared).toBeDefined()
    expect(shared).toContain('box-sizing: border-box')
    expect(shared).toContain('white-space: pre-wrap')
    // The alignment field establishes the positioning context for the overlay.
    const field = css.match(/\.chat-input-field\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(field).toContain('position: relative')
  })

  it('positions the lightbox as a fixed full-viewport overlay', () => {
    // The lightbox backdrop is a fixed full-viewport overlay; this positioning
    // cannot be a per-element utility and ships in structure.css.
    const css = readStructureCss()
    const lightbox = css.match(/\.chat-lightbox\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(lightbox).toContain('position: fixed')
    expect(lightbox).toMatch(/inset:\s*0/)
  })

  it('floats the completion popup above content via a fixed-overlay z-index', () => {
    // The popup floats above content and its scroll region caps its height —
    // structural mechanics the host theme builds on top of.
    const css = readStructureCss()
    const popup = css.match(/\.chat-completion-popup\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(popup).toMatch(/z-index:\s*\d+/)
    const scroll = css.match(/\.chat-completion-scroll\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(scroll).toContain('overflow-y: auto')
  })

  it('honors prefers-reduced-motion by dropping the spinner animation', () => {
    // Animations MUST honor a reduced-motion preference (a standing a11y
    // constraint), so a reduced-motion media block must drop the spinners.
    const css = readStructureCss()
    const m = css.match(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{([\s\S]*?)\}\s*\}/)
    expect(m).not.toBeNull()
    const body = m?.[1] ?? ''
    expect(body).toMatch(/animation:\s*none/)
  })

  it('ships NO visual theme: no --chat-* token definitions in structure.css', () => {
    // Headless invariant: all colors/tokens come from the host via classNames.
    // A regression that dumps the old theme back into the package would
    // re-introduce `--chat-*` custom-property DEFINITIONS — assert their absence.
    const css = readStructureCss()
    // No custom-property declaration (`--chat-…:`) of any kind.
    expect(css).not.toMatch(/--chat-[\w-]+\s*:/)
    // And no `var(--chat-…)` consumption (the mechanics use no theme tokens).
    expect(css).not.toMatch(/var\(\s*--chat-/)
  })

  it('ships NO bubble / color visual rules in structure.css', () => {
    // Representative absences so a regression that re-adds the transcript LOOK
    // (role bubbles, colors, the answer-bubble padding/background) fails here.
    const css = readStructureCss()
    // No role-bubble theming on the answer text block.
    expect(css).not.toContain('.chat-text')
    expect(css).not.toContain('--chat-user-bubble-bg')
    expect(css).not.toContain('--chat-assistant-bubble-bg')
    // No data-role bubble selectors and no data-theme token blocks.
    expect(css).not.toContain('[data-role=')
    expect(css).not.toContain('[data-theme=')
    // No OS-dark theme media block (visual concern, host-owned now).
    expect(css).not.toContain('prefers-color-scheme')
    // No raw color literals (hex / rgb / hsl) — the package ships no colors.
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/)
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
