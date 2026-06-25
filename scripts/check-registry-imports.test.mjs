import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  FORBIDDEN_PATTERNS,
  GUARDED_DIRS,
  collectFiles,
  isMainModule,
  readDirSafe,
  runCheck,
  scanForForbiddenImports,
} from './check-registry-imports.mjs'

const RENDER_DIR = ['packages', 'chat', 'src', 'render']
const INPUT_DIR = ['packages', 'chat', 'src', 'input']

let root

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'regimports-'))
  mkdirSync(join(root, ...RENDER_DIR), { recursive: true })
  mkdirSync(join(root, ...INPUT_DIR), { recursive: true })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('scanForForbiddenImports', () => {
  it('returns no violations when render/input go through the registry', () => {
    writeFileSync(
      join(root, ...RENDER_DIR, 'log.tsx'),
      "import { useChatComponents } from '../registry'\n",
    )
    writeFileSync(
      join(root, ...INPUT_DIR, 'composer.tsx'),
      "import { useChatComponents } from '../registry/context'\n",
    )
    expect(scanForForbiddenImports(root, GUARDED_DIRS)).toEqual([])
  })

  it('passes trivially when the guarded layers do not exist yet', () => {
    rmSync(join(root, ...RENDER_DIR), { recursive: true, force: true })
    rmSync(join(root, ...INPUT_DIR), { recursive: true, force: true })
    expect(scanForForbiddenImports(root, GUARDED_DIRS)).toEqual([])
  })

  it('flags a direct headless primitive import via relative path', () => {
    writeFileSync(
      join(root, ...RENDER_DIR, 'log.tsx'),
      "import { Button } from '../registry/headless/primitives'\n",
    )
    const v = scanForForbiddenImports(root, GUARDED_DIRS)
    expect(v).toHaveLength(1)
    expect(v[0].label).toContain('direct headless')
    expect(v[0].line).toBe(1)
  })

  it('flags a direct headless registry barrel import', () => {
    writeFileSync(
      join(root, ...INPUT_DIR, 'c.tsx'),
      "import { headlessComponents } from '../registry/headless'\n",
    )
    const v = scanForForbiddenImports(root, GUARDED_DIRS)
    expect(v).toHaveLength(1)
    expect(v[0].label).toContain('direct headless')
  })

  it('flags a direct @fx/chat/headless entry import', () => {
    writeFileSync(
      join(root, ...RENDER_DIR, 'd.tsx'),
      "import { headlessIcons } from '@fx/chat/headless'\n",
    )
    const v = scanForForbiddenImports(root, GUARDED_DIRS)
    expect(v).toHaveLength(1)
    expect(v[0].label).toContain('direct headless entry')
  })

  it('flags a UI-kit / icon-set / markdown-engine import', () => {
    writeFileSync(join(root, ...RENDER_DIR, 'e.tsx'), "import { Check } from 'lucide-react'\n")
    writeFileSync(join(root, ...INPUT_DIR, 'f.tsx'), "import md from 'react-markdown'\n")
    const v = scanForForbiddenImports(root, GUARDED_DIRS)
    expect(v).toHaveLength(2)
    expect(v.every((x) => x.label.includes('ui-kit'))).toBe(true)
  })

  it('ignores non-source extensions', () => {
    writeFileSync(join(root, ...RENDER_DIR, 'notes.txt'), "from 'lucide-react'\n")
    expect(scanForForbiddenImports(root, GUARDED_DIRS)).toEqual([])
  })

  it('does not follow symlinked files or directories', () => {
    const dir = join(root, ...RENDER_DIR)
    writeFileSync(join(dir, 'real.tsx'), "import x from '../registry'\n")
    symlinkSync(dir, join(dir, 'loop'))
    symlinkSync(join(dir, 'real.tsx'), join(dir, 'alias.tsx'))
    const files = collectFiles(dir)
    expect(files.map((f) => basename(f)).sort()).toEqual(['real.tsx'])
  })

  it('recurses into nested subdirectories', () => {
    const nested = join(root, ...RENDER_DIR, 'blocks')
    mkdirSync(nested, { recursive: true })
    writeFileSync(join(nested, 'tool.tsx'), "import x from 'lucide-react'\n")
    const v = scanForForbiddenImports(root, GUARDED_DIRS)
    expect(v).toHaveLength(1)
    expect(v[0].file).toContain('blocks')
  })

  it('skips node_modules and dist directories', () => {
    const nm = join(root, ...RENDER_DIR, 'node_modules')
    mkdirSync(nm, { recursive: true })
    writeFileSync(join(nm, 'x.tsx'), "import x from 'lucide-react'\n")
    expect(scanForForbiddenImports(root, GUARDED_DIRS)).toEqual([])
  })

  it('exposes the forbidden pattern set', () => {
    expect(FORBIDDEN_PATTERNS.length).toBeGreaterThanOrEqual(3)
  })

  it('keeps the real repository clean', () => {
    const repoRoot = join(__dirname, '..')
    expect(scanForForbiddenImports(repoRoot)).toEqual([])
  })
})

describe('readDirSafe', () => {
  it('returns entries for a real directory', () => {
    expect(Array.isArray(readDirSafe(root))).toBe(true)
  })

  it('returns an empty list for a missing directory (ENOENT)', () => {
    expect(readDirSafe(join(root, 'nope'))).toEqual([])
  })

  it('rethrows non-ENOENT errors', () => {
    const file = join(root, 'a-file.tsx')
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
    expect(logs.join('\n')).toContain('No registry-bypassing imports found')
    expect(errors).toEqual([])
  })

  it('returns 1 and reports each violation', () => {
    writeFileSync(join(root, ...RENDER_DIR, 'leak.tsx'), "import x from 'lucide-react'\n")
    const errors = []
    const code = runCheck(root, { log: () => {}, error: (m) => errors.push(m) })
    expect(code).toBe(1)
    expect(errors.join('\n')).toContain('leak.tsx')
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
