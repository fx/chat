import { describe, expect, it } from 'vitest'
import { domHtmlToText, tauriFetchInit } from './index'

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

describe('tauriFetchInit', () => {
  it('stops the native client following redirects when the caller asks for manual', () => {
    const headers = new Headers()
    expect(tauriFetchInit({ redirect: 'manual', method: 'GET' }, headers)).toEqual({
      redirect: 'manual',
      method: 'GET',
      headers,
      maxRedirections: 0,
    })
  })

  it('leaves the native redirect policy alone otherwise', () => {
    const headers = new Headers()
    expect(tauriFetchInit(undefined, headers)).toEqual({ headers })
    expect(tauriFetchInit({ redirect: 'follow' }, headers)).not.toHaveProperty('maxRedirections')
  })
})
