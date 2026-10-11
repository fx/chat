import type { Appearance, ThemeVariable } from '@fx/tx/theme'
import { describe, expect, it } from 'vitest'
import { inkThemeFrom, toInkAppearance } from './theme'

describe('tx theme mapping', () => {
  it('maps appearances and roles', () => {
    expect(toInkAppearance({ hue: 'cyan', dim: true, bold: true, inverse: true })).toEqual({
      color: 'cyan',
      dim: true,
      bold: true,
      inverse: true,
    })
    expect(toInkAppearance({})).toEqual({})
    const table: Partial<Record<ThemeVariable, Appearance>> = {
      strong: { bold: true },
      muted: { dim: true },
      danger: { hue: 'red' },
    }
    const theme = inkThemeFrom({ appearance: (v) => table[v] ?? {} })
    expect(theme.user).toEqual({ bold: true })
    expect(theme.assistant).toEqual({ dim: true })
    expect(theme.danger).toEqual({ color: 'red' })
    expect(theme.content).toEqual({})
  })
})
