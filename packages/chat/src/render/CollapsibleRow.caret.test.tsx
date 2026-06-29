/**
 * Single-caret disclosure ownership (change 0010).
 *
 * The registry `Collapsible` slot is the SOLE owner of the disclosure caret;
 * `CollapsibleRow` must NOT emit a caret affordance of its own. These tests are
 * injection-safe: they prove exactly one caret renders both with the headless
 * registry (whose Collapsible renders its own `.chat-collapsible-caret`) AND
 * with a stub host registry whose Collapsible renders its own chevron — in
 * neither case does the substrate add a second caret.
 */
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatProvider } from '../registry'
import type { CollapsibleProps, PartialChatComponents } from '../registry'
import { CollapsibleRow } from './CollapsibleRow'
import { stubMatchMedia } from './test-helpers'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  stubMatchMedia(false)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('single-caret disclosure ownership', () => {
  it('renders exactly one caret via the headless Collapsible (substrate adds none)', () => {
    const { container } = render(
      <ChatProvider>
        <CollapsibleRow label="Headless" defaultOpen>
          <span>body</span>
        </CollapsibleRow>
      </ChatProvider>,
    )
    // The headless Collapsible owns the only caret.
    expect(container.querySelectorAll('.chat-collapsible-caret')).toHaveLength(1)
    // An idle bodied row keeps the `body` tone on its header but emits NO
    // affordance span (so no empty box / extra caret of its own).
    expect(container.querySelector('.chat-row-header')).toHaveAttribute('data-affordance', 'body')
    expect(container.querySelector('.chat-row-affordance')).toBeNull()
  })

  it('renders exactly one host chevron via a stub Collapsible (substrate adds none)', () => {
    const stub: PartialChatComponents = {
      Collapsible: ({ header, children }: CollapsibleProps) => (
        <section data-stub="collapsible">
          <button type="button">
            <span data-testid="host-chevron">▸</span>
            {header}
          </button>
          <div>{children}</div>
        </section>
      ),
    }
    const { container } = render(
      <ChatProvider components={stub}>
        <CollapsibleRow label="Hosted" defaultOpen>
          <span>body</span>
        </CollapsibleRow>
      </ChatProvider>,
    )
    // Exactly one host-provided chevron, and zero headless package carets.
    expect(screen.getAllByTestId('host-chevron')).toHaveLength(1)
    expect(container.querySelectorAll('.chat-collapsible-caret')).toHaveLength(0)
    // And the substrate still emits no affordance caret icon of its own.
    expect(container.querySelector('.chat-row-affordance-icon')).toBeNull()
  })
})
