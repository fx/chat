/**
 * The `@fx/chat-core` root entry MUST stay free of React, React-DOM, and Ink —
 * not even type-only imports — so non-React consumers (the agent runtime, a
 * future non-React renderer) can depend on it. Only `src/react/**` (the
 * `./react` subpath) may import React. `src/hooks/**` (the `./hooks` factory)
 * may import React's types only: it runs on whatever instance a host hands in.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = __dirname
const FORBIDDEN =
  /from\s+['"](react|react-dom|ink)(\/[^'"]*)?['"]|import\(\s*['"](react|react-dom|ink)['"]\s*\)/

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory())
      return entry.name === 'react' || entry.name === 'hooks' ? [] : sourceFiles(path)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
  })
}

describe('core root entry is React-free', () => {
  it('has no react / react-dom / ink import outside src/react', () => {
    const offenders = sourceFiles(SRC).filter((file) => FORBIDDEN.test(readFileSync(file, 'utf8')))
    expect(offenders.map((file) => relative(SRC, file))).toEqual([])
  })

  it('imports only React types in src/hooks', () => {
    const VALUE_IMPORT =
      /^import\s+(?!type\b)[^;]*from\s+['"](react|react-dom|ink)(\/[^'"]*)?['"]|(?<!typeof\s)import\(\s*['"](react|react-dom|ink)['"]\s*\)/m
    const hooks = readdirSync(join(SRC, 'hooks'))
      .filter((name) => !/\.test\.tsx?$/.test(name))
      .map((name) => join(SRC, 'hooks', name))
    const offenders = hooks.filter((file) => VALUE_IMPORT.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
    expect(VALUE_IMPORT.test("import { useState } from 'react'")).toBe(true)
    expect(VALUE_IMPORT.test("import type { ReactNode } from 'react'")).toBe(false)
    expect(VALUE_IMPORT.test("type R = typeof import('react')")).toBe(false)
    expect(VALUE_IMPORT.test("await import('react')")).toBe(true)
  })

  it('exposes the documented surface from the root and ./react entries', async () => {
    const root = await import('./index')
    const react = await import('./react')
    const json = await import('./json')
    const hooks = await import('./hooks')
    expect(Object.keys(hooks).sort()).toEqual(['createCoreHooks', 'createSharedClock'])
    expect(Object.keys(json).sort()).toEqual([
      'layoutJson',
      'looksLikeJson',
      'parseLooseJson',
      'prettyJson',
    ])
    expect(Object.keys(root)).toEqual(
      expect.arrayContaining([
        'normalizeTranscript',
        'groupBlocks',
        'mergeTimeline',
        'summarizeBlock',
        'formatDuration',
        'referenceProvider',
        'parseMentions',
        'isSafeAttachmentUrl',
      ]),
    )
    expect(Object.keys(react).sort()).toEqual([
      'ClockProvider',
      'createSharedClock',
      'useClock',
      'useElapsedTimer',
      'useFlashComplete',
      'useLiveTokensPerSecond',
      'usePrefersReducedMotion',
      'useSharedClock',
      'useTicks',
    ])
  })
})
