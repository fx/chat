/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */

/**
 * The terminal component registry: theme, glyphs, the markdown slot, and the
 * spinner cadence, injected through `<InkChatProvider>`. Partial registries
 * merge over the plain defaults, so a host overrides only what it styles.
 */
import type { ComponentType, Context, ReactNode } from 'react'
import { React, ink } from './runtime'
import {
  type InkAppearance,
  type InkGlyphs,
  type InkTheme,
  type InkThemeRole,
  plainGlyphs,
  plainTheme,
} from './theme'

/** Props of the markdown slot. */
export interface InkMarkdownProps {
  content: string
  /** True while the text is still streaming (renderers may relax parsing). */
  streaming?: boolean
}

export interface InkComponents {
  theme: InkTheme
  glyphs: InkGlyphs
  /** Renders message text. The default prints it verbatim in the `content` role. */
  Markdown: ComponentType<InkMarkdownProps>
  /** Spinner frame interval in ms (ignored under a shared clock). */
  spinnerIntervalMs: number
  /** Show the brief completion check when a row finishes (default true). */
  flashComplete: boolean
}

/** A partial registry; nested theme/glyph maps merge per key. */
export interface PartialInkComponents {
  theme?: Partial<InkTheme>
  glyphs?: Partial<InkGlyphs>
  Markdown?: ComponentType<InkMarkdownProps>
  spinnerIntervalMs?: number
  flashComplete?: boolean
}

/** Prints markdown source as-is. */
export function PlainMarkdown({ content }: InkMarkdownProps) {
  return <Styled tone="content">{content}</Styled>
}

export const plainComponents: InkComponents = {
  theme: plainTheme,
  glyphs: plainGlyphs,
  Markdown: PlainMarkdown,
  spinnerIntervalMs: 80,
  flashComplete: true,
}

// Created on first use, with the React the host bound (not at module load).
let context: Context<InkComponents> | undefined
const inkContext = () => {
  context ??= React.createContext<InkComponents>(plainComponents)
  return context
}

/** Merge a partial registry over a base. */
export function mergeInkComponents(
  base: InkComponents,
  partial: PartialInkComponents = {},
): InkComponents {
  return {
    theme: { ...base.theme, ...partial.theme },
    glyphs: { ...base.glyphs, ...partial.glyphs },
    Markdown: partial.Markdown ?? base.Markdown,
    spinnerIntervalMs: partial.spinnerIntervalMs ?? base.spinnerIntervalMs,
    flashComplete: partial.flashComplete ?? base.flashComplete,
  }
}

export function InkChatProvider({
  components,
  children,
}: {
  components?: PartialInkComponents
  children?: ReactNode
}) {
  const value = React.useMemo(() => mergeInkComponents(plainComponents, components), [components])
  const InkContext = inkContext()
  return <InkContext.Provider value={value}>{children}</InkContext.Provider>
}

export function useInkComponents(): InkComponents {
  return React.useContext(inkContext())
}

/** Ink `<Text>` props for an appearance. */
export function appearanceProps(appearance: InkAppearance) {
  return {
    ...(appearance.color ? { color: appearance.color } : {}),
    ...(appearance.dim ? { dimColor: true } : {}),
    ...(appearance.bold ? { bold: true } : {}),
    ...(appearance.italic ? { italic: true } : {}),
    ...(appearance.inverse ? { inverse: true } : {}),
    ...(appearance.underline ? { underline: true } : {}),
    ...(appearance.strikethrough ? { strikethrough: true } : {}),
  }
}

/** Text drawn in a theme role (`tone`). */
export function Styled({
  tone,
  wrap,
  children,
}: {
  tone: InkThemeRole
  wrap?: 'wrap' | 'truncate-end'
  children?: ReactNode
}) {
  const { theme } = useInkComponents()
  return (
    <ink.Text {...appearanceProps(theme[tone])} {...(wrap ? { wrap } : {})}>
      {children}
    </ink.Text>
  )
}
