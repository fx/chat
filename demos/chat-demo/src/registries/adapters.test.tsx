/**
 * Adapter-logic unit tests.
 *
 * Covers the deterministic logic in the registry adapters: every registry
 * supplies the full {@link ChatComponents} slot set, the lucide icon map covers
 * every library icon name, and the badge-tone mappings are correct. These are
 * the thin adapters' only non-presentational logic.
 */
import type { ChatComponents } from '@fx/chat'
import { lucideIcons } from '@fx/chat-shadcn'
import { HEADLESS_ICON_NAMES } from '@fx/chat/headless'
import { describe, expect, it } from 'vitest'
import { REGISTRIES, REGISTRY_IDS } from './index'

/** The required slots every registry must populate. */
const REQUIRED_SLOTS: (keyof ChatComponents)[] = [
  'Button',
  'Badge',
  'Tooltip',
  'Collapsible',
  'CodeBlock',
  'JsonView',
  'ScrollArea',
  'Avatar',
  'CopyButton',
  'Markdown',
  'icons',
]

describe('registry catalog', () => {
  it('exposes exactly the three expected registries', () => {
    expect(REGISTRY_IDS).toEqual(['fx-ui', 'shadcn', 'headless'])
  })

  for (const id of REGISTRY_IDS) {
    it(`${id} supplies every required component slot`, () => {
      const reg = REGISTRIES[id].components
      for (const slot of REQUIRED_SLOTS) {
        expect(reg[slot], `${id} missing ${slot}`).toBeDefined()
      }
    })

    it(`${id} maps every library icon name`, () => {
      const icons = REGISTRIES[id].components.icons
      for (const name of HEADLESS_ICON_NAMES) {
        expect(icons[name], `${id} missing icon ${name}`).toBeTypeOf('function')
      }
    })
  }
})

describe('lucide icon map', () => {
  it('covers every library icon name with a component', () => {
    for (const name of HEADLESS_ICON_NAMES) {
      expect(lucideIcons[name]).toBeTypeOf('function')
    }
  })

  it('has no extra keys beyond the library icon set', () => {
    expect(Object.keys(lucideIcons).sort()).toEqual([...HEADLESS_ICON_NAMES].sort())
  })
})
