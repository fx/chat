import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const pkgDir = resolve(here, '..')

/**
 * Smoke test for the public package surface. Asserts that both public entry
 * points import and resolve, and — critically for the architecture spec — that
 * the headless surface pulls in no UI-kit / icon-set / markdown-engine
 * dependency. We assert agnosticism structurally (the package manifest) rather
 * than from pixels.
 */
describe('@fx/chat public surface', () => {
  it('resolves the root entry point', async () => {
    const root = await import('./index')
    expect(typeof root.cx).toBe('function')
    expect(root.version).toBe('0.0.0')
  })

  it('resolves the headless entry point', async () => {
    const headless = await import('./headless')
    expect(headless.headlessRegistry).toBeDefined()
    expect(typeof headless.isHeadlessSlot).toBe('function')
  })

  it('declares the three required subpath exports', () => {
    const pkg = JSON.parse(readFileSync(resolve(pkgDir, 'package.json'), 'utf8'))
    expect(Object.keys(pkg.exports).sort()).toEqual(['.', './headless', './styles.css'])
  })

  it('keeps React as a peer dependency and bundles no runtime deps', () => {
    const pkg = JSON.parse(readFileSync(resolve(pkgDir, 'package.json'), 'utf8'))
    expect(pkg.peerDependencies).toHaveProperty('react')
    expect(pkg.peerDependencies).toHaveProperty('react-dom')
    expect(pkg.dependencies ?? {}).toEqual({})
  })

  it('depends on no UI kit, icon set, or markdown engine', () => {
    const pkg = JSON.parse(readFileSync(resolve(pkgDir, 'package.json'), 'utf8'))
    const graph = {
      ...(pkg.dependencies ?? {}),
      ...(pkg.peerDependencies ?? {}),
    }
    const forbidden = [
      '@fx/ui',
      'shadcn',
      '@radix-ui',
      '@mui/material',
      '@chakra-ui/react',
      'antd',
      'lucide-react',
      'react-icons',
      '@heroicons/react',
      'react-markdown',
      'markdown-it',
      'marked',
      'remark',
    ]
    for (const name of forbidden) {
      expect(graph).not.toHaveProperty(name)
    }
  })
})
