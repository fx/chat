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
import { referenceProvider } from './completion/reference'
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
    // Enter must not apply the stale item to the new token.
    expect(h.current?.press({ key: 'Enter' })).toBe(false)
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
    // Enter finds no item to apply → not consumed, nothing applied.
    expect(h.current?.press({ key: 'Enter' })).toBe(false)
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
})

describe('CompletionPopup accessibility', () => {
  it('maintains aria-activedescendant on the textarea', async () => {
    const h = setup([referenceProvider])
    h.current?.type('~ap', 3)
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    const ta = screen.getByTestId('ta')
    expect(ta.getAttribute('aria-activedescendant')).toBe('chat-completion-option-0')
    h.current?.press({ key: 'ArrowDown' })
    expect(ta.getAttribute('aria-activedescendant')).toBe('chat-completion-option-1')
  })

  it('clears aria-activedescendant when the popup closes', async () => {
    const h = setup([referenceProvider])
    h.current?.type('~ap', 3)
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    h.current?.type('hello', 5)
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    expect(screen.getByTestId('ta').getAttribute('aria-activedescendant')).toBeNull()
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
    const h = setup([referenceProvider], container)
    h.current?.type('~ap', 3)
    await waitFor(() => expect(container.querySelector('[role="listbox"]')).not.toBeNull())
    document.body.removeChild(container)
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
