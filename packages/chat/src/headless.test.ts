import { describe, expect, it } from 'vitest'
import * as headless from './headless'

/**
 * The `@fx/chat/headless` entry must expose the complete default registry plus
 * its building blocks. These assertions guard the public shape of that entry;
 * behavioral coverage of each component lives in the registry test suite.
 */
describe('@fx/chat/headless entry', () => {
  it('exports the complete headless registry with every contract slot', () => {
    const r = headless.headlessComponents
    expect(typeof r.Button).toBe('function')
    expect(typeof r.Badge).toBe('function')
    expect(typeof r.Tooltip).toBe('function')
    expect(typeof r.Collapsible).toBe('function')
    expect(typeof r.CodeBlock).toBe('function')
    expect(typeof r.JsonView).toBe('function')
    expect(typeof r.ScrollArea).toBe('function')
    expect(typeof r.Avatar).toBe('function')
    expect(typeof r.CopyButton).toBe('function')
    expect(typeof r.Markdown).toBe('function')
    expect(typeof r.Lightbox).toBe('function')
    expect(typeof r.icons).toBe('object')
  })

  it('re-exports each individual primitive', () => {
    for (const name of [
      'Avatar',
      'Badge',
      'Button',
      'CodeBlock',
      'Collapsible',
      'CopyButton',
      'JsonView',
      'Lightbox',
      'ScrollArea',
      'Tooltip',
    ] as const) {
      expect(typeof headless[name]).toBe('function')
    }
  })

  it('re-exports the icon set, markdown component, and markdown parser', () => {
    expect(typeof headless.headlessIcons).toBe('object')
    expect(Array.isArray(headless.HEADLESS_ICON_NAMES)).toBe(true)
    expect(typeof headless.HeadlessMarkdown).toBe('function')
    expect(typeof headless.parseBlocks).toBe('function')
  })

  it('ships an inline SVG for every semantic icon name', () => {
    expect([...headless.HEADLESS_ICON_NAMES].sort()).toEqual(
      [
        'audio',
        'brain',
        'caretDown',
        'caretRight',
        'check',
        'close',
        'copy',
        'download',
        'expand',
        'file',
        'fork',
        'gear',
        'paperclip',
        'regenerate',
        'reset',
        'send',
        'spinner',
        'stop',
        'video',
        'wrench',
      ].sort(),
    )
  })
})
