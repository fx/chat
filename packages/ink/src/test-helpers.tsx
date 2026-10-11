import { render } from 'ink-testing-library'
import type { ReactElement } from 'react'
import { InkChatProvider, type PartialInkComponents } from './registry'

/** Render inside a provider and expose a helper that writes keys and waits a tick. */
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

export const tick = (ms = 15) => new Promise((resolve) => setTimeout(resolve, ms))

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
