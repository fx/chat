import { referenceProvider } from '@fx/chat-core'
/**
 * `CompletionPopup` tests.
 *
 * The popup is driven imperatively: a host textarea forwards keydowns to the
 * ref's `handleKeyDown`, which syncs the caret and (when open) consumes nav/
 * apply/escape keys. The harness below renders a real textarea + the popup,
 * exposes the handle, and lets each test set the value, place the caret, and
 * pump keys — mirroring how `ChatInput` wires them.
 *
 * Covers: caret-driven recompute, provider precedence (first match wins),
 * keyboard nav with wrap-around, Enter/Tab apply, mouse apply, Escape +
 * dismissed-range suppression (and re-open after the token changes), the IME
 * guard, async items under an AbortController (stale-abort), the loading delay,
 * `aria-activedescendant` maintenance, and the viewport flip.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { type RefObject, useImperativeHandle, useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompletionPopup, type CompletionPopupHandle, LOADING_DELAY } from './CompletionPopup'
import type { CompletionItem, CompletionProvider } from './completion/types'

/** A controllable harness wrapping a textarea + the popup. */
interface HarnessHandle {
  /** Set the textarea value + caret, then pump a no-op keydown to sync state. */
  type(value: string, caret: number): void
  /** Dispatch a keydown on the textarea, returning whether the popup consumed it. */
  press(init: KeyboardEventInit & { isComposing?: boolean }): boolean
  /** The latest applied value (from the popup's onChange). */
  applied: { value: string; caret: number } | null
}

function Harness({
  providers,
  handleRef,
  portalContainer,
}: {
  providers: CompletionProvider[]
  handleRef: RefObject<HarnessHandle | null>
  portalContainer?: HTMLElement
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const popupRef = useRef<CompletionPopupHandle>(null)
  const [value, setValue] = useState('')
  const appliedRef = useRef<{ value: string; caret: number } | null>(null)

  useImperativeHandle(handleRef, () => ({
    get applied() {
      return appliedRef.current
    },
    type(next: string, caret: number) {
      act(() => {
        setValue(next)
        const ta = textareaRef.current
        if (ta) {
          ta.value = next
          ta.setSelectionRange(caret, caret)
        }
        // A neutral key to push the caret into the popup's state.
        popupRef.current?.handleKeyDown({
          key: 'Process',
          keyCode: 0,
          nativeEvent: { isComposing: false } as KeyboardEvent,
          preventDefault: () => {},
          currentTarget: ta,
        } as never)
      })
    },
    press(init: KeyboardEventInit & { isComposing?: boolean }) {
      const ta = textareaRef.current
      const event = {
        key: init.key,
        keyCode: init.keyCode ?? 0,
        shiftKey: init.shiftKey ?? false,
        nativeEvent: { isComposing: init.isComposing ?? false } as KeyboardEvent,
        preventDefault: vi.fn(),
        currentTarget: ta,
      }
      let consumed = false
      act(() => {
        consumed = popupRef.current?.handleKeyDown(event as never) ?? false
      })
      return consumed
    },
  }))

  return (
    <div>
      <textarea ref={textareaRef} data-testid="ta" value={value} onChange={() => {}} />
      <CompletionPopup
        ref={popupRef}
        textareaRef={textareaRef}
        value={value}
        onChange={(v, c) => {
          appliedRef.current = { value: v, caret: c }
          setValue(v)
        }}
        providers={providers}
        {...(portalContainer ? { portalContainer } : {})}
      />
    </div>
  )
}

function setup(providers: CompletionProvider[], portalContainer?: HTMLElement) {
  const handleRef = { current: null as HarnessHandle | null }
  render(
    <Harness
      providers={providers}
      handleRef={handleRef}
      {...(portalContainer ? { portalContainer } : {})}
    />,
  )
  return handleRef
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('CompletionPopup open/recompute', () => {
  it('opens at the caret when a provider matches and lists items', async () => {
    const h = setup([referenceProvider])
    h.current?.type('~ap', 3)
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    const options = screen.getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['applea pome fruit', 'apricota stone fruit'])
  })

  it('stays closed when no provider matches', () => {
    const h = setup([referenceProvider])
    h.current?.type('hello', 5)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('returns false from handleKeyDown when closed', () => {
    const h = setup([referenceProvider])
    h.current?.type('hello', 5)
    expect(h.current?.press({ key: 'ArrowDown' })).toBe(false)
  })
})

describe('CompletionPopup provider precedence', () => {
  it('the first matching provider in array order wins', async () => {
    const first: CompletionProvider = {
      ...referenceProvider,
      id: 'first',
      items: () => [{ id: 'F', label: 'first-item' }],
    }
    const second: CompletionProvider = {
      ...referenceProvider,
      id: 'second',
      items: () => [{ id: 'S', label: 'second-item' }],
    }
    const h = setup([first, second])
    h.current?.type('~a', 2)
    await waitFor(() => expect(screen.getByText('first-item')).toBeInTheDocument())
    expect(screen.queryByText('second-item')).toBeNull()
  })

  it('falls through to a later provider when the first does not match', async () => {
    const never: CompletionProvider = {
      ...referenceProvider,
      id: 'never',
      match: () => null,
    }
    const h = setup([never, referenceProvider])
    h.current?.type('~ap', 3)
    await waitFor(() => expect(screen.getByText('apple')).toBeInTheDocument())
  })

  it('skips match() for a provider whose trigger is absent before the caret', () => {
    // A provider triggered on `#` should never have match() called for `~ap`,
    // because `#` does not appear in the text up to the caret.
    const match = vi.fn(() => null)
    const hashProvider: CompletionProvider = {
      ...referenceProvider,
      id: 'hash',
      trigger: '#',
      match,
    }
    const h = setup([hashProvider])
    h.current?.type('~ap', 3)
    expect(match).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('still calls match() when the provider trigger is present before the caret', async () => {
    // The same provider's trigger IS present in `~ap`, so match() runs and the
    // popup opens — proving the pre-filter only skips no-hope providers.
    const match = vi.fn(referenceProvider.match)
    const tildeProvider: CompletionProvider = {
      ...referenceProvider,
      id: 'tilde',
      trigger: '~',
      match,
    }
    const h = setup([tildeProvider])
    h.current?.type('~ap', 3)
    await waitFor(() => expect(screen.getByText('apple')).toBeInTheDocument())
    expect(match).toHaveBeenCalled()
  })
})

describe('CompletionPopup keyboard navigation', () => {
  it('ArrowDown/ArrowUp wrap around', async () => {
    const h = setup([referenceProvider])
    h.current?.type('~a', 2) // apple, apricot, banana (contains 'a')
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    const selected = () =>
      screen.getAllByRole('option').findIndex((o) => o.getAttribute('aria-selected') === 'true')
    expect(selected()).toBe(0)
    h.current?.press({ key: 'ArrowDown' })
    expect(selected()).toBe(1)
    h.current?.press({ key: 'ArrowDown' })
    expect(selected()).toBe(2)
    // Wrap forward.
    h.current?.press({ key: 'ArrowDown' })
    expect(selected()).toBe(0)
    // Wrap backward.
    h.current?.press({ key: 'ArrowUp' })
    expect(selected()).toBe(2)
  })

  it('applies the highlighted item on Enter and keeps caret in the textarea', async () => {
    const h = setup([referenceProvider])
    h.current?.type('~ap', 3)
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    const consumed = h.current?.press({ key: 'Enter' })
    expect(consumed).toBe(true)
    expect(h.current?.applied?.value).toBe('~apple ')
    expect(document.activeElement).toBe(screen.getByTestId('ta'))
  })

  it('applies on Tab', async () => {
    const h = setup([referenceProvider])
    h.current?.type('~ap', 3)
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    h.current?.press({ key: 'ArrowDown' }) // highlight apricot
    expect(h.current?.press({ key: 'Tab' })).toBe(true)
    expect(h.current?.applied?.value).toBe('~apricot ')
  })

  it('applies on mousedown over an option', async () => {
    const h = setup([referenceProvider])
    h.current?.type('~ap', 3)
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    fireEvent.mouseDown(screen.getByText('apricot'))
    expect(h.current?.applied?.value).toBe('~apricot ')
  })

  it('highlights an option on mouse enter', async () => {
    const h = setup([referenceProvider])
    h.current?.type('~ap', 3)
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    fireEvent.mouseEnter(screen.getByText('apricot'))
    const apricot = screen.getByText('apricot').closest('[role="option"]')
    expect(apricot?.getAttribute('aria-selected')).toBe('true')
  })

  it('ignores other keys (returns false)', async () => {
    const h = setup([referenceProvider])
    h.current?.type('~ap', 3)
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    expect(h.current?.press({ key: 'a' })).toBe(false)
  })

  it('replaces the whole token when applying mid-token (no text corruption)', async () => {
    const h = setup([referenceProvider])
    // `~apple` with the caret after `ap` (index 3) — the match covers `[0, 6]`.
    h.current?.type('~apple', 3)
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    h.current?.press({ key: 'Enter' })
    // The whole token is replaced — not `~apple ple`.
    expect(h.current?.applied?.value).toBe('~apple ')
  })
})

describe('CompletionPopup IME guard', () => {
  it('does not consume keys while composing (isComposing)', async () => {
    const h = setup([referenceProvider])
    h.current?.type('~ap', 3)
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    // Enter during composition must NOT apply or be consumed.
    expect(h.current?.press({ key: 'Enter', isComposing: true })).toBe(false)
    expect(h.current?.applied).toBeNull()
  })

  it('does not consume keys for the keyCode 229 IME sentinel', async () => {
    const h = setup([referenceProvider])
    h.current?.type('~ap', 3)
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    expect(h.current?.press({ key: 'Enter', keyCode: 229 })).toBe(false)
    expect(h.current?.applied).toBeNull()
  })
})

describe('CompletionPopup escape suppression', () => {
  it('Escape dismisses and suppresses re-open for the same token', async () => {
    const h = setup([referenceProvider])
    h.current?.type('~ap', 3)
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    expect(h.current?.press({ key: 'Escape' })).toBe(true)
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    // Re-syncing the same value+caret must NOT reopen it.
    h.current?.type('~ap', 3)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('reopens after the token text changes following an Escape', async () => {
    const h = setup([referenceProvider])
    h.current?.type('~ap', 3)
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    h.current?.press({ key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    // Extend the token — a different query — and it reopens.
    h.current?.type('~apr', 4)
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    expect(screen.getByText('apricot')).toBeInTheDocument()
  })

  it('reopens after the caret leaves the dismissed token', async () => {
    const h = setup([referenceProvider])
    h.current?.type('~ap', 3)
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    h.current?.press({ key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    // Move away (no token), then back to a fresh token.
    h.current?.type('~ap done', 8)
    h.current?.type('~ba', 3)
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
  })
})

describe('CompletionPopup async items', () => {
  it('aborts a stale request when the query changes before resolution', async () => {
    const aborts: boolean[] = []
    let resolveFirst: ((items: CompletionItem[]) => void) | null = null
    const asyncProvider: CompletionProvider = {
      ...referenceProvider,
      id: 'async',
      items: (query, signal) => {
        if (query === 'a') {
          return new Promise<CompletionItem[]>((resolve) => {
            resolveFirst = resolve
            signal.addEventListener('abort', () => aborts.push(true))
          })
        }
        return [{ id: 'b', label: `q-${query}` }]
      },
    }
    const h = setup([asyncProvider])
    h.current?.type('~a', 2)
    // Change the query before the first promise resolves.
    h.current?.type('~ab', 3)
    // The first request's signal must have aborted.
    expect(aborts).toEqual([true])
    // Resolving the stale promise now must not surface its items.
    await act(async () => {
      resolveFirst?.([{ id: 'stale', label: 'stale-item' }])
    })
    expect(screen.queryByText('stale-item')).toBeNull()
    // The fresh query's (sync) items render.
    await waitFor(() => expect(screen.getByText('q-ab')).toBeInTheDocument())
  })

  it('does not keep showing or applying a prior token’s items after the query changes', async () => {
    let resolveFirst: ((items: CompletionItem[]) => void) | null = null
    const provider: CompletionProvider = {
      ...referenceProvider,
      id: 'slow-first',
      items: (query) => {
        if (query === 'a') {
          return new Promise<CompletionItem[]>((resolve) => {
            resolveFirst = resolve
          })
        }
        // The second query never resolves, so only the (stale) first set could
        // possibly remain visible — and it must not.
        return new Promise<CompletionItem[]>(() => {})
      },
    }
    const h = setup([provider])
    h.current?.type('~a', 2)
    await act(async () => {
      resolveFirst?.([{ id: 'stale', label: 'stale-item' }])
    })
    await waitFor(() => expect(screen.getByText('stale-item')).toBeInTheDocument())
    // Extend the token → active query is '~az', whose request is pending.
    h.current?.type('~az', 3)
    // The stale '~a' items must no longer be shown (dead token).
    await waitFor(() => expect(screen.queryByText('stale-item')).toBeNull())
    // The new token's request is in flight, so the popup is key-active: Enter is
    // consumed (preventing an accidental send) but applies nothing stale.
    expect(h.current?.press({ key: 'Enter' })).toBe(true)
    expect(h.current?.applied).toBeNull()
  })

  it('shows a loading state only after LOADING_DELAY', async () => {
    vi.useFakeTimers()
    let resolve: ((items: CompletionItem[]) => void) | null = null
    const slow: CompletionProvider = {
      ...referenceProvider,
      id: 'slow',
      items: () =>
        new Promise<CompletionItem[]>((r) => {
          resolve = r
        }),
    }
    const h = setup([slow])
    h.current?.type('~a', 2)
    // Before the delay elapses: no loading indicator, no listbox.
    expect(screen.queryByTestId('chat-completion-loading')).toBeNull()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOADING_DELAY)
    })
    expect(screen.getByTestId('chat-completion-loading')).toBeInTheDocument()
    // Resolving clears loading and renders items.
    await act(async () => {
      resolve?.([{ id: 'x', label: 'resolved' }])
    })
    expect(screen.getByText('resolved')).toBeInTheDocument()
    expect(screen.queryByTestId('chat-completion-loading')).toBeNull()
  })

  it('re-waits LOADING_DELAY for a new query instead of flashing the prior spinner', async () => {
    vi.useFakeTimers()
    // The provider never resolves, so each query stays in the loading window.
    const slow: CompletionProvider = {
      ...referenceProvider,
      id: 'never',
      items: () => new Promise<CompletionItem[]>(() => {}),
    }
    const h = setup([slow])
    h.current?.type('~a', 2)
    // First query: spinner appears only after the delay.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOADING_DELAY)
    })
    expect(screen.getByTestId('chat-completion-loading')).toBeInTheDocument()
    // Change the token → a fresh request starts; the spinner must be cleared
    // immediately (no flash) and only reappear after the new delay elapses.
    h.current?.type('~ab', 3)
    expect(screen.queryByTestId('chat-completion-loading')).toBeNull()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOADING_DELAY)
    })
    expect(screen.getByTestId('chat-completion-loading')).toBeInTheDocument()
  })

  it('handles nav/apply/escape gracefully while loading with no items', async () => {
    vi.useFakeTimers()
    let resolve: ((items: CompletionItem[]) => void) | null = null
    const slow: CompletionProvider = {
      ...referenceProvider,
      id: 'slow',
      items: () =>
        new Promise<CompletionItem[]>((r) => {
          resolve = r
        }),
    }
    const h = setup([slow])
    h.current?.type('~a', 2)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOADING_DELAY)
    })
    // Open in the loading state with an empty item list.
    expect(screen.getByTestId('chat-completion-loading')).toBeInTheDocument()
    // ArrowDown/ArrowUp are consumed but keep the highlight at 0 (empty list).
    expect(h.current?.press({ key: 'ArrowDown' })).toBe(true)
    expect(h.current?.press({ key: 'ArrowUp' })).toBe(true)
    // Enter is consumed while the loading popup is open (so the composer never
    // submits the unfinished token), but nothing is applied yet.
    expect(h.current?.press({ key: 'Enter' })).toBe(true)
    expect(h.current?.applied).toBeNull()
    // Tab falls through while loading (no item) so focus can move normally.
    expect(h.current?.press({ key: 'Tab' })).toBe(false)
    expect(h.current?.applied).toBeNull()
    // Escape dismisses even while loading.
    expect(h.current?.press({ key: 'Escape' })).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.queryByTestId('chat-completion-loading')).toBeNull()
    // Settle the promise so the controller cleanup has nothing pending.
    await act(async () => {
      resolve?.([])
    })
  })

  it('ignores a rejection that lands after the request was aborted', async () => {
    let rejectFirst: ((err: Error) => void) | null = null
    const provider: CompletionProvider = {
      ...referenceProvider,
      id: 'reject-after-abort',
      items: (query) => {
        if (query === 'a') {
          return new Promise<CompletionItem[]>((_, reject) => {
            rejectFirst = reject
          })
        }
        return [{ id: 'b', label: `q-${query}` }]
      },
    }
    const h = setup([provider])
    h.current?.type('~a', 2)
    // Change the query → the first request's controller aborts.
    h.current?.type('~ab', 3)
    // The late rejection of the aborted request must be swallowed (no throw,
    // no state change) — the fresh query's items remain.
    await act(async () => {
      rejectFirst?.(new Error('late'))
    })
    await waitFor(() => expect(screen.getByText('q-ab')).toBeInTheDocument())
  })

  it('treats a rejected items() as empty (no popup)', async () => {
    const failing: CompletionProvider = {
      ...referenceProvider,
      id: 'fail',
      items: () => Promise.reject(new Error('boom')),
    }
    const h = setup([failing])
    await act(async () => {
      h.current?.type('~a', 2)
    })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.queryByTestId('chat-completion-loading')).toBeNull()
  })

  it('survives a synchronous throw from items() (no crash, no popup)', async () => {
    const throwing: CompletionProvider = {
      ...referenceProvider,
      id: 'sync-throw',
      items: () => {
        throw new Error('sync boom')
      },
    }
    const h = setup([throwing])
    await act(async () => {
      h.current?.type('~a', 2)
    })
    // The composer is intact and the popup simply does not open.
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.queryByTestId('chat-completion-loading')).toBeNull()
    expect(h.current).not.toBeNull()
  })
})

describe('CompletionPopup accessibility', () => {
  it('maintains aria-activedescendant on the textarea', async () => {
    const h = setup([referenceProvider])
    h.current?.type('~ap', 3)
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    const ta = screen.getByTestId('ta')
    // The textarea points at the currently-highlighted option's actual id
    // (instance-scoped, so we read it off the live option rather than hardcode).
    const activeId = () => ta.getAttribute('aria-activedescendant')
    const selectedId = () =>
      screen
        .getAllByRole('option')
        .find((o) => o.getAttribute('aria-selected') === 'true')
        ?.getAttribute('id')
    expect(activeId()).toBe(selectedId())
    const first = activeId()
    h.current?.press({ key: 'ArrowDown' })
    expect(activeId()).toBe(selectedId())
    expect(activeId()).not.toBe(first)
    // The textarea is also wired to the listbox via aria-controls.
    expect(ta.getAttribute('aria-controls')).toBe(screen.getByRole('listbox').id)
    expect(screen.getByRole('listbox').id).not.toBe('')
  })

  it('clears aria-activedescendant and aria-controls when the popup closes', async () => {
    const h = setup([referenceProvider])
    h.current?.type('~ap', 3)
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    h.current?.type('hello', 5)
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    const ta = screen.getByTestId('ta')
    expect(ta.getAttribute('aria-activedescendant')).toBeNull()
    expect(ta.getAttribute('aria-controls')).toBeNull()
  })
})

describe('CompletionPopup with a detached textarea ref', () => {
  // A provider that matches regardless of caret, so the popup can open even when
  // no textarea is attached (its ref `.current` is null). This exercises every
  // null-textarea guard: caret sync, coords measurement, and apply focus.
  const alwaysMatch: CompletionProvider = {
    id: 'always',
    trigger: '!',
    match: (text) => ({ query: text, range: [0, text.length] }),
    items: () => [{ id: 'only', label: 'only-item' }],
    apply: () => ({ value: 'applied', caret: 7 }),
  }

  function DetachedHarness({ handleRef }: { handleRef: RefObject<CompletionPopupHandle | null> }) {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    return (
      <CompletionPopup
        ref={handleRef}
        textareaRef={textareaRef}
        value="!x"
        onChange={() => {}}
        providers={[alwaysMatch]}
      />
    )
  }

  it('opens but renders nothing (coords null) and apply is a no-op on focus', async () => {
    const handleRef = { current: null as CompletionPopupHandle | null }
    render(<DetachedHarness handleRef={handleRef} />)
    // Flush the async items resolution (a microtask) inside act.
    await act(async () => {
      await Promise.resolve()
    })
    // Items resolve (sync) and the match is active, so the popup is "open", but
    // with no textarea there is no caret position → it renders null.
    expect(handleRef.current).not.toBeNull()
    expect(screen.queryByRole('listbox')).toBeNull()
    // Pressing keys must not throw despite the null ref; flush any async
    // re-resolution of items inside act to keep the test warning-free.
    const press = async (key: string) =>
      act(async () => {
        handleRef.current?.handleKeyDown({
          key,
          keyCode: 0,
          nativeEvent: { isComposing: false } as KeyboardEvent,
          preventDefault: () => {},
          currentTarget: null,
        } as never)
        await Promise.resolve()
      })
    // The popup is logically open (match + items) but renders null without
    // coords; nav highlights and Enter "applies" — neither touches the missing
    // textarea, exercising the null-ref guards.
    await press('ArrowDown')
    await press('Enter')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('opens against a textarea whose document has no defaultView', async () => {
    // A textarea in a detached document has `defaultView === null`. Driving the
    // popup open against it exercises the `defaultView ?? null` branch in the
    // coords/listener effect (the resize/scroll listeners simply attach to no
    // window). The trigger pre-filter still passes because the caret (synced
    // from the real `selectionStart`) sits past the `!` trigger.
    const detached = document.implementation.createHTMLDocument('t')
    const textarea = detached.createElement('textarea')
    textarea.value = '!x'
    textarea.setSelectionRange(2, 2)
    detached.body.appendChild(textarea)
    expect(textarea.ownerDocument.defaultView).toBeNull()
    const textareaRef = { current: textarea }
    const handleRef = { current: null as CompletionPopupHandle | null }
    render(
      <CompletionPopup
        ref={handleRef}
        textareaRef={textareaRef}
        value="!x"
        onChange={() => {}}
        providers={[alwaysMatch]}
      />,
    )
    // Sync the caret from the (real) selection so the pre-filter sees `!` in the
    // text up to the caret, then flush the sync async items resolution.
    await act(async () => {
      handleRef.current?.syncCaret()
      await Promise.resolve()
    })
    // The listbox renders into the DETACHED document's body (not the test
    // document `screen` queries), so it is found there rather than via `screen`.
    expect(detached.querySelector('[role="listbox"]')).not.toBeNull()
  })
})

describe('CompletionPopup rendering', () => {
  it('renders an item icon when present', async () => {
    const iconProvider: CompletionProvider = {
      ...referenceProvider,
      id: 'icon',
      items: () => [{ id: 'i', label: 'iconned', icon: <span data-testid="opt-icon" /> }],
    }
    const h = setup([iconProvider])
    h.current?.type('~a', 2)
    await waitFor(() => expect(screen.getByTestId('opt-icon')).toBeInTheDocument())
  })

  it('renders into a custom portal container', async () => {
    const container = document.createElement('div')
    container.id = 'portal'
    document.body.appendChild(container)
    try {
      const h = setup([referenceProvider], container)
      h.current?.type('~ap', 3)
      await waitFor(() => expect(container.querySelector('[role="listbox"]')).not.toBeNull())
    } finally {
      container.remove()
    }
  })

  it('copies the resolved --chat-* theme tokens onto the portaled popup root', async () => {
    // The popup portals to document.body, escaping a wrapper-scoped theme hook.
    // It must copy the RESOLVED tokens from the textarea's themed context onto
    // its own root so a `[data-theme="dark"]` on a SUBTREE wrapper still themes
    // the popup. jsdom does not resolve INHERITED custom properties, so we set
    // the resolved value directly on the textarea (what getComputedStyle would
    // return in a real browser under an ancestor theme) and assert it lands on
    // the popup as an inline custom property.
    const h = setup([referenceProvider])
    const ta = screen.getByTestId('ta') as HTMLTextAreaElement
    ta.style.setProperty('--chat-bg', '#0b0f19')
    ta.style.setProperty('--chat-fg', '#f9fafb')
    h.current?.type('~ap', 3)
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    const popup = document.querySelector('.chat-completion-popup') as HTMLElement
    await waitFor(() => expect(popup.style.getPropertyValue('--chat-bg')).toBe('#0b0f19'))
    expect(popup.style.getPropertyValue('--chat-fg')).toBe('#f9fafb')
  })

  it('does not copy tokens that resolve to empty (keeps the popup CSS default)', async () => {
    // With no resolved tokens on the textarea (jsdom returns empty for unset
    // custom properties), the popup root carries no inline --chat-* overrides,
    // so its own stylesheet defaults apply.
    const h = setup([referenceProvider])
    h.current?.type('~ap', 3)
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    const popup = document.querySelector('.chat-completion-popup') as HTMLElement
    expect(popup.style.getPropertyValue('--chat-bg')).toBe('')
  })

  // Stub the textarea's computed `font-family` so the font-copy branches are
  // explicit and independent of jsdom/<body> defaults. Returns a Proxy over the
  // real computed style that overrides only `fontFamily` for the textarea.
  const stubTextareaFontFamily = (ta: HTMLTextAreaElement, fontFamily: string) => {
    const realStyle = window.getComputedStyle.bind(window)
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
      if (el === ta) {
        return new Proxy(realStyle(ta), {
          get(target, prop) {
            if (prop === 'fontFamily') return fontFamily
            return Reflect.get(target, prop)
          },
        }) as CSSStyleDeclaration
      }
      return realStyle(el as Element)
    })
  }

  it('copies the textarea resolved computed font-family onto the portaled popup', async () => {
    // Change 0009: `--chat-font-family` defaults to `inherit`, which would
    // resolve against `<body>` once the popup portals there. So the popup must
    // copy the textarea's RESOLVED computed `font-family` as a real CSS property
    // (NOT the token) so the popup paints in the SAME font as the composer even
    // when a host scopes a font to a wrapper around it.
    const h = setup([referenceProvider])
    const ta = screen.getByTestId('ta') as HTMLTextAreaElement
    // Stub the RESOLVED computed font so the non-empty branch is explicit and not
    // reliant on jsdom resolving an inline style (which it does not reliably do).
    stubTextareaFontFamily(ta, '"Comic Sans MS", cursive')
    h.current?.type('~ap', 3)
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    const popup = document.querySelector('.chat-completion-popup') as HTMLElement
    await waitFor(() => expect(popup.style.fontFamily).toBe('"Comic Sans MS", cursive'))
    // The font is a REAL CSS property, not the --chat-font-family token.
    expect(popup.style.getPropertyValue('--chat-font-family')).toBe('')
  })

  it('omits font-family when the textarea resolves no computed font (empty branch)', async () => {
    // Stub the RESOLVED computed font to empty so the empty branch is explicit
    // and environment-independent: the popup must leave its `style.fontFamily`
    // unset so its own stylesheet (which inherits) applies.
    const h = setup([referenceProvider])
    const ta = screen.getByTestId('ta') as HTMLTextAreaElement
    stubTextareaFontFamily(ta, '')
    h.current?.type('~ap', 3)
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    const popup = document.querySelector('.chat-completion-popup') as HTMLElement
    expect(popup.style.fontFamily).toBe('')
  })

  it('clamps the popup left to stay on-screen when measured near the right edge', async () => {
    // Drive a 375px viewport with the caret anchored near the right edge and a
    // measured popup width of 192px. The post-render measurement re-clamps the
    // left so the popup stays fully within the viewport.
    const ta = screen.queryByTestId('ta')
    void ta
    // Pin the viewport width and the textarea's rect (caret anchors at rect.left
    // since offsetLeft is 0 in jsdom).
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(375)
    const realRect = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.tagName === 'TEXTAREA') {
        return {
          top: 40,
          left: 320,
          bottom: 64,
          right: 490,
          width: 170,
          height: 24,
          x: 320,
          y: 40,
          toJSON: () => ({}),
        } as DOMRect
      }
      if (this.classList.contains('chat-completion-popup')) {
        return {
          top: 0,
          left: 0,
          bottom: 0,
          right: 192,
          width: 192,
          height: 100,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect
      }
      return realRect.call(this)
    })
    const h = setup([referenceProvider])
    h.current?.type('~ap', 3)
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    const popup = document.querySelector('.chat-completion-popup') as HTMLElement
    // After measurement re-clamps: left = 375 - 192 - 8 = 175; right edge 367 ≤ 375.
    await waitFor(() => expect(popup.style.left).toBe('175px'))
    const left = Number.parseFloat(popup.style.left)
    expect(left).toBeGreaterThanOrEqual(0)
    expect(left + 192).toBeLessThanOrEqual(375)
  })

  it('flips above the caret near the viewport bottom', async () => {
    const h = setup([referenceProvider])
    // Position the textarea near the bottom of the viewport so the popup flips.
    const ta = screen.getByTestId('ta') as HTMLTextAreaElement
    const realStyle = window.getComputedStyle.bind(window)
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
      if (el === ta) {
        return new Proxy(realStyle(ta), {
          get(target, prop) {
            if (prop === 'lineHeight') return '20px'
            return Reflect.get(target, prop)
          },
        }) as CSSStyleDeclaration
      }
      return realStyle(el)
    })
    vi.spyOn(ta, 'getBoundingClientRect').mockReturnValue({
      top: window.innerHeight - 10,
      left: 40,
      bottom: window.innerHeight,
      right: 200,
      width: 160,
      height: 24,
      x: 40,
      y: window.innerHeight - 10,
      toJSON: () => ({}),
    } as DOMRect)
    h.current?.type('~ap', 3)
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    const popup = document.querySelector('.chat-completion-popup') as HTMLElement
    expect(popup.getAttribute('data-flip')).toBe('true')
  })
})
