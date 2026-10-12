import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  FORBIDDEN_PATTERNS,
  SCAN_DIRS,
  collectFiles,
  isMainModule,
  isScannableRootFile,
  readDirSafe,
  runCheck,
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

  it('does not flag scoped packages like @fx-/chat', () => {
    writeFileSync(
      join(root, 'demos', 'chat-demo', 'src', 'b.ts'),
      "import { cx } from '@fx-/chat'\n",
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
    const repoRoot = join(__dirname, '..')
    expect(scanForInternalRefs(repoRoot)).toEqual([])
  })
})

describe('isScannableRootFile', () => {
  it('accepts files with scannable extensions and extensionless dotfiles', () => {
    expect(isScannableRootFile('package.json')).toBe(true)
    expect(isScannableRootFile('.gitignore')).toBe(true)
    expect(isScannableRootFile('.npmrc')).toBe(true)
  })

  it('rejects unscannable files and dotted directories-as-names', () => {
    expect(isScannableRootFile('LICENSE')).toBe(false)
    expect(isScannableRootFile('binary.bin')).toBe(false)
    expect(isScannableRootFile('.config.local')).toBe(false)
  })
})

describe('readDirSafe', () => {
  it('returns entries for a real directory', () => {
    const entries = readDirSafe(root)
    expect(Array.isArray(entries)).toBe(true)
  })

  it('returns an empty list for a missing directory (ENOENT)', () => {
    expect(readDirSafe(join(root, 'nope'))).toEqual([])
  })

  it('rethrows non-ENOENT errors', () => {
    // A path that exists but is a file, not a directory, throws ENOTDIR.
    const file = join(root, 'a-file.ts')
    writeFileSync(file, 'x\n')
    expect(() => readDirSafe(file)).toThrow()
  })
})

describe('runCheck', () => {
  it('returns 0 and logs success on a clean tree', () => {
    const logs = []
    const errors = []
    const code = runCheck(root, { log: (m) => logs.push(m), error: (m) => errors.push(m) })
    expect(code).toBe(0)
    expect(logs.join('\n')).toContain('No internal references found')
    expect(errors).toEqual([])
  })

  it('returns 1 and reports each violation', () => {
    writeFileSync(join(root, 'packages', 'chat', 'src', 'leak.ts'), 'fx/ai\n')
    const errors = []
    const code = runCheck(root, { log: () => {}, error: (m) => errors.push(m) })
    expect(code).toBe(1)
    expect(errors.join('\n')).toContain('leak.ts')
    expect(errors.join('\n')).toContain('violation(s)')
  })
})

describe('isMainModule', () => {
  it('is true when argv1 resolves to the module url', () => {
    const url = import.meta.url
    expect(isMainModule(url, fileURLToPath(url))).toBe(true)
  })

  it('is false for a different entry point or no argv', () => {
    expect(isMainModule(import.meta.url, '/some/other/file.mjs')).toBe(false)
    expect(isMainModule(import.meta.url, undefined)).toBe(false)
  })
})
