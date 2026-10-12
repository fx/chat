/**
 * `cx` — a `clsx`-style class-name joiner, vendored so the package carries no
 * runtime dependency.
 *
 * Lives in its own dependency-free leaf module (rather than the package barrel)
 * so render/input components can import it WITHOUT pulling in — or creating an
 * import cycle through — the root barrel, which itself re-exports the render and
 * input layers. The barrel re-exports `cx` + `ClassValue` so the public surface
 * (`import { cx } from '@fx-/chat'`) is unchanged.
 */

/** A value accepted by {@link cx}: a string, a falsy value, or a nested array. */
export type ClassValue = string | number | false | null | undefined | ClassValue[]

/**
 * Join class names. Accepts strings, falsy values, and nested arrays; ignores
 * anything falsy; joins the rest with a single space.
 */
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
