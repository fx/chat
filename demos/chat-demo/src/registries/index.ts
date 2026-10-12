/**
 * Registry catalog.
 *
 * The three interchangeable design-system adapters, keyed by id. Each entry is a
 * thin `ChatComponents` registry plus a label (the shadcn one is the published
 * `@fx-/chat-shadcn` registry). Every pane is styled by the same `classNames`
 * theme (`@fx-/chat-shadcn`'s) against the demo's Tailwind design tokens and uses
 * the `.dark` class for dark mode — the panes differ only in WHICH components
 * render the registry slots, not in how the surface is styled.
 */
import type { ChatComponents } from '@fx-/chat'
import { shadcnComponents } from '@fx-/chat-shadcn'
import { fxUiRegistry } from './fx-ui'
import { headlessRegistry } from './headless'

/** A selectable registry id. */
export type RegistryId = 'fx-ui' | 'shadcn' | 'headless'

/** Metadata + components for one registry adapter. */
export interface RegistryEntry {
  id: RegistryId
  label: string
  components: ChatComponents
}

/** The ordered registry catalog. */
export const REGISTRIES: Record<RegistryId, RegistryEntry> = {
  'fx-ui': {
    id: 'fx-ui',
    label: 'fx-ui',
    components: fxUiRegistry,
  },
  shadcn: {
    id: 'shadcn',
    label: 'shadcn',
    components: shadcnComponents,
  },
  headless: {
    id: 'headless',
    label: 'headless',
    components: headlessRegistry,
  },
}

/** The registry ids in display order. */
export const REGISTRY_IDS = Object.keys(REGISTRIES) as RegistryId[]
