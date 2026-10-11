import { describe, expect, it } from 'vitest'
import { domHtmlToText } from './index'

describe('domHtmlToText', () => {
  it('keeps the title and body text, dropping scripts and styles', () => {
    expect(
      domHtmlToText(
        '<html><head><title>T</title><style>x</style></head><body><p>Hi</p><script>bad()</script></body></html>',
      ),
    ).toBe('T\n\nHi')
    expect(domHtmlToText('<p>only</p>')).toBe('only')
    expect(domHtmlToText('')).toBe('')
  })
})
