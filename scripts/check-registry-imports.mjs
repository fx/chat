#!/usr/bin/env node
/**
 * Registry-import boundary check.
 *
 * Renderers and the composer (`packages/chat/src/render/**`,
 * `packages/chat/src/input/**`) MUST consume every styled primitive and icon
 * through the component registry context (`useChatComponents()`), never via a
 * direct import of a headless primitive, the headless icon set, or any UI-kit /
 * icon-set / markdown engine. This guard greps those layers for forbidden
 * imports.
 *
 * The directories may not exist yet (they arrive in later changes); the check
 * passes trivially until they do.
 *
 * CI enforcement: the companion test (`check-registry-imports.test.mjs`) runs
 * `scanForForbiddenImports(repoRoot)` against the real repository and asserts it
 * is clean. That test runs under `bun run test`, which CI executes — so the
 * boundary is enforced on every PR without touching the CI workflow. This file
 * also exposes a standalone CLI (`bun run check:registry-imports`) for local use.
 *
 * Usage: `node scripts/check-registry-imports.mjs`
 * Exits 0 when clean, 1 when any forbidden import is found.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Layers (relative to repo root) that must go through the registry. */
export const GUARDED_DIRS = ['packages/chat/src/render', 'packages/chat/src/input']

/** Scanned source extensions. */
export const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])

/** Directory names skipped while walking. */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.vite'])

/**
 * Forbidden import patterns. Each entry is a label + RegExp tested per line.
 * The patterns catch:
 *  - direct imports of the headless registry internals (primitives/icons), and
 *  - any UI-kit / icon-set / markdown-engine package import.
 */
/**
 * Each pattern is matched against the ENTIRE file content (not line by line) so
 * a multiline `import { … } from\n  '…'` is still caught. `\s` spans newlines,
 * and the `g` flag lets the scanner collect every occurrence and attribute it
 * to a line via the match offset.
 */
export const FORBIDDEN_PATTERNS = [
  {
    label: 'direct headless primitive/icon import',
    re: /from\s+['"][^'"]*\/registry\/headless(?:\/[^'"]*)?['"]/g,
  },
  {
    label: 'direct headless entry import',
    re: /from\s+['"]@fx\/chat\/headless['"]/g,
  },
  {
    // The in-package headless barrel (`packages/chat/src/headless.ts`) reached
    // via a relative path, e.g. `../headless` or `../../headless` — the most
    // likely in-package bypass form.
    label: 'relative headless barrel import',
    re: /from\s+['"](?:\.\.?\/)+headless(?:\.[jt]sx?)?['"]/g,
  },
  {
    label: 'ui-kit / icon-set / markdown-engine import',
    re: /from\s+['"](?:@fx\/ui|shadcn|@radix-ui\/|@mui\/|@chakra-ui\/|antd|lucide|lucide-react|react-icons|@heroicons\/|@tabler\/icons|react-markdown|markdown-it|marked|remark|rehype)/g,
  },
]

/**
 * Read a directory's entries. A missing directory (ENOENT) yields `[]` — the
 * expected, benign case when a guarded layer does not exist yet. Other errors
 * are rethrown so a broken scan fails loudly.
 */
export function readDirSafe(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch (err) {
    if (err && err.code === 'ENOENT') return []
    throw err
  }
}

/** Recursively collect scannable files under `dir`, skipping symlinks. */
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
 * Scan the guarded layers for forbidden imports.
 * @returns {{file: string, line: number, label: string, text: string}[]}
 */
export function scanForForbiddenImports(root = repoRoot, dirs = GUARDED_DIRS) {
  /** @type {{file: string, line: number, label: string, text: string}[]} */
  const violations = []
  const files = []
  for (const dir of dirs) {
    files.push(...collectFiles(join(root, dir)))
  }
  for (const file of files) {
    const content = readFileSync(file, 'utf8')
    for (const { label, re } of FORBIDDEN_PATTERNS) {
      // Reset lastIndex: the regexes are module-level and `g`-flagged, so they
      // carry state across calls/files.
      re.lastIndex = 0
      for (const match of content.matchAll(re)) {
        // `matchAll` always sets `index`. 1-based line number of the match start.
        const line = content.slice(0, match.index).split('\n').length
        // Report the matched text with internal newlines collapsed to a space.
        const text = match[0].replace(/\s+/g, ' ').trim()
        violations.push({ file: relative(root, file), line, label, text })
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
  const violations = scanForForbiddenImports(root)
  if (violations.length > 0) {
    io.error('Found forbidden registry-bypassing imports:\n')
    for (const v of violations) {
      io.error(`  ${v.file}:${v.line} [${v.label}] ${v.text}`)
    }
    io.error(
      `\n${violations.length} violation(s). render/ and input/ must consume primitives and icons via useChatComponents().`,
    )
    return 1
  }
  io.log('No registry-bypassing imports found.')
  return 0
}

/** True when this module is the process entry point (invoked directly). */
export function isMainModule(metaUrl = import.meta.url, argv1 = process.argv[1]) {
  return Boolean(argv1) && fileURLToPath(metaUrl) === resolve(argv1)
}

/* c8 ignore start -- entry-point side effect; logic is covered via runCheck/isMainModule */
if (isMainModule()) {
  process.exit(runCheck())
}
/* c8 ignore stop */
