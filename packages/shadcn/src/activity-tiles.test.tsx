import type { ActivityItem, IconProps } from '@fx/chat'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TILE_TICK_MS, createActivityTiles, tileText } from './activity-tiles'
import { createShadcnClassNames } from './class-names'
import { createShadcnComponents, shadcnComponents } from './registry'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(10_000)
})
afterEach(() => vi.useRealTimers())

const item = (over: Partial<ActivityItem> = {}): ActivityItem => ({
  id: 'a',
  kind: 'tool',
  label: 'fetch_url',
  name: 'fetch_url',
  status: 'done',
  ...over,
})

describe('tileText', () => {
  it('prefers a detail, then a live rate, then the duration, then the time so far', () => {
    expect(tileText(item({ detail: '2/5', durationMs: 9 }), 0)).toBe('2/5')
    expect(tileText(item({ status: 'running', tokensPerSecond: 12.34 }), 0)).toBe('12.3/s')
    expect(tileText(item({ tokensPerSecond: 12.34, durationMs: 1500 }), 0)).toBe('1.5s')
    expect(tileText(item({ status: 'running', startedAt: 8_000 }), 10_000)).toBe('2.0s')
    expect(tileText(item({ status: 'running', startedAt: 12_000 }), 10_000)).toBe('0.0s')
    expect(tileText(item(), 0)).toBeUndefined()
  })
})

describe('ActivityTiles', () => {
  const Globe = (props: IconProps) => <svg data-testid="globe" {...props} />

  it('draws a tile per item: the tool icon, the text inside, a ring while live', () => {
    const Tiles = createActivityTiles({ fetch_url: Globe })
    render(
      <Tiles
        live
        items={[
          item({ id: 't1', durationMs: 1500 }),
          item({ id: 't2', name: 'other', label: 'other', status: 'running', startedAt: 9_000 }),
          item({ id: 'r', kind: 'reasoning', label: 'Thinking', status: 'error' }),
          item({ id: 'p', kind: 'plan', label: 'Plan', status: 'awaiting', detail: '1/2' }),
          item({ id: 'w', kind: 'waiting', label: 'Starting', status: 'running' }),
          item({ id: 'o', kind: 'other', label: 'x' }),
        ]}
      />,
    )
    const tiles = screen.getAllByRole('img')
    expect(tiles.map((t) => t.getAttribute('aria-label'))).toEqual([
      'fetch_url, done, 1.5s',
      'other, running, 1.0s',
      'Thinking, failed',
      'Plan, waiting for approval, 1/2',
      'Starting, running',
      'x, done',
    ])
    expect(screen.getAllByTestId('globe')).toHaveLength(1)
    expect(tiles.map((t) => Boolean(t.querySelector('.chat-tile-ring')))).toEqual([
      false,
      true,
      false,
      true,
      true,
      false,
    ])
    expect(tiles[2]).toHaveAttribute('data-status', 'error')
    // One tile size everywhere: the footer's fact tiles use the same classes.
    expect(tiles[0]).toHaveClass('size-11')
    expect(createShadcnClassNames({ touch: true }).footerFactBody).toContain('size-11')
    // A running tile's time advances.
    act(() => vi.advanceTimersByTime(TILE_TICK_MS * 4))
    expect(tiles[1]).toHaveAttribute('aria-label', 'other, running, 2.0s')
  })

  it('gives a tool with no name the wrench', () => {
    const Tiles = createActivityTiles({ '': () => <svg data-testid="never" /> })
    render(<Tiles live={false} items={[item({ name: undefined })]} />)
    expect(screen.queryByTestId('never')).toBeNull()
    expect(screen.getByRole('img').querySelector('svg')).not.toBeNull()
  })

  it('opens the item on tap when it can, and does not tick when nothing runs', () => {
    const onActivate = vi.fn()
    const Tiles = shadcnComponentsTouchTiles()
    render(<Tiles live={false} items={[item({ id: 'x' })]} onActivate={onActivate} />)
    fireEvent.click(screen.getByRole('button', { name: 'fetch_url, done' }))
    expect(onActivate).toHaveBeenCalledWith('x')
    expect(vi.getTimerCount()).toBe(0)
  })
})

function shadcnComponentsTouchTiles() {
  const Tiles = createShadcnComponents({ touch: true }).ActivitySummary
  if (!Tiles) throw new Error('touch registry has no ActivitySummary')
  return Tiles
}

describe('registry ActivitySummary', () => {
  it('is provided for touch only', () => {
    expect(createShadcnComponents({ touch: true }).ActivitySummary).toBeTypeOf('function')
    expect(shadcnComponents.ActivitySummary).toBeUndefined()
  })
})
