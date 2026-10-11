/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */

/**
 * Draw laid-out lines. Each line is a one-row clipped box (layout already
 * wrapped it) of sibling `Text` runs, split so Ink's per-frame width
 * measurement stays on its fast path: consecutive ASCII as one run, each non-ASCII stretch as
 * its own run, and long repeats of one character in fixed 8-character chunks
 * (which Ink's width cache then measures once). Runs are cached per line.
 */
import type { ReactNode } from 'react'
import { appearanceProps } from '../registry'
import { React, ink } from '../runtime'
import type { InkAppearance, InkTheme } from '../theme'
import type { Line, Span } from './model'

/** A span's resolved text props. */
export function spanProps(
  s: Span,
  theme: InkTheme,
  highlight?: InkAppearance,
): Record<string, unknown> {
  const base: InkAppearance = {
    ...(s.role ? theme[s.role] : {}),
    ...s.style,
    ...(s.bold !== undefined ? { bold: s.bold } : {}),
    ...(s.italic ? { italic: true } : {}),
    ...(s.dim ? { dim: true } : {}),
    ...(s.underline ? { underline: true } : {}),
    ...(s.strike ? { strikethrough: true } : {}),
    ...(s.inverse ? { inverse: true } : {}),
    ...(s.color ? { color: s.color } : {}),
    ...highlight,
  }
  return appearanceProps(base)
}

const CHUNK = 8

/** Split text into runs that keep width measurement cheap. */
export function splitRuns(text: string): string[] {
  const runs: string[] = []
  let ascii = ''
  const chars = Array.from(text)
  let i = 0
  while (i < chars.length) {
    const ch = chars[i] as string
    if (ch.charCodeAt(0) < 128) {
      ascii += ch
      i++
      continue
    }
    if (ascii) {
      runs.push(ascii)
      ascii = ''
    }
    let j = i
    while (j < chars.length && chars[j] === ch) j++
    const repeat = j - i
    if (repeat > 1) {
      for (let k = 0; k < repeat; k += CHUNK) runs.push(ch.repeat(Math.min(CHUNK, repeat - k)))
      i = j
      continue
    }
    let stretch = ''
    while (
      i < chars.length &&
      (chars[i] as string).charCodeAt(0) >= 128 &&
      chars[i] !== chars[i + 1]
    ) {
      stretch += chars[i]
      i++
    }
    runs.push(stretch)
  }
  if (ascii) runs.push(ascii)
  return runs
}

const runCache = new WeakMap<Line, { theme: InkTheme; node: ReactNode }>()

function lineNode(line: Line, theme: InkTheme): ReactNode {
  const cached = runCache.get(line)
  if (cached && cached.theme === theme) return cached.node
  // Runs are siblings, not children of one Text: Ink merges nested text into
  // one string per line before measuring it, which would undo the split.
  const node = (
    <ink.Box height={1} overflow="hidden" flexShrink={0}>
      {line.spans.length === 0 ? (
        <ink.Text> </ink.Text>
      ) : (
        line.spans.flatMap((s, si) => {
          const props = spanProps(s, theme)
          return splitRuns(s.text).map((run, ri) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: runs have no identity beyond position
            <ink.Text key={`${si}:${ri}`} wrap="truncate" {...props}>
              {run}
            </ink.Text>
          ))
        })
      )}
    </ink.Box>
  )
  runCache.set(line, { theme, node })
  return node
}

export interface LinesProps {
  lines: readonly Line[]
  theme: InkTheme
  /** Replace a line's drawing (e.g. a selection highlight); return undefined to draw normally. */
  override?: (line: Line, index: number) => ReactNode | undefined
}

export function Lines({ lines, theme, override }: LinesProps) {
  return (
    <ink.Box flexDirection="column" flexShrink={0}>
      {lines.map((line, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a window's rows are positional
        <React.Fragment key={i}>{override?.(line, i) ?? lineNode(line, theme)}</React.Fragment>
      ))}
    </ink.Box>
  )
}
