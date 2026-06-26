// @vitest-environment node
/**
 * Base-path-awareness assertion.
 *
 * GitHub Pages serves the demo under the `/chat/` subpath, so the built asset
 * URLs MUST be prefixed with that base. This test runs a real production Vite
 * build into a temp directory and asserts the emitted `index.html` references its
 * JS/CSS assets under `/chat/` — the deployment would 404 otherwise.
 *
 * It is a build assertion, not a unit test, so it has a generous timeout and
 * uses the same `vite.config.ts` the deploy uses (no base override here).
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import { afterAll, describe, expect, it } from 'vitest'

const demoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = mkdtempSync(join(tmpdir(), 'chat-demo-base-'))

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true })
})

describe('base-path-aware build', () => {
  it('emits /chat/-prefixed asset URLs in index.html', async () => {
    await build({
      root: demoRoot,
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true },
    })

    const html = readFileSync(join(outDir, 'index.html'), 'utf8')
    const assetRefs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
    const localAssets = assetRefs.filter((ref) => ref.includes('/assets/'))

    expect(localAssets.length).toBeGreaterThan(0)
    for (const ref of localAssets) {
      expect(ref.startsWith('/chat/')).toBe(true)
    }
  }, 120_000)
})
