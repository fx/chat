import { describe, expect, it } from 'vitest'
import { isSafeAttachmentUrl } from './url'

describe('isSafeAttachmentUrl', () => {
  it.each(['http://example.com/a.png', 'https://example.com/a.png'])(
    'allows the http(s) scheme: %s',
    (url) => {
      expect(isSafeAttachmentUrl(url)).toBe(true)
    },
  )

  it('allows data: URLs', () => {
    expect(isSafeAttachmentUrl('data:image/png;base64,AAAA')).toBe(true)
  })

  it('allows blob: URLs', () => {
    expect(isSafeAttachmentUrl('blob:https://example.com/uuid')).toBe(true)
  })

  it('is case-insensitive on the scheme', () => {
    expect(isSafeAttachmentUrl('HTTPS://example.com/a.png')).toBe(true)
    expect(isSafeAttachmentUrl('Data:text/plain,hi')).toBe(true)
  })

  it('tolerates leading/trailing whitespace', () => {
    expect(isSafeAttachmentUrl('  https://example.com/a.png  ')).toBe(true)
  })

  it.each(['javascript:alert(1)', 'vbscript:msgbox', 'file:///etc/passwd', 'mailto:a@b.c'])(
    'refuses unsafe/unknown scheme: %s',
    (url) => {
      expect(isSafeAttachmentUrl(url)).toBe(false)
    },
  )

  it('refuses a value with no scheme (bare/relative path)', () => {
    expect(isSafeAttachmentUrl('/relative/path.png')).toBe(false)
    expect(isSafeAttachmentUrl('example.com/a.png')).toBe(false)
    expect(isSafeAttachmentUrl('')).toBe(false)
  })
})
