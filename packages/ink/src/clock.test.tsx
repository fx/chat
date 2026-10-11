import { render as inkRender } from 'ink-testing-library'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Row } from './Row'
// @vitest-environment node
import { ClockProvider } from './create'
import { InkChatProvider } from './registry'

const tree = (isActive: boolean) => (
  <ClockProvider tickMs={1000}>
    <InkChatProvider components={{ flashComplete: false }}>
      <Row label="run" isActive={isActive} />
    </InkChatProvider>
  </ClockProvider>
)

describe('shared clock in the terminal', () => {
  it('steps the spinner per shared tick and can switch the flash off', async () => {
    const actEnv = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    actEnv.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'],
    })
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    let view = undefined as unknown as ReturnType<typeof inkRender>
    // act flushes the mount's effects (the clock subscription) deterministically.
    await act(async () => {
      view = inkRender(tree(true))
    })
    expect(view.lastFrame()).toBe('⠋ run')
    // One interval — the shared clock's, at its tick — and no 80 ms spinner timer.
    expect(setIntervalSpy.mock.calls.map((call) => call[1])).toEqual([1000])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100)
    })
    expect(view.lastFrame()).toBe('⠙ run')
    await act(async () => {
      view.rerender(tree(false))
      await vi.advanceTimersByTimeAsync(50)
    })
    expect(view.lastFrame()).toBe('  run')
    view.unmount()
    vi.useRealTimers()
    actEnv.IS_REACT_ACT_ENVIRONMENT = false
  })
})
