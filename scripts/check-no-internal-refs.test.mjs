import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  FORBIDDEN_PATTERNS,
  SCAN_DIRS,
  collectFiles,
  scanForInternalRefs,
} from './check-no-internal-refs.mjs'

let root

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'norefs-'))
  mkdirSync(join(root, 'packages', 'chat', 'src'), { recursive: true })
  mkdirSync(join(root, 'demos', 'chat-demo', 'src'), { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('scanForInternalRefs', () => {
  it('returns no violations for clean source', () => {
    writeFileSync(join(root, 'packages', 'chat', 'src', 'a.ts'), "export const x = 'clean'\n")
    writeFileSync(join(root, 'demos', 'chat-demo', 'src', 'b.tsx'), "import './styles.css'\n")
    expect(scanForInternalRefs(root, SCAN_DIRS)).toEqual([])
  })

  it('flags the internal application name', () => {
    writeFileSync(join(root, 'packages', 'chat', 'src', 'a.ts'), '// see fx/ai for origin\n')
    const v = scanForInternalRefs(root, SCAN_DIRS)
    expect(v).toHaveLength(1)
    expect(v[0].label).toContain('fx/ai')
    expect(v[0].line).toBe(1)
  })

  it('flags @/ alias imports', () => {
    writeFileSync(join(root, 'demos', 'chat-demo', 'src', 'b.ts'), "import x from '@/lib/db'\n")
    const v = scanForInternalRefs(root, SCAN_DIRS)
    expect(v).toHaveLength(1)
    expect(v[0].label).toContain('@/')
  })

  it('does not flag scoped packages like @fx/chat', () => {
    writeFileSync(
      join(root, 'demos', 'chat-demo', 'src', 'b.ts'),
      "import { cx } from '@fx/chat'\n",
    )
    expect(scanForInternalRefs(root, SCAN_DIRS)).toEqual([])
  })

  it('skips node_modules and dist directories', () => {
    mkdirSync(join(root, 'packages', 'chat', 'node_modules'), { recursive: true })
    mkdirSync(join(root, 'packages', 'chat', 'dist'), { recursive: true })
    writeFileSync(join(root, 'packages', 'chat', 'node_modules', 'x.ts'), 'fx/ai\n')
    writeFileSync(join(root, 'packages', 'chat', 'dist', 'y.ts'), 'fx/ai\n')
    expect(scanForInternalRefs(root, SCAN_DIRS)).toEqual([])
  })

  it('ignores non-scanned file extensions', () => {
    writeFileSync(join(root, 'packages', 'chat', 'src', 'notes.txt'), 'fx/ai\n')
    expect(scanForInternalRefs(root, SCAN_DIRS)).toEqual([])
  })

  it('returns an empty list when a scan dir is missing', () => {
    expect(collectFiles(join(root, 'does-not-exist'))).toEqual([])
  })

  it('does not follow symlinked files or directories', () => {
    const src = join(root, 'packages', 'chat', 'src')
    writeFileSync(join(src, 'real.ts'), 'fx/ai\n')
    // A symlink pointing back up at the repo would otherwise cause escape/loops.
    symlinkSync(src, join(src, 'loop'))
    symlinkSync(join(src, 'real.ts'), join(src, 'alias.ts'))
    const files = collectFiles(src)
    expect(files.map((f) => basename(f)).sort()).toEqual(['real.ts'])
  })

  it('scans every scannable repo-root file', () => {
    writeFileSync(join(root, 'README.md'), '# clean\nsee fx/ai\n')
    writeFileSync(join(root, 'tsconfig.json'), '{ "compilerOptions": {} }\n')
    const v = scanForInternalRefs(root, [])
    expect(v).toHaveLength(1)
    expect(v[0].file).toBe('README.md')
    expect(v[0].line).toBe(2)
  })

  it('scans extensionless root dotfiles', () => {
    writeFileSync(join(root, '.npmrc'), 'see fx/ai\n')
    const v = scanForInternalRefs(root, [])
    expect(v).toHaveLength(1)
    expect(v[0].file).toBe('.npmrc')
    expect(v[0].line).toBe(1)
  })

  it('ignores non-scannable root files and missing roots', () => {
    writeFileSync(join(root, 'LICENSE'), 'fx/ai\n')
    expect(scanForInternalRefs(root, [])).toEqual([])
    expect(scanForInternalRefs(join(root, 'absent'), [])).toEqual([])
  })

  it('can skip root-file scanning when disabled', () => {
    writeFileSync(join(root, 'README.md'), 'fx/ai\n')
    expect(scanForInternalRefs(root, [], false)).toEqual([])
  })

  it('exposes the forbidden pattern set', () => {
    expect(FORBIDDEN_PATTERNS.length).toBeGreaterThanOrEqual(2)
  })

  it('actually keeps this repository clean', () => {
    // Run against the real repo root with the production defaults (dirs + root
    // files). The file's dir is `scripts/`, so the repo root is one level up.
    const repoRoot = join(import.meta.dirname, '..')
    expect(scanForInternalRefs(repoRoot)).toEqual([])
  })
})
