import { render } from 'ink-testing-library'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, vi } from 'vitest'
import { InkChatProvider, type PartialInkComponents } from './registry'

/**
 * Drive the file's tests on fake timers: Ink's pending-escape flush, render
 * throttle and every component timer advance only when a test says so, so no
 * test waits on the wall clock. Call once at the top of a test file.
 */
export function useFakeClock() {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })
}

/** Render inside a provider and expose a helper that writes keys and lets them settle. */
export function renderInk(node: ReactElement, components?: PartialInkComponents) {
  const view = render(
    <InkChatProvider {...(components ? { components } : {})}>{node}</InkChatProvider>,
  )
  const press = async (...keys: string[]) => {
    for (const key of keys) {
      view.stdin.write(key)
      await tick()
    }
  }
  return { ...view, press }
}

/**
 * Let input settle: advance the fake clock `ms` (running due timers and the
 * promises they resolve), then yield one event-loop turn for React's work.
 * Needs fake timers (`useFakeClock`).
 */
export async function tick(ms = 15) {
  await vi.advanceTimersByTimeAsync(ms)
  await new Promise<void>((resolve) => setImmediate(resolve))
}

export const KEYS = {
  enter: '\r',
  altEnter: '\u001b\r',
  shiftEnter: '\u001b[13;2u',
  ctrlJ: '\n',
  backspace: '\u007f',
  delete: '\u001b[3~',
  left: '\u001b[D',
  right: '\u001b[C',
  up: '\u001b[A',
  down: '\u001b[B',
  home: '\u001b[H',
  end: '\u001b[F',
  tab: '\t',
  escape: '\u001b',
  ctrl: (c: string) => String.fromCharCode(c.charCodeAt(0) - 96),
}
