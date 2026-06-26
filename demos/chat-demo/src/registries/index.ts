/**
 * Registry catalog.
 *
 * The three interchangeable design-system adapters, keyed by id. Each entry is a
 * thin `ChatComponents` registry plus a label and the wrapper class the demo
 * applies to scope that registry's theme tokens (headless uses the package's
 * `--chat-*` variables via `data-theme`; fx-ui and shadcn use the Tailwind
 * `.dark` class + `--background`/`--foreground` token set).
 */
import type { ChatComponents } from '@fx/chat'
import { fxUiRegistry } from './fx-ui'
import { headlessRegistry } from './headless'
import { shadcnRegistry } from './shadcn'

/** A selectable registry id. */
export type RegistryId = 'fx-ui' | 'shadcn' | 'headless'

/** Metadata + components for one registry adapter. */
export interface RegistryEntry {
  id: RegistryId
  label: string
  components: ChatComponents
  /** How this registry expresses dark mode: the package var hook vs Tailwind. */
  themeKind: 'chat-vars' | 'tailwind'
}

/** The ordered registry catalog. */
export const REGISTRIES: Record<RegistryId, RegistryEntry> = {
  'fx-ui': {
    id: 'fx-ui',
    label: 'fx-ui',
    components: fxUiRegistry,
    themeKind: 'tailwind',
  },
  shadcn: {
    id: 'shadcn',
    label: 'shadcn',
    components: shadcnRegistry,
    themeKind: 'tailwind',
  },
  headless: {
    id: 'headless',
    label: 'headless',
    components: headlessRegistry,
    themeKind: 'chat-vars',
  },
}

/** The registry ids in display order. */
export const REGISTRY_IDS = Object.keys(REGISTRIES) as RegistryId[]
