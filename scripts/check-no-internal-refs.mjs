#!/usr/bin/env node
/**
 * No-private-application-references check.
 *
 * Greps the publishable source (`packages/`) and the demo source (`demos/`) for
 * tokens that would indicate a leak of an internal/private application into this
 * open-source repository: internal package names, `@/…` path aliases, internal
 * deep imports, etc. Any match fails the check.
 *
 * Usage: `node scripts/check-no-internal-refs.mjs`
 * Exits 0 when clean, 1 when any forbidden token is found.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Directories (relative to repo root) scanned for forbidden tokens. Covers the
 * publishable source, the demo source, and the CI/CD workflows that ship in the
 * open-source repository.
 */
export const SCAN_DIRS = ['packages', 'demos', '.github']

/** Individual repo-root files scanned in addition to the directories above. */
export const SCAN_ROOT_FILES = ['README.md', 'package.json']

/** File extensions that are scanned. */
export const SCAN_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.json',
  '.html',
  '.md',
  '.yml',
  '.yaml',
])

/** Directory names skipped entirely while walking. */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.vite'])

/**
 * Forbidden token patterns. Each entry is a label + RegExp. The patterns target
 * references to the private application this package was extracted from.
 */
export const FORBIDDEN_PATTERNS = [
  { label: 'internal-app-name (fx/ai)', re: /\bfx\/ai\b/ },
  { label: 'alias-import (@/…)', re: /(^|[^\w@])@\/[\w-]/ },
]

/** Recursively collect scannable files under `dir`. */
export function collectFiles(dir) {
  const files = []
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return files
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue
      files.push(...collectFiles(full))
    } else if (SCAN_EXTENSIONS.has(extname(entry))) {
      files.push(full)
    }
  }
  return files
}

/**
 * Scan the given root for forbidden tokens across `dirs` (recursively) plus
 * `rootFiles` (individual repo-root files).
 * @returns {{file: string, line: number, label: string, text: string}[]}
 */
export function scanForInternalRefs(
  root = repoRoot,
  dirs = SCAN_DIRS,
  rootFiles = SCAN_ROOT_FILES,
) {
  /** @type {{file: string, line: number, label: string, text: string}[]} */
  const violations = []
  const files = []
  for (const dir of dirs) {
    files.push(...collectFiles(join(root, dir)))
  }
  for (const name of rootFiles) {
    const candidate = join(root, name)
    if (existsSync(candidate) && SCAN_EXTENSIONS.has(extname(candidate))) {
      files.push(candidate)
    }
  }
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n')
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i]
      for (const { label, re } of FORBIDDEN_PATTERNS) {
        if (re.test(text)) {
          violations.push({ file: relative(root, file), line: i + 1, label, text: text.trim() })
        }
      }
    }
  }
  return violations
}

function main() {
  const violations = scanForInternalRefs()
  if (violations.length > 0) {
    console.error('Found forbidden internal references:\n')
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line} [${v.label}] ${v.text}`)
    }
    console.error(`\n${violations.length} violation(s). This is an open-source repository.`)
    process.exit(1)
  }
  console.log('No internal references found.')
}

// Run main() only when invoked directly (not when imported by tests). Compare
// normalized filesystem paths rather than raw file:// strings for portability.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main()
}
