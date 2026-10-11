/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */

import { Styled, useInkComponents } from './registry'
import { React, hooks } from './runtime'

/**
 * An animated spinner in the `marker` role, using the injected frames. It
 * steps once per tick of the shared clock when a ClockProvider is in scope,
 * else every `spinnerIntervalMs`.
 */
export function Spinner() {
  const { glyphs, spinnerIntervalMs } = useInkComponents()
  const frame = hooks.useTicks(true, spinnerIntervalMs)
  const frames = glyphs.spinner
  return <Styled tone="marker">{frames[frame % frames.length] ?? ''}</Styled>
}
