import { describe, expect, it, vi } from 'vitest'
import { domHtmlToText, onAssistPrompt, tauriFetchInit } from './index'

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

describe('onAssistPrompt', () => {
  it('takes a parked prompt at once and each one announced later, until unlistened', () => {
    const parked = ['first', null, 'second']
    const w = window as { FxAssist?: unknown }
    w.FxAssist = { takePrompt: () => parked.shift() ?? null }
    try {
      const heard: string[] = []
      const stop = onAssistPrompt((text) => heard.push(text))
      expect(heard).toEqual(['first'])
      window.dispatchEvent(new Event('fx-assist'))
      window.dispatchEvent(new Event('fx-assist'))
      expect(heard).toEqual(['first', 'second'])
      stop()
      parked.push('late')
      window.dispatchEvent(new Event('fx-assist'))
      expect(heard).toEqual(['first', 'second'])
    } finally {
      w.FxAssist = undefined
    }
  })

  it('does nothing outside the Android shell', () => {
    const handler = vi.fn()
    onAssistPrompt(handler)()
    window.dispatchEvent(new Event('fx-assist'))
    expect(handler).not.toHaveBeenCalled()
  })
})
