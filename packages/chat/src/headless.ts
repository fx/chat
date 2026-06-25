/**
 * `@fx/chat/headless` — the default, unstyled component registry surface.
 *
 * The headless entry carries **zero** design-system dependencies: no UI kit, no
 * icon set, no markdown engine. Feature changes populate it with the real
 * unstyled component set; for the bootstrap it exposes a minimal, real registry
 * object plus a pure lookup helper so the surface is importable, tree-shakeable,
 * and fully testable.
 */

/**
 * Immutable source of truth for the headless registry slot names. The guard and
 * the registry both derive from this so narrowing stays correct regardless of
 * how the exported registry object is consumed.
 */
const HEADLESS_SLOT_NAMES = ['Root', 'Message'] as const

/** Names of the headless registry slots shipped so far. */
export type HeadlessSlotName = (typeof HEADLESS_SLOT_NAMES)[number]

/**
 * The headless registry. Slots are intentionally `null` placeholders at the
 * bootstrap stage — they become real unstyled components in later changes. The
 * shape (and the guarantee of no UI-kit deps) is what later code and tests rely
 * on.
 */
export const headlessRegistry: Record<HeadlessSlotName, null> = {
  Root: null,
  Message: null,
}

const slotNameSet: ReadonlySet<string> = new Set(HEADLESS_SLOT_NAMES)

/** Returns true when the given name is a known headless registry slot. */
export function isHeadlessSlot(name: string): name is HeadlessSlotName {
  return slotNameSet.has(name)
}
