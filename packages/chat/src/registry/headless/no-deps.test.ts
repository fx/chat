import { readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Structural guarantee: importing `@fx-/chat/headless` pulls in no UI-kit, icon
 * set, or markdown engine. We assert this over the actual source of the headless
 * registry and everything it imports — every bare-package import across that
 * subtree must be `react`/`react-dom` only, never a forbidden family.
 */
const here = dirname(fileURLToPath(import.meta.url))
// Scan both the registry subtree and the published `@fx-/chat/headless`
// entrypoint (`src/headless.ts`) so the real export graph behind the entry is
// covered, not just the registry folder.
const registryDir = join(here, '..')
const headlessEntry = join(here, '..', '..', 'headless.ts')

const FORBIDDEN_PREFIXES = [
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

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx'])

/** Collect every non-test source file under the registry directory. */
function collectSources(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...collectSources(full))
    } else if (
      entry.isFile() &&
      SCAN_EXTENSIONS.has(extname(entry.name)) &&
      !/\.test\.tsx?$/.test(entry.name)
    ) {
      out.push(full)
    }
  }
  return out
}

/**
 * Extract bare-package specifiers (not relative `.`/`..`) from real
 * `import`/`export … from '…'` statements AND from side-effect-only imports
 * (`import '…'`). Anchored at line start so prose in doc comments (which may
 * contain `from '@fx-/chat'`) is never matched.
 */
function bareImports(source: string): string[] {
  const specs: string[] = []
  const fromRe = /^\s*(?:import|export)\b[^'"]*\bfrom\s+['"]([^'"]+)['"]/gm
  for (const match of source.matchAll(fromRe)) {
    const spec = match[1] as string
    if (!spec.startsWith('.')) specs.push(spec)
  }
  // Side-effect-only import: `import 'pkg'` (no binding, no `from`).
  const sideEffectRe = /^\s*import\s+['"]([^'"]+)['"]/gm
  for (const match of source.matchAll(sideEffectRe)) {
    const spec = match[1] as string
    if (!spec.startsWith('.')) specs.push(spec)
  }
  return specs
}

describe('@fx-/chat/headless dependency surface', () => {
  it('imports no UI-kit, icon set, or markdown engine across the registry source', () => {
    const files = [...collectSources(registryDir), headlessEntry]
    expect(files.length).toBeGreaterThan(0)
    const offenders: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const spec of bareImports(source)) {
        if (FORBIDDEN_PREFIXES.some((p) => spec.startsWith(p))) {
          offenders.push(`${file}: ${spec}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('only imports react/react-dom as bare packages', () => {
    const files = [...collectSources(registryDir), headlessEntry]
    const bare = new Set<string>()
    for (const file of files) {
      for (const spec of bareImports(readFileSync(file, 'utf8'))) {
        // Reduce subpath imports (e.g. react-dom/server) to their package root.
        const root = spec.startsWith('@')
          ? spec.split('/').slice(0, 2).join('/')
          : (spec.split('/')[0] as string)
        bare.add(root)
      }
    }
    for (const pkg of bare) {
      expect(['react', 'react-dom']).toContain(pkg)
    }
  })
})
