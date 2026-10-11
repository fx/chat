import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MarkdownView } from './markdown'

const view = (content: string) => render(<MarkdownView content={content} />).container

describe('MarkdownView', () => {
  it('never loads a remote image, showing a link placeholder instead', () => {
    const root = view('![chart](https://tracker.example/x.png "Title")')
    expect(root.querySelector('img')).toBeNull()
    const link = root.querySelector('a[data-image-placeholder]')
    expect(link?.getAttribute('href')).toBe('https://tracker.example/x.png')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer')
    expect(link?.textContent).toContain('chart')
    expect(link?.textContent).toContain('tracker.example')
  })

  it('labels an image without alt text and keeps unparseable sources inert', () => {
    const root = view('![](rel/x.png) ![x](javascript:alert(1))')
    expect(root.querySelector('img')).toBeNull()
    const placeholders = root.querySelectorAll('[data-image-placeholder]')
    expect(placeholders[0]?.textContent).toContain('image')
    expect(placeholders[0]?.textContent).toContain('rel/x.png')
    expect(placeholders[1]?.tagName).toBe('SPAN')
    expect(placeholders[1]?.getAttribute('href')).toBeNull()
  })

  it('draws inline data: images', () => {
    const src = 'data:image/png;base64,iVBORw0KGgo='
    const img = view(`![dot](${src})`).querySelector('img')
    expect(img?.getAttribute('src')).toBe(src)
    expect(img?.getAttribute('alt')).toBe('dot')
  })

  it('skips raw HTML, so no tag in an answer can load anything', () => {
    const root = view(
      'a <img src="https://tracker.example/p.gif"> b\n\n<iframe src="https://tracker.example/f"></iframe>',
    )
    expect(root.querySelector('img, iframe')).toBeNull()
  })

  it('opens links and autolinks in a new context only on tap', () => {
    const links = view('[site](https://example.com) and https://auto.example').querySelectorAll('a')
    expect(links).toHaveLength(2)
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank')
      expect(a.getAttribute('rel')).toBe('noopener noreferrer')
    }
  })

  it('names the raw source when an image URL has no host', () => {
    const root = view('![m](mailto:a@example.com)')
    expect(root.querySelector('[data-image-placeholder]')?.textContent).toContain(
      'mailto:a@example.com',
    )
  })

  it('marks a streaming answer', () => {
    const { container } = render(<MarkdownView content="x" streaming />)
    expect(container.firstElementChild).toHaveAttribute('data-streaming', 'true')
  })
})
