import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

  it('scans repo-root files when present', () => {
    writeFileSync(join(root, 'README.md'), '# clean\nsee fx/ai\n')
    const v = scanForInternalRefs(root, [], ['README.md'])
    expect(v).toHaveLength(1)
    expect(v[0].file).toBe('README.md')
    expect(v[0].line).toBe(2)
  })

  it('ignores missing or non-scannable root files', () => {
    writeFileSync(join(root, 'LICENSE'), 'fx/ai\n')
    const v = scanForInternalRefs(root, [], ['LICENSE', 'absent.json'])
    expect(v).toEqual([])
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
