/**
 * `CompletionPopup` — the portal-rendered, caret-anchored completion list.
 *
 * The popup is driven imperatively by the composer: it watches the textarea's
 * `value` + caret, runs the providers' `match()`/`items()`, and renders a
 * `role="listbox"` anchored at the caret. The composer forwards keystrokes to
 * the ref's {@link CompletionPopupHandle.handleKeyDown} BEFORE its own Enter/
 * mention handling; that method returns `true` when it consumed the key.
 *
 * Behavior (per the input-composer spec):
 *  - First matching provider in array order wins.
 *  - `ArrowUp`/`ArrowDown` navigate with wrap-around; `Enter`/`Tab` apply the
 *    highlighted item; `Escape` dismisses and suppresses re-open for the same
 *    token until the caret leaves it or the token text changes.
 *  - IME composition is guarded (`isComposing`/`keyCode === 229`).
 *  - Async `items()` run under an `AbortController`; stale queries are aborted
 *    and never applied. A short `LOADING_DELAY` elapses before a loading state
 *    shows, to avoid flicker on fast providers.
 *  - The popup flips above the caret when it would clip the viewport bottom.
 *  - It renders through a portal (default `document.body`).
 *  - Accessibility: options are `role="option"` with `aria-selected`; the
 *    textarea's `aria-activedescendant` tracks the highlighted option so focus
 *    stays in the input.
 *
 * Visual atoms come exclusively from `useChatComponents()` (spinner icon,
 * scroll area) — never a direct primitive/icon import.
 *
 * SSR-safe: DOM measurement happens in effects/handlers; render reads only
 * React state.
 */
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useChatComponents } from '../registry'
import { computePopupAnchor } from './caret'
import type { CompletionItem, CompletionMatch, CompletionProvider } from './completion/types'

/** Delay (ms) before a loading indicator shows, to avoid flicker on fast providers. */
export const LOADING_DELAY = 150

/** Estimated popup height (px) used to decide whether to flip above the caret. */
const ESTIMATED_POPUP_HEIGHT = 220

/** The imperative surface the composer drives. */
export interface CompletionPopupHandle {
  /**
   * Handle a keydown forwarded from the composer. Returns `true` when the popup
   * consumed the key (so the composer must not also act on it), `false`
   * otherwise.
   */
  handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>): boolean
  /**
   * Re-read the textarea's current caret position. The composer calls this from
   * `onSelect` so selection-only caret moves (clicks, arrow keys that don't edit
   * the text) recompute the active match — otherwise the popup could stay open
   * for a token the caret has already left.
   */
  syncCaret(): void
}

/** Props for {@link CompletionPopup}. */
export interface CompletionPopupProps {
  /** Ref to the composer's textarea — used for caret measurement + apply. */
  textareaRef: RefObject<HTMLTextAreaElement | null>
  /** The current textarea value (controlled by the composer). */
  value: string
  /**
   * Apply a completion: replace the value and place the caret. The composer
   * commits the new value and restores textarea focus/caret.
   */
  onChange(next: string, caret: number): void
  /** Providers, in precedence order (first match wins). */
  providers: CompletionProvider[]
  /** Portal target. Defaults to `document.body`. */
  portalContainer?: HTMLElement
}

/** The active match + the provider that produced it. */
interface ActiveMatch {
  provider: CompletionProvider
  match: CompletionMatch
}

/** A `[start, end]` token range, compared structurally for Escape suppression. */
type Range = [number, number]

/** True when two ranges are identical. */
function sameRange(a: Range | null, b: Range | null): boolean {
  return a !== null && b !== null && a[0] === b[0] && a[1] === b[1]
}

/**
 * Stable identity for an active match: its provider id, token range, and query.
 * The resolved `items` are tagged with this key so a result set is only shown
 * (and applied) while the active token still matches the one it was fetched for.
 */
function matchKey(match: ActiveMatch): string {
  const [start, end] = match.match.range
  return `${match.provider.id}:${start}:${end}:${match.match.query}`
}

/**
 * Find the first provider (in array order) whose trigger appears in the token
 * and whose `match()` returns a hit at the caret. The trigger pre-filter is a
 * cheap O(1)-ish early-out before the (still cheap) `match()` call.
 */
function findActiveMatch(
  providers: CompletionProvider[],
  text: string,
  caret: number,
): ActiveMatch | null {
  for (const provider of providers) {
    const match = provider.match(text, caret)
    if (match) return { provider, match }
  }
  return null
}

function CompletionPopupImpl(
  { textareaRef, value, onChange, providers, portalContainer }: CompletionPopupProps,
  ref: React.Ref<CompletionPopupHandle>,
) {
  const { icons, ScrollArea } = useChatComponents()
  const Spinner = icons.spinner

  // Caret offset, refreshed whenever the composer reports a key/selection event.
  const [caret, setCaret] = useState(0)
  const [items, setItems] = useState<CompletionItem[]>([])
  // Identity (provider id + range + query) of the match the current `items` were
  // resolved for. Used to ignore a stale result set after the active token
  // changes — without it, old items could keep the popup open (and be applied to
  // the new token) until a slower async request resolves.
  const [itemsKey, setItemsKey] = useState<string | null>(null)
  const [highlight, setHighlight] = useState(0)
  // `pending` is true from the moment a request starts until it settles; it
  // gates key interception so Enter is captured even during the brief window
  // before the (delayed) loading indicator appears. `loading` only controls the
  // visible spinner (shown after LOADING_DELAY).
  const [pending, setPending] = useState(false)
  const [loading, setLoading] = useState(false)
  const [coords, setCoords] = useState<{ left: number; top: number; flip: boolean } | null>(null)
  // The token range the user dismissed via Escape; suppresses re-open until the
  // caret leaves that token or the token text changes.
  const [dismissed, setDismissed] = useState<{ range: Range; query: string } | null>(null)

  // Sync the caret from the textarea's live selection after every value change.
  // `handleKeyDown` fires BEFORE the browser inserts the character, so reading
  // the selection there lags by one; reading it here — after the controlled
  // `value` has committed to the DOM — captures the post-edit caret. The
  // `void value` read makes the post-commit dependency explicit.
  useEffect(() => {
    void value
    const textarea = textareaRef.current
    if (textarea) setCaret(textarea.selectionStart)
  }, [value, textareaRef])

  // Recompute the active match each render with cheap early-outs.
  const active = useMemo<ActiveMatch | null>(
    () => findActiveMatch(providers, value, caret),
    [providers, value, caret],
  )

  // Whether the current match is currently suppressed by a prior Escape.
  const suppressed =
    active !== null &&
    dismissed !== null &&
    sameRange(active.match.range, dismissed.range) &&
    active.match.query === dismissed.query

  // Clear a stale dismissal once the caret leaves the dismissed token or the
  // token text changes, so a fresh trigger re-opens the popup.
  useEffect(() => {
    if (!dismissed) return
    const stillSame =
      active !== null &&
      sameRange(active.match.range, dismissed.range) &&
      active.match.query === dismissed.query
    if (!stillSame) setDismissed(null)
  }, [active, dismissed])

  // Resolve items for the active query under an AbortController. Stale queries
  // are aborted; a delayed loading flag avoids flicker on fast providers. The
  // effect keys on `active` (a memo of providers/value/caret) and `suppressed`;
  // an aborted in-flight request makes a redundant re-run harmless.
  useEffect(() => {
    if (!active || suppressed) {
      setItems([])
      setItemsKey(null)
      setPending(false)
      setLoading(false)
      return
    }
    // Discard any prior result set immediately so stale items from the previous
    // token never linger (visible or applicable) while the new query resolves.
    const key = matchKey(active)
    setItems([])
    setItemsKey(null)
    // Mark a request in flight so keys are intercepted even before the delayed
    // loading indicator appears.
    setPending(true)
    const controller = new AbortController()
    let settled = false
    const loadingTimer = setTimeout(() => {
      if (!settled) setLoading(true)
    }, LOADING_DELAY)

    // Call `items()` synchronously so a provider that subscribes to `signal`
    // does so before any abort, then resolve via a promise. A SYNCHRONOUS throw
    // is funneled to the same error path (`Promise.reject`) as a rejected async
    // one — the contract allows sync providers, which must not crash the composer.
    let result: Promise<CompletionItem[]> | CompletionItem[]
    try {
      result = active.provider.items(active.match.query, controller.signal)
    } catch (error) {
      result = Promise.reject(error)
    }
    Promise.resolve(result)
      .then((resolved) => {
        if (controller.signal.aborted) return
        settled = true
        clearTimeout(loadingTimer)
        setItems(resolved)
        setItemsKey(key)
        setHighlight(0)
        setPending(false)
        setLoading(false)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        settled = true
        clearTimeout(loadingTimer)
        setItems([])
        setItemsKey(null)
        setPending(false)
        setLoading(false)
      })

    return () => {
      settled = true
      clearTimeout(loadingTimer)
      controller.abort()
    }
  }, [active, suppressed])

  // The active match when the popup is "active" for key handling: matched, not
  // suppressed, and either a request is in flight (`pending`/`loading`) OR there
  // are items resolved FOR THIS EXACT match (so a previous token's result set is
  // never shown or applied to a new one). Intercepting keys while `pending` —
  // even before the delayed loading indicator — stops a fast Enter from sending
  // an unfinished token. `open` derives from it and gives non-null narrowing.
  const itemsMatchActive = active !== null && itemsKey === matchKey(active)
  const openMatch =
    active !== null && !suppressed && (pending || loading || (itemsMatchActive && items.length > 0))
      ? active
      : null
  const open = openMatch !== null
  // Whether the popup has anything VISIBLE to render (a list or the spinner).
  // It can be key-active (`open`) while a request is pending pre-LOADING_DELAY
  // with nothing yet to show.
  const hasVisibleContent = loading || (itemsMatchActive && items.length > 0)

  // Re-measure the caret anchor. A fixed-position popup must follow viewport
  // changes, so this also runs on window scroll/resize and textarea scroll.
  const updateCoords = useCallback(() => {
    const textarea = textareaRef.current
    if (!open || !textarea) {
      setCoords(null)
      return
    }
    setCoords(computePopupAnchor(textarea, caret, ESTIMATED_POPUP_HEIGHT))
  }, [open, caret, textareaRef])

  // Measure on open and whenever the caret/value moves (the `void value` read
  // makes the re-measure-on-reflow dependency explicit), and keep the anchor in
  // sync with scroll/resize while open.
  useEffect(() => {
    void value
    updateCoords()
    if (!open) return
    const textarea = textareaRef.current
    const win = textarea?.ownerDocument.defaultView ?? null
    win?.addEventListener('resize', updateCoords)
    // Capture-phase scroll catches scrolling on any ancestor, not just window.
    win?.addEventListener('scroll', updateCoords, true)
    textarea?.addEventListener('scroll', updateCoords)
    return () => {
      win?.removeEventListener('resize', updateCoords)
      win?.removeEventListener('scroll', updateCoords, true)
      textarea?.removeEventListener('scroll', updateCoords)
    }
  }, [open, value, updateCoords, textareaRef])

  // Apply an item against a known-open match: rewrite value + caret. Only ever
  // called with the current `openMatch` (from a rendered option or a consumed
  // key), so the match is passed in rather than re-derived.
  const applyItem = useCallback(
    (match: ActiveMatch, item: CompletionItem) => {
      const [start, end] = match.match.range
      const before = value.slice(0, start)
      const after = value.slice(end)
      const next = match.provider.apply(item, before, after)
      onChange(next.value, next.caret)
      // Restore focus + caret to the textarea after the value commits.
      const textarea = textareaRef.current
      if (textarea) {
        textarea.focus()
        textarea.setSelectionRange(next.caret, next.caret)
      }
      setCaret(next.caret)
    },
    [value, onChange, textareaRef],
  )

  // Re-read the live caret (selection-only moves don't change `value`, so the
  // value-driven sync effect won't fire for them).
  const syncCaret = useCallback(() => {
    const textarea = textareaRef.current
    if (textarea) setCaret(textarea.selectionStart)
  }, [textareaRef])

  // Per-instance prefix so multiple mounted popups never collide on option IDs
  // (which would let one textarea's aria-activedescendant point at another's
  // option). `useId` yields a stable, unique base per component instance.
  const baseId = useId()
  const optionId = useCallback(
    (index: number) => `chat-completion-option-${baseId}-${index}`,
    [baseId],
  )

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>): boolean => {
      // Always track the caret so the next render recomputes against fresh state.
      const textarea = textareaRef.current
      if (textarea) setCaret(textarea.selectionStart)

      // IME composition in progress — never intercept.
      if (event.nativeEvent.isComposing || event.keyCode === 229) return false
      // `openMatch` is non-null exactly when the popup is shown.
      if (!openMatch) return false

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          setHighlight((h) => (items.length === 0 ? 0 : (h + 1) % items.length))
          return true
        case 'ArrowUp':
          event.preventDefault()
          setHighlight((h) => (items.length === 0 ? 0 : (h - 1 + items.length) % items.length))
          return true
        case 'Enter': {
          // Enter always belongs to an open popup — consume it even with no item
          // yet (async provider still loading) so the composer never submits the
          // unfinished token. Apply only when an item is highlighted.
          event.preventDefault()
          const item = items[highlight]
          if (item) applyItem(openMatch, item)
          return true
        }
        case 'Tab': {
          // Tab applies the highlighted item; with no item yet (still loading) it
          // falls through so keyboard users can move focus normally rather than
          // being trapped in the composer.
          const item = items[highlight]
          if (!item) return false
          event.preventDefault()
          applyItem(openMatch, item)
          return true
        }
        case 'Escape':
          event.preventDefault()
          setDismissed({ range: openMatch.match.range, query: openMatch.match.query })
          return true
        default:
          return false
      }
    },
    [openMatch, items, highlight, applyItem, textareaRef],
  )

  useImperativeHandle(ref, () => ({ handleKeyDown, syncCaret }), [handleKeyDown, syncCaret])

  // Maintain `aria-activedescendant` on the textarea so focus stays in the input
  // while the active option is announced.
  useEffect(() => {
    const textarea = textareaRef.current
    if (open && items.length > 0) {
      textarea?.setAttribute('aria-activedescendant', optionId(highlight))
    } else {
      textarea?.removeAttribute('aria-activedescendant')
    }
    return () => {
      textareaRef.current?.removeAttribute('aria-activedescendant')
    }
  }, [open, items.length, highlight, optionId, textareaRef])

  // Render nothing while key-active but with no visible content yet (a request
  // is pending before the loading indicator), or before coords are measured.
  if (!openMatch || !hasVisibleContent || !coords) return null

  // Default to the textarea's OWN document body (not the global one) so the
  // popup renders into the right document for iframe / alternate-document hosts.
  // The textarea is guaranteed present here: `coords` is only set while it is
  // mounted (see `updateCoords`), and we returned null above when it is missing.
  const container =
    portalContainer ?? (textareaRef.current as HTMLTextAreaElement).ownerDocument.body

  const content: ReactNode = (
    <div
      className="chat-completion-popup"
      data-flip={coords.flip ? 'true' : undefined}
      style={{
        position: 'fixed',
        left: coords.left,
        top: coords.top,
        transform: coords.flip ? 'translateY(-100%)' : undefined,
      }}
    >
      <ScrollArea className="chat-completion-scroll">
        {loading && items.length === 0 ? (
          <div className="chat-completion-loading" data-testid="chat-completion-loading">
            <Spinner className="chat-completion-spinner" />
          </div>
        ) : (
          // WAI-ARIA listbox/option pattern: focus stays on the textarea (via
          // aria-activedescendant), so the listbox and options are not focusable
          // themselves — correct for a combobox-style popup. Suppressions follow.
          // biome-ignore lint/a11y/useSemanticElements: ARIA listbox role is intended here.
          // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: driven via the textarea.
          // biome-ignore lint/a11y/useFocusableInteractive: focus stays in the textarea by design.
          <ul className="chat-completion-list" role="listbox" aria-label="Completions">
            {items.map((item, index) => (
              // biome-ignore lint/a11y/useFocusableInteractive: options are never focused directly.
              <li
                key={item.id}
                id={optionId(index)}
                // biome-ignore lint/a11y/useSemanticElements: ARIA option role is intended here.
                // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: activated via the textarea.
                role="option"
                aria-selected={index === highlight}
                data-active={index === highlight ? 'true' : undefined}
                className="chat-completion-option"
                // Mousedown (not click) so the textarea never loses focus first.
                onMouseDown={(event) => {
                  event.preventDefault()
                  applyItem(openMatch, item)
                }}
                onMouseEnter={() => setHighlight(index)}
              >
                {item.icon ? <span className="chat-completion-icon">{item.icon}</span> : null}
                <span className="chat-completion-label">{item.label}</span>
                {item.description ? (
                  <span className="chat-completion-description">{item.description}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  )

  return createPortal(content, container)
}

/** Caret-anchored, portal-rendered completion popup. See module doc. */
export const CompletionPopup = forwardRef<CompletionPopupHandle, CompletionPopupProps>(
  CompletionPopupImpl,
)
CompletionPopup.displayName = 'CompletionPopup'
