// @vitest-environment node
import type { CompletionItem, CompletionProvider } from '@fx-/chat-core'
import { referenceProvider } from '@fx-/chat-core'
import { describe, expect, it, vi } from 'vitest'
import { Composer } from './Composer'
import { KEYS, renderInk, tick, useFakeClock } from './test-helpers'

useFakeClock()

const setup = (props: Partial<Parameters<typeof Composer>[0]> = {}) => {
  const onSubmit = vi.fn()
  const view = renderInk(<Composer onSubmit={onSubmit} {...props} />)
  return { ...view, onSubmit }
}

const body = (frame: string | undefined) =>
  (frame ?? '')
    .split('\n')
    .filter((l) => l.startsWith('│'))
    .map((l) => l.replace(/^│\s?/, '').replace(/\s*│$/, ''))
    .join('\n')

describe('Composer', () => {
  it('shows the placeholder and a hint, and submits typed text', async () => {
    const { lastFrame, press, onSubmit } = setup({ placeholder: 'Ask', hint: 'Enter to send' })
    await tick()
    expect(body(lastFrame())).toBe('› Ask')
    expect(lastFrame()).toContain('Enter to send')
    await press('hi', KEYS.enter)
    expect(onSubmit).toHaveBeenCalledWith('hi')
    expect(body(lastFrame())).toBe('› Ask')
    await press(KEYS.enter)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('inserts newlines four ways', async () => {
    const { lastFrame, press, onSubmit } = setup()
    await press('a', KEYS.altEnter, 'b', KEYS.shiftEnter, 'c', KEYS.ctrlJ, 'd\\', KEYS.enter, 'e')
    expect(body(lastFrame())).toBe('› a\n  b\n  c\n  d\n  e')
    await press(KEYS.enter)
    expect(onSubmit).toHaveBeenCalledWith('a\nb\nc\nd\ne')
  })

  it('edits with arrows, home/end and control keys', async () => {
    const { lastFrame, press, onSubmit } = setup()
    await press('hello world', KEYS.left, KEYS.left, KEYS.backspace, KEYS.delete)
    await press(KEYS.home, 'X', KEYS.end, 'Y', KEYS.ctrl('a'), KEYS.right, KEYS.ctrl('e'), '!')
    expect(body(lastFrame())).toContain('Xhello wodY!')
    await press(KEYS.ctrl('w'), KEYS.ctrl('a'), KEYS.ctrl('k'), 'new ', KEYS.ctrl('u'), 'z')
    await press(KEYS.ctrl('x'), KEYS.tab, KEYS.enter)
    expect(onSubmit).toHaveBeenCalledWith('z')
    void lastFrame
  })

  it('moves between lines and through history', async () => {
    const { lastFrame, press, onSubmit } = setup({ history: ['old'] })
    await press('ab', KEYS.altEnter, 'cd', KEYS.up, 'X', KEYS.down, 'Y')
    expect(body(lastFrame())).toBe('› abX\n  cdY')
    await press(KEYS.ctrl('u'), KEYS.up, KEYS.ctrl('u'), KEYS.backspace, KEYS.up)
    expect(body(lastFrame())).toBe('› old')
    // Coming back down restores the draft that was being typed.
    await press(KEYS.up, KEYS.down)
    expect(body(lastFrame())).toBe('› abX\n')
    await press(KEYS.down, 'n', KEYS.enter)
    expect(onSubmit).toHaveBeenLastCalledWith('abX\nn')
  })

  it('calls onEscape and ignores input while disabled', async () => {
    const onEscape = vi.fn()
    const { press, onSubmit, rerender } = setup({ onEscape })
    await press(KEYS.escape)
    await tick(60)
    expect(onEscape).toHaveBeenCalled()
    rerender(<Composer onSubmit={onSubmit} disabled />)
    await press('x', KEYS.enter)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('accepts pasted text with normalized newlines', async () => {
    const { lastFrame, stdin } = setup()
    await tick()
    stdin.write('\u001b[200~one\r\ntwo\u001b[201~')
    await tick()
    expect(body(lastFrame())).toBe('› one\n  two')
  })

  it('completes with a provider: navigate, apply, dismiss', async () => {
    const { lastFrame, press } = setup({ providers: [referenceProvider] })
    await press('~')
    await tick()
    expect(lastFrame()).toContain('apple')
    await press(KEYS.down, KEYS.up, KEYS.up, KEYS.tab)
    expect(body(lastFrame())).toMatch(/^› ~\w+$/)
    await press('~ap')
    await tick()
    expect(lastFrame()).toContain('apple')
    await press(KEYS.escape)
    await tick(60)
    expect(lastFrame()).not.toContain('apricot')
    await press('r')
    await tick()
    expect(lastFrame()).toContain('apricot')
    await press(KEYS.down, KEYS.enter)
    expect(body(lastFrame())).toBe('› ~cherry ~apricot')
  })

  it('sends on Enter when the selection was not moved', async () => {
    const { press, onSubmit } = setup({ providers: [referenceProvider] })
    await press('~ap')
    await tick()
    await press(KEYS.enter)
    expect(onSubmit).toHaveBeenCalledWith('~ap')
  })

  it('handles async, empty and failing providers', async () => {
    const make = (
      items: (q: string, s: AbortSignal) => Promise<CompletionItem[]>,
    ): CompletionProvider => ({
      id: 'p',
      trigger: '@',
      match: (text, caret) => {
        const at = text.lastIndexOf('@', caret - 1)
        return at === -1 ? null : { query: text.slice(at + 1, caret), range: [at, caret] }
      },
      items,
      apply: (item, before, after) => ({
        value: `${before}@${item.label} ${after}`,
        caret: before.length + item.label.length + 2,
      }),
    })
    const slow = make(
      (q) =>
        new Promise((resolve) =>
          setTimeout(() => resolve([{ id: q, label: `user-${q}`, description: 'desc' }]), 5),
        ),
    )
    const { lastFrame, press, rerender, onSubmit } = setup({ providers: [slow] })
    await press('@a', 'b')
    await tick(30)
    expect(lastFrame()).toContain('user-ab desc')

    rerender(<Composer onSubmit={onSubmit} providers={[make(async () => [])]} />)
    await press('c')
    await tick(30)
    expect(lastFrame()).not.toContain('user-')

    rerender(
      <Composer onSubmit={onSubmit} providers={[make(() => Promise.reject(new Error('x')))]} />,
    )
    await press('d')
    await tick(30)
    expect(lastFrame()).not.toContain('user-')

    const neverMatches: CompletionProvider = { ...make(async () => []), match: () => null }
    rerender(<Composer onSubmit={onSubmit} providers={[neverMatches]} />)
    await press('e')
    await tick(30)
    expect(lastFrame()).not.toContain('user-')
  })
})

describe('Composer edge cases', () => {
  const provider = (items: () => Promise<CompletionItem[]>): CompletionProvider => ({
    id: 'q',
    trigger: '#',
    match: (text, caret) => {
      const at = text.lastIndexOf('#', caret - 1)
      return at === -1 ? null : { query: text.slice(at + 1, caret), range: [at, caret] }
    },
    items,
    apply: (item, before, after) => ({
      value: `${before}#${item.label}${after}`,
      caret: before.length + 1,
    }),
  })

  it('drops stale results, empty and failed lookups, and shows plain items', async () => {
    const late = provider(
      () => new Promise((r) => setTimeout(() => r([{ id: 'x', label: 'late' }]), 40)),
    )
    const a = setup({ providers: [late], placeholder: '' })
    await tick()
    expect(body(a.lastFrame())).toBe('›')
    await a.press('#', 'a')
    await tick(80)
    expect(a.lastFrame()).toContain('late')
    a.unmount()

    const empty = setup({ providers: [provider(async () => [])] })
    await empty.press('#')
    await tick()
    expect(body(empty.lastFrame())).toBe('› #')
    empty.unmount()

    const failingLate = provider(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error('x')), 40)),
    )
    const b = setup({ providers: [failingLate] })
    await b.press('#', 'z')
    await tick(80)
    expect(body(b.lastFrame())).toBe('› #z')
  })
})

describe('Composer chunked input', () => {
  it('submits on a carriage return inside a typed chunk and keeps the remainder', async () => {
    const { lastFrame, press, onSubmit } = setup()
    await press('first\rsec')
    expect(onSubmit).toHaveBeenCalledWith('first')
    expect(body(lastFrame())).toBe('› sec')
    await press('ond\r\n')
    expect(onSubmit).toHaveBeenLastCalledWith('second')
    await press('\r', 'a\nb\r')
    expect(onSubmit).toHaveBeenLastCalledWith('a\nb')
    expect(onSubmit).toHaveBeenCalledTimes(3)
  })
})

describe('Composer fast input', () => {
  it('applies the item chosen by keys handled in the same tick, then Enter sends', async () => {
    const { lastFrame, press, stdin, onSubmit } = setup({ providers: [referenceProvider] })
    await press('~')
    await tick()
    stdin.write(KEYS.down)
    stdin.write(KEYS.tab)
    await tick()
    const applied = body(lastFrame())
    expect(applied).toBe('› ~apricot')
    // The list stays closed after applying, so Enter sends.
    expect(lastFrame()).not.toContain('a stone fruit')
    await press(KEYS.enter)
    expect(onSubmit).toHaveBeenCalledWith(`${applied.slice(2)} `)
  })
})
