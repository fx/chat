/**
 * `@fx/chat` — framework-light, design-system-agnostic React components for
 * rendering and composing LLM chat conversations.
 *
 * This is the bootstrap surface. Feature changes (message model, component
 * registry, rendering, input composer) flesh out the real exports. For now the
 * root entry ships the package version and a tiny pure class-name joiner so the
 * build, type declarations, and import smoke tests have real, covered code to
 * exercise.
 */

/**
 * The published package version. Kept in lockstep with `package.json` — the
 * smoke test (`smoke.test.ts`) asserts `version === package.json.version`, so
 * any drift fails CI rather than shipping silently.
 */
export const version = '0.0.0'

export * from './model'

/**
 * The `clsx`-style class-name joiner + its value type. Implemented in the
 * dependency-free `./cx` leaf module so the render/input layers can import it
 * without an import cycle through this barrel; re-exported here so the public
 * surface (`import { cx } from '@fx/chat'`) is unchanged.
 */
export { cx } from './cx'
export type { ClassValue } from './cx'

export * from './registry'

export * from './mentions'

export * from './render'

export * from './input'
