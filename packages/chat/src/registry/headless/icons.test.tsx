import { render } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { IconName } from '../contract'
import { HEADLESS_ICON_NAMES, headlessIcons } from './icons'

const ALL_NAMES: IconName[] = [
  'spinner',
  'check',
  'caretRight',
  'caretDown',
  'copy',
  'wrench',
  'brain',
  'gear',
  'regenerate',
  'fork',
  'reset',
  'file',
  'audio',
  'video',
  'send',
  'stop',
  'paperclip',
  'close',
  'download',
  'expand',
]

describe('headlessIcons', () => {
  it('ships exactly one component per semantic icon name', () => {
    expect(HEADLESS_ICON_NAMES.slice().sort()).toEqual(ALL_NAMES.slice().sort())
  })

  it('is frozen so the shared default cannot be mutated', () => {
    expect(Object.isFrozen(headlessIcons)).toBe(true)
  })

  it.each(ALL_NAMES)('renders %s as an inline SVG with default size 16', (name) => {
    const Icon = headlessIcons[name]
    const { container } = render(<Icon />)
    const svg = container.querySelector('svg') as SVGElement
    expect(svg).toBeTruthy()
    expect(svg.getAttribute('width')).toBe('16')
    expect(svg.getAttribute('height')).toBe('16')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
  })

  it('forwards className and a custom size', () => {
    const Icon = headlessIcons.spinner
    const { container } = render(<Icon className="ic" size={24} />)
    const svg = container.querySelector('svg') as SVGElement
    expect(svg.getAttribute('class')).toBe('ic')
    expect(svg.getAttribute('width')).toBe('24')
    expect(svg.getAttribute('height')).toBe('24')
  })

  it('renders every icon SSR-safe to static markup', () => {
    for (const name of ALL_NAMES) {
      const Icon = headlessIcons[name]
      const markup = renderToStaticMarkup(<Icon />)
      expect(markup).toContain('<svg')
    }
  })
})
