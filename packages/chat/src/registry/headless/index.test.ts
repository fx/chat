import { describe, expect, it } from 'vitest'
import { headlessComponents } from './index'

describe('headlessComponents registry', () => {
  it('implements every primitive, the markdown slot, and the icon map', () => {
    expect(typeof headlessComponents.Button).toBe('function')
    expect(typeof headlessComponents.Badge).toBe('function')
    expect(typeof headlessComponents.Tooltip).toBe('function')
    expect(typeof headlessComponents.Collapsible).toBe('function')
    expect(typeof headlessComponents.CodeBlock).toBe('function')
    expect(typeof headlessComponents.JsonView).toBe('function')
    expect(typeof headlessComponents.ScrollArea).toBe('function')
    expect(typeof headlessComponents.Avatar).toBe('function')
    expect(typeof headlessComponents.CopyButton).toBe('function')
    expect(typeof headlessComponents.Markdown).toBe('function')
    expect(typeof headlessComponents.Lightbox).toBe('function')
    expect(typeof headlessComponents.icons).toBe('object')
  })

  it('points the registry icon map at the headless icon set', () => {
    expect(typeof headlessComponents.icons.spinner).toBe('function')
    expect(typeof headlessComponents.icons.close).toBe('function')
  })
})
