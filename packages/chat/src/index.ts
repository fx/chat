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
 * A `clsx`-style class-name joiner. Accepts strings, falsy values, and nested
 * arrays; ignores anything falsy; joins the rest with a single space.
 *
 * Vendored deliberately so the package carries no runtime dependency.
 */
export type ClassValue = string | number | false | null | undefined | ClassValue[]

export function cx(...values: ClassValue[]): string {
  const out: string[] = []
  for (const value of values) {
    if (!value) continue
    if (Array.isArray(value)) {
      const nested = cx(...value)
      if (nested) out.push(nested)
    } else {
      out.push(String(value))
    }
  }
  return out.join(' ')
}

export * from './registry'

export * from './mentions'

export * from './render'

export * from './input'
