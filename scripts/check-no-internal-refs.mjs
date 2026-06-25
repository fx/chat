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
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Directories (relative to repo root) scanned for forbidden tokens. Covers the
 * publishable source, the demo source, and the CI/CD workflows that ship in the
 * open-source repository.
 */
export const SCAN_DIRS = ['packages', 'demos', '.github']

/**
 * Repo-root files are scanned too (non-recursively): every scannable top-level
 * file is checked, so newly added root config (tsconfig, biome, vitest, …) is
 * covered without enumerating each by hand. `docs/` is intentionally not
 * scanned — it holds the spec/change prose, which legitimately discusses the
 * extraction's origin.
 */

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

/**
 * Recursively collect scannable files under `dir`. Symlinks are skipped so the
 * walk can never escape the repo or recurse infinitely.
 */
export function collectFiles(dir) {
  const files = []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return files
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      files.push(...collectFiles(full))
    } else if (entry.isFile() && SCAN_EXTENSIONS.has(extname(entry.name))) {
      files.push(full)
    }
  }
  return files
}

/**
 * True for files that should be scanned at the repo root: any file with a
 * scannable extension, plus extensionless dotfiles (e.g. `.gitignore`,
 * `.npmrc`) which can leak internal registry hosts or aliases.
 */
export function isScannableRootFile(name) {
  return SCAN_EXTENSIONS.has(extname(name)) || /^\.[^.]+$/.test(name)
}

/** Collect scannable files directly in `dir` (non-recursive), skipping symlinks. */
export function collectRootFiles(dir) {
  const files = []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return files
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink() || !entry.isFile()) continue
    if (isScannableRootFile(entry.name)) {
      files.push(join(dir, entry.name))
    }
  }
  return files
}

/**
 * Scan the given root for forbidden tokens across `dirs` (recursively) plus
 * `rootFiles` (individual repo-root files).
 * @returns {{file: string, line: number, label: string, text: string}[]}
 */
export function scanForInternalRefs(root = repoRoot, dirs = SCAN_DIRS, scanRootFiles = true) {
  /** @type {{file: string, line: number, label: string, text: string}[]} */
  const violations = []
  const files = []
  for (const dir of dirs) {
    files.push(...collectFiles(join(root, dir)))
  }
  if (scanRootFiles) {
    files.push(...collectRootFiles(root))
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
