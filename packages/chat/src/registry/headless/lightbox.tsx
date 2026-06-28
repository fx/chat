/**
 * Headless `Lightbox` overlay — a self-contained, accessible enlarged-image
 * overlay for the attachment image grid.
 *
 * Zero third-party dependencies (only React). It implements the a11y contract
 * the registry slot promises:
 *  - `role="dialog"` + `aria-modal` with `aria-label` from the required `alt`.
 *  - Keyboard-dismissable: `Escape` and an explicit close control both fire
 *    `onClose`; a backdrop click also dismisses.
 *  - Focus is trapped while open (Tab/Shift+Tab cycle within the overlay) and
 *    restored to the previously-focused element (the originating thumbnail) on
 *    close.
 *  - Honors `prefers-reduced-motion`: the open transition is suppressed under
 *    `reduce` via a `data-reduced-motion` hook the stylesheet reads.
 *  - SSR-safe: all DOM/focus access lives in effects; the markup renders
 *    server-side without `window`/`document` (it returns `null` when closed).
 */
import { useCallback, useEffect, useRef } from 'react'
import { cx } from '../../cx'
import { useChatClassNames, useChatComponents } from '../context'
import type { LightboxProps } from '../contract'

/** Selector matching the focusable controls the overlay owns (the close button). */
const FOCUSABLE = 'button, [href], [tabindex]:not([tabindex="-1"])'

/**
 * SSR-safe reduced-motion read. Returns `true` only in a DOM that reports the
 * `reduce` preference; absent `matchMedia` (SSR) it yields `false`. Read lazily
 * inside the open effect so there is no module-scope `window` access.
 */
function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/**
 * The accessible enlarged-image overlay. Returns `null` while closed so it adds
 * no DOM (and no portal) until opened — keeping the common case cheap and
 * SSR-safe.
 */
export function Lightbox({ src, alt, open, onClose, className }: LightboxProps) {
  const { icons } = useChatComponents()
  const cn = useChatClassNames()
  const closeRef = useRef<HTMLButtonElement>(null)
  // The element focused before the overlay opened, restored on close. Typed as
  // a focusable element so the cleanup can restore it directly.
  const restoreRef = useRef<HTMLElement | null>(null)

  // Capture the active element, move focus into the overlay, and restore focus
  // on close. Runs only while `open` so a closed overlay neither traps focus nor
  // touches the DOM.
  useEffect(() => {
    if (!open) return
    // Effects run client-side only, so `document` is available here. Restore
    // only a real focusable element (an `HTMLElement` exposing `focus`); the
    // document body — the jsdom/no-focus default — is treated as "nothing to
    // restore" so a contrived restore-to-body never steals focus.
    const previous = document.activeElement
    // Treat the body (the jsdom / no-focus default) as "nothing to restore" so a
    // close never yanks focus to the body; any other element is the originating
    // thumbnail to restore.
    restoreRef.current = previous === document.body ? null : (previous as HTMLElement)
    // Focus the close control so the very first Tab/Shift+Tab cycles inside.
    closeRef.current?.focus()
    return () => {
      // Restore focus to the originating thumbnail when there was one.
      const restore = restoreRef.current
      if (restore) restore.focus()
    }
  }, [open])

  // Lock body scroll while the overlay is open so the page behind the backdrop
  // can't scroll, restoring the previous `overflow` value on close/unmount. The
  // effect runs client-side only, so `document` is available; the cleanup always
  // restores the captured value, so unmounting while open never leaks the lock.
  useEffect(() => {
    if (!open) return
    const { style } = document.body
    const previous = style.overflow
    style.overflow = 'hidden'
    return () => {
      style.overflow = previous
    }
  }, [open])

  // Keyboard handling: Escape closes; Tab/Shift+Tab is trapped within the
  // overlay's focusable controls. `event.currentTarget` is the dialog node the
  // handler is bound to, so it is always present — no null guard needed.
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const root = event.currentTarget
      // The overlay always renders at least the close control, so there is
      // always a focusable element; `first`/`last` are therefore defined.
      const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
      const first = focusable[0] as HTMLElement
      const last = focusable[focusable.length - 1] as HTMLElement
      const activeEl = root.ownerDocument.activeElement
      // Wrap the focus ring at both ends so focus never escapes the overlay.
      if (event.shiftKey) {
        if (activeEl === first || !root.contains(activeEl)) {
          event.preventDefault()
          last.focus()
        }
      } else if (activeEl === last) {
        event.preventDefault()
        first.focus()
      }
    },
    [onClose],
  )

  if (!open) return null

  const CloseIcon = icons.close
  const reduced = prefersReducedMotion()
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss is supplementary; Escape + close button are the primary keyboard paths.
    <div
      className={cx('chat-lightbox', cn.lightbox, className)}
      data-reduced-motion={reduced ? 'true' : undefined}
      // Backdrop click dismisses; clicks on the dialog body are stopped below.
      onClick={onClose}
    >
      <div
        className={cx('chat-lightbox-dialog', cn.lightboxDialog)}
        // biome-ignore lint/a11y/useSemanticElements: a native <dialog> manages its own focus/backdrop, conflicting with this self-contained focus-trap + backdrop-dismiss overlay; an ARIA dialog div is intentional.
        role="dialog"
        aria-modal="true"
        aria-label={alt}
        onKeyDown={onKeyDown}
        // Prevent a click inside the dialog from bubbling to the backdrop dismiss.
        onClick={(event) => event.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          className={cx('chat-lightbox-close', cn.lightboxClose)}
          onClick={onClose}
          aria-label="Close"
        >
          <CloseIcon className={cx('chat-lightbox-close-icon', cn.lightboxCloseIcon)} />
        </button>
        <img className={cx('chat-lightbox-image', cn.lightboxImage)} src={src} alt={alt} />
      </div>
    </div>
  )
}
