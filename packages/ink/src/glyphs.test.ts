// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { defaultMeasure } from './lines/measure'
import { type InkGlyphs, asciiGlyphs, emojiGlyphs, plainGlyphs } from './theme'

const chars = (glyphs: InkGlyphs) =>
  Object.entries(glyphs).flatMap(([key, value]) =>
    [value].flat().flatMap((text: string) => [...text].map((char) => ({ key, char }))),
  )
const emoji = (char: string) => /\p{Emoji}/u.test(char)
const presentation = (char: string) => /\p{Emoji_Presentation}/u.test(char)

describe('glyph widths', () => {
  it('keeps the plain and ASCII sets free of emoji-capable characters', () => {
    expect(chars(plainGlyphs).filter(({ char }) => emoji(char))).toEqual([])
    // ASCII digits, `#` and `*` are emoji-capable only as keycap bases.
    expect(chars(asciiGlyphs).filter(({ char }) => emoji(char) && !/^[0-9#*]$/.test(char))).toEqual(
      [],
    )
  })

  it('uses only emoji-presentation characters in the emoji set, measured two cells', () => {
    expect(chars(emojiGlyphs).filter(({ char }) => emoji(char) && !presentation(char))).toEqual([])
    const icons = chars(emojiGlyphs).filter(({ char }) => presentation(char))
    expect(icons.map(({ key }) => key)).toEqual([
      'brain',
      'wrench',
      'gear',
      'checklist',
      'tool',
      'attachment',
      'image',
      'pending',
    ])
    for (const { char } of icons) expect(defaultMeasure(char)).toBe(2)
    expect(emojiGlyphs.spinner).toBe(plainGlyphs.spinner)
  })
})
