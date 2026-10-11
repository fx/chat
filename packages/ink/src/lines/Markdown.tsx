/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */

/**
 * The default terminal markdown as a component, for the markdown slot of the
 * inline (non-viewport) renderer: the same dependency-free layout the
 * fullscreen viewport uses, laid out to the box's measured width and drawn in
 * the injected theme roles and glyphs.
 */
import { useInkComponents } from '../registry'
import type { InkMarkdownProps } from '../registry'
import { React, ink } from '../runtime'
import { stripControls } from '../sanitize'
import { Lines } from './Lines'
import { terminalMarkdown } from './markdown'
import { type Measure, defaultMeasure } from './measure'
import type { Line } from './model'

export interface TerminalMarkdownProps extends InkMarkdownProps {
  /** Lay out to this many cells instead of the measured box width. */
  width?: number
  /** Cell measurement (default: the one Ink lays out by). */
  measure?: Measure
}

export function TerminalMarkdown({
  content,
  streaming,
  width,
  measure = defaultMeasure,
}: TerminalMarkdownProps) {
  const { theme, glyphs } = useInkComponents()
  const ref = React.useRef(null)
  const box = ink.useBoxMetrics(ref)
  const { columns } = ink.useWindowSize()
  // Until the first layout pass measures the box, assume the full terminal.
  const cells = width ?? (box.hasMeasured && box.width > 0 ? box.width : columns)
  const lines = React.useMemo(
    () =>
      terminalMarkdown(stripControls(content), cells, {
        measure,
        glyphs,
        ...(streaming ? { streaming } : {}),
      }) as Line[],
    [content, cells, measure, glyphs, streaming],
  )
  return (
    <ink.Box ref={ref} flexDirection="column" flexGrow={1}>
      {lines.length > 0 && <Lines lines={lines} theme={theme} />}
    </ink.Box>
  )
}
