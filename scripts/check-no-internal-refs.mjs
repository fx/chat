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
 * publishable source, the demo and reference-app sources, and the CI/CD workflows that ship in the
 * open-source repository.
 */
export const SCAN_DIRS = ['packages', 'demos', 'apps', '.github']

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
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.vite',
  'target',
  'build',
  '.gradle',
])

/**
 * Forbidden token patterns. Each entry is a label + RegExp. The patterns target
 * references to the private application this package was extracted from.
 */
export const FORBIDDEN_PATTERNS = [
  { label: 'internal-app-name (fx/ai)', re: /\bfx\/ai\b/ },
  { label: 'alias-import (@/…)', re: /(^|[^\w@])@\/[\w-]/ },
]

/**
 * Read a directory's entries. A missing directory (ENOENT) yields `[]` — that's
 * an expected, benign case (an optional scan root may not exist). Any other
 * error (permissions, I/O) is rethrown so a broken scan fails loudly instead of
 * silently reporting the repo clean.
 */
export function readDirSafe(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch (err) {
    if (err && err.code === 'ENOENT') return []
    throw err
  }
}

/**
 * Recursively collect scannable files under `dir`. Symlinks are skipped so the
 * walk can never escape the repo or recurse infinitely.
 */
export function collectFiles(dir) {
  const files = []
  for (const entry of readDirSafe(dir)) {
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
  for (const entry of readDirSafe(dir)) {
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

/**
 * Run the check against `root` and report. Returns the process exit code
 * (0 clean, 1 violations) instead of calling `process.exit`, so it is testable.
 * @param {string} [root]
 * @param {{ error: (msg: string) => void, log: (msg: string) => void }} [io]
 */
export function runCheck(root = repoRoot, io = console) {
  const violations = scanForInternalRefs(root)
  if (violations.length > 0) {
    io.error('Found forbidden internal references:\n')
    for (const v of violations) {
      io.error(`  ${v.file}:${v.line} [${v.label}] ${v.text}`)
    }
    io.error(`\n${violations.length} violation(s). This is an open-source repository.`)
    return 1
  }
  io.log('No internal references found.')
  return 0
}

/** True when this module is the process entry point (invoked directly). */
export function isMainModule(metaUrl = import.meta.url, argv1 = process.argv[1]) {
  // Compare normalized filesystem paths rather than raw file:// strings.
  return Boolean(argv1) && fileURLToPath(metaUrl) === resolve(argv1)
}

/* c8 ignore start -- entry-point side effect; logic is covered via runCheck/isMainModule */
if (isMainModule()) {
  process.exit(runCheck())
}
/* c8 ignore stop */
