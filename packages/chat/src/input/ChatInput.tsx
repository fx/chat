/**
 * `ChatInput` — the headless message composer.
 *
 * A keyboard-first, autosizing textarea that supports BOTH controlled
 * (`value` + `onChange`) and uncontrolled (it owns its value) use, emits
 * `onSend(text, attachments?)` on submit, renders a non-interactive mention
 * highlight overlay behind the textarea, deletes whole mention tokens atomically,
 * shows removable attachment chips, and wires a {@link CompletionPopup} whose
 * keydown handler runs BEFORE the composer's own Enter/mention handling.
 *
 * Send gating: submit never fires when the trimmed value is empty AND there are
 * no attachments, when `disabled`, or while `isStreaming` — in which case the
 * send affordance becomes a stop button (when `onStop` is provided).
 *
 * Every visual atom + icon (Button, send/stop/paperclip/close) comes from
 * `useChatComponents()`; nothing here imports a styled primitive or icon set.
 *
 * SSR-safe: DOM measurement (autosize, scroll-sync) lives in effects/handlers.
 */
import {
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { mentionsToSegments } from '../mentions'
import type { Attachment } from '../model'
import { useChatComponents } from '../registry'
import { CompletionPopup, type CompletionPopupHandle } from './CompletionPopup'
import type { CompletionProvider } from './completion/types'

/** Props for {@link ChatInput}. */
export interface ChatInputProps {
  /** Controlled value. Omit for uncontrolled (the composer owns its value). */
  value?: string
  /** Change callback. Required for controlled use; also fired in uncontrolled mode. */
  onChange?: (value: string) => void
  /** Submit callback. Receives the text and any attachments. */
  onSend: (text: string, attachments?: Attachment[]) => void
  /** Stop callback. When `isStreaming`, the send affordance becomes a stop button. */
  onStop?: () => void
  /** Completion providers, in precedence order (first match wins). */
  providers?: CompletionProvider[]
  /** Attachments to surface as removable chips; included in `onSend`. */
  attachments?: Attachment[]
  /** Called when the user removes an attachment chip. */
  onAttachmentsChange?: (next: Attachment[]) => void
  /**
   * Headless attachment hook. Invoked with the `File`s the user supplies via the
   * built-in file-picker button, paste, or drag-and-drop. The host converts each
   * `File` to an {@link Attachment} (the package ships no upload/processing
   * pipeline) and reflects the result back through `attachments`. When omitted,
   * the attach button, paste, and drop are inert.
   */
  onAddFiles?: (files: File[]) => void
  /** `accept` attribute for the built-in file-picker input (e.g. `image/*`). */
  accept?: string
  /** Disables input + submit. */
  disabled?: boolean
  /** Indicates a response is in progress; gates submit and reveals stop. */
  isStreaming?: boolean
  /** Maximum number of visible lines before the textarea scrolls. Default 8. */
  maxLines?: number
  /** Placeholder text. */
  placeholder?: string
  /** Portal target for the completion popup. */
  portalContainer?: HTMLElement
}

/** Default maximum visible lines before the textarea begins to scroll. */
const DEFAULT_MAX_LINES = 8

/**
 * Compute an atomic mention deletion. When the caret is collapsed at a mention
 * boundary and `Backspace`/`Delete` is pressed, the WHOLE `@<id>` token plus a
 * single adjacent space is removed in one keystroke. Returns the new value +
 * caret, or `null` when no atomic deletion applies (the browser handles it).
 *
 * - `Backspace`: applies when the caret sits at the end of a mention token, or
 *   one space past it (so `@alice |` and `@alice|` both delete the token + the
 *   one trailing space).
 * - `Delete`: applies when the caret sits at the start of a mention token (so
 *   `|@alice` forward-deletes the token + a following space).
 */
export function computeAtomicMentionDeletion(
  value: string,
  caret: number,
  direction: 'backspace' | 'delete',
): { value: string; caret: number } | null {
  const segments = mentionsToSegments(value)
  for (const segment of segments) {
    if (typeof segment === 'string') continue
    const [start, end] = segment.mention.range
    if (direction === 'backspace') {
      // Caret right after the token, or after the token + one trailing space.
      const afterSpace = value[end] === ' '
      const boundary = afterSpace ? end + 1 : end
      if (caret === boundary || caret === end) {
        const removeTo = afterSpace ? end + 1 : end
        return { value: value.slice(0, start) + value.slice(removeTo), caret: start }
      }
    } else {
      // Forward delete: caret right at the token start.
      if (caret === start) {
        const afterSpace = value[end] === ' '
        const removeTo = afterSpace ? end + 1 : end
        return { value: value.slice(0, start) + value.slice(removeTo), caret: start }
      }
    }
  }
  return null
}

/** Fallback line height (px) when the computed line-height is unparseable. */
const FALLBACK_LINE_HEIGHT = 20

/**
 * Resize `textarea` to fit its content between one line and `maxLines`, then
 * switch to scrolling. Reads the textarea's own computed line-height/padding so
 * the cap matches the rendered font, and adds vertical borders when the box is
 * `border-box` (where the assigned `height` includes borders but `scrollHeight`
 * does not — omitting them would clip the last line). Exported for direct unit
 * testing (jsdom does not run layout, so the integration path can't exercise
 * every branch).
 */
export function autosize(textarea: HTMLTextAreaElement, maxLines: number): void {
  textarea.style.height = 'auto'
  const view = textarea.ownerDocument.defaultView
  const style = view ? view.getComputedStyle(textarea) : null
  const lineHeight = style
    ? Number.parseFloat(style.lineHeight) || FALLBACK_LINE_HEIGHT
    : FALLBACK_LINE_HEIGHT
  const paddingTop = style ? Number.parseFloat(style.paddingTop) || 0 : 0
  const paddingBottom = style ? Number.parseFloat(style.paddingBottom) || 0 : 0
  // Under `border-box`, the CSS `height` must include borders, but `scrollHeight`
  // (content + padding) does not — so add them to both the cap and the assigned
  // height. Under `content-box` borders are outside `height`, so add nothing.
  const borderBox = style?.boxSizing === 'border-box'
  const borderTop = borderBox && style ? Number.parseFloat(style.borderTopWidth) || 0 : 0
  const borderBottom = borderBox && style ? Number.parseFloat(style.borderBottomWidth) || 0 : 0
  const borders = borderTop + borderBottom
  const maxHeight = lineHeight * maxLines + paddingTop + paddingBottom + borders
  const fullHeight = textarea.scrollHeight + borders
  const next = Math.min(fullHeight, maxHeight)
  textarea.style.height = `${next}px`
  textarea.style.overflowY = fullHeight > maxHeight ? 'auto' : 'hidden'
}

/** Headless, design-system-agnostic chat composer. See module doc. */
export function ChatInput({
  value: controlledValue,
  onChange,
  onSend,
  onStop,
  providers = [],
  attachments,
  onAttachmentsChange,
  onAddFiles,
  accept,
  disabled = false,
  isStreaming = false,
  maxLines = DEFAULT_MAX_LINES,
  placeholder,
  portalContainer,
}: ChatInputProps) {
  const { Button, icons } = useChatComponents()
  const SendIcon = icons.send
  const StopIcon = icons.stop
  const PaperclipIcon = icons.paperclip
  const CloseIcon = icons.close

  const isControlled = controlledValue !== undefined
  const [internalValue, setInternalValue] = useState('')
  const value = isControlled ? controlledValue : internalValue

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const popupRef = useRef<CompletionPopupHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // A caret offset to restore after the next value commit (completion-apply or
  // atomic mention deletion). A controlled re-render would otherwise reset the
  // caret to the end of the textarea, so we re-apply it in a layout effect.
  const pendingCaret = useRef<number | null>(null)

  // Commit a value: update internal state (uncontrolled) and notify the host.
  const commit = useCallback(
    (next: string) => {
      if (!isControlled) setInternalValue(next)
      onChange?.(next)
    },
    [isControlled, onChange],
  )

  // Restore the pending caret after the committed value renders. Keyed on
  // `value` so it runs after each commit; the `void value` read makes that
  // dependency explicit to static analysis.
  useLayoutEffect(() => {
    void value
    if (pendingCaret.current === null) return
    const caret = pendingCaret.current
    pendingCaret.current = null
    const textarea = textareaRef.current
    if (textarea) {
      textarea.focus()
      textarea.setSelectionRange(caret, caret)
    }
  }, [value])

  // Apply a value + caret from the completion popup, then restore the caret.
  const applyCompletion = useCallback(
    (next: string, caret: number) => {
      pendingCaret.current = caret
      commit(next)
    },
    [commit],
  )

  // Autosize: grow from one line to `maxLines`, then scroll. Re-runs on every
  // `value` change (the textarea is controlled, so its scrollHeight follows it).
  useLayoutEffect(() => {
    // Read `value` so the dependency is real to static analysis — the rendered
    // text (and thus `scrollHeight`) is what actually drives the resize.
    void value
    const textarea = textareaRef.current
    if (textarea) autosize(textarea, maxLines)
  }, [value, maxLines])

  // Mention overlay segments, scroll-synced with the textarea.
  const segments = useMemo(() => mentionsToSegments(value), [value])

  const syncScroll = useCallback(() => {
    const textarea = textareaRef.current
    const overlay = overlayRef.current
    if (textarea && overlay) {
      overlay.scrollTop = textarea.scrollTop
      overlay.scrollLeft = textarea.scrollLeft
    }
  }, [])

  const trimmed = value.trim()
  // A non-null view of the attachments for rendering + gating.
  const attachmentList = attachments ?? []
  const hasAttachments = attachmentList.length > 0
  const canSend = (trimmed.length > 0 || hasAttachments) && !disabled && !isStreaming

  const submit = useCallback(() => {
    if (!canSend) return
    onSend(value, hasAttachments ? attachmentList : undefined)
    if (!isControlled) setInternalValue('')
    onChange?.('')
    onAttachmentsChange?.([])
  }, [
    canSend,
    onSend,
    value,
    hasAttachments,
    attachmentList,
    isControlled,
    onChange,
    onAttachmentsChange,
  ])

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      // The popup gets first dibs on every keystroke.
      if (popupRef.current?.handleKeyDown(event)) return

      // IME composition — let the browser compose.
      if (event.nativeEvent.isComposing || event.keyCode === 229) return

      const textarea = event.currentTarget
      const { selectionStart, selectionEnd } = textarea

      // Atomic mention deletion on a collapsed caret at a token boundary.
      if (
        (event.key === 'Backspace' || event.key === 'Delete') &&
        selectionStart === selectionEnd
      ) {
        const direction = event.key === 'Backspace' ? 'backspace' : 'delete'
        const result = computeAtomicMentionDeletion(value, selectionStart, direction)
        if (result) {
          event.preventDefault()
          pendingCaret.current = result.caret
          commit(result.value)
          return
        }
      }

      // Enter submits; Shift+Enter inserts a newline (browser default).
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        submit()
      }
    },
    [value, commit, submit],
  )

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      commit(event.target.value)
    },
    [commit],
  )

  // Remove one attachment by index from a known-present list. Only wired to
  // chips, which render exclusively when `attachments` is non-empty, so the
  // list is passed in rather than re-read (and re-guarded) here.
  const removeAttachment = useCallback(
    (list: Attachment[], index: number) => {
      onAttachmentsChange?.(list.filter((_, i) => i !== index))
    },
    [onAttachmentsChange],
  )

  // Hand any user-supplied files to the host (file-picker, paste, or drop). The
  // package never processes/uploads them — the host converts File → Attachment.
  const emitFiles = useCallback(
    (files: File[]) => {
      if (files.length > 0) onAddFiles?.(files)
    },
    [onAddFiles],
  )

  // Whether the attach affordance + file hooks are active (host opted in).
  const attachEnabled = Boolean(onAddFiles) && !disabled

  const handleFileInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      emitFiles(Array.from(event.target.files ?? []))
      // Reset so selecting the same file again still fires `change`.
      event.target.value = ''
    },
    [emitFiles],
  )

  // Keep the overlay scroll synced after value/size changes. The `void value`
  // read makes the re-sync-on-text-change dependency explicit.
  useEffect(() => {
    void value
    syncScroll()
  }, [syncScroll, value])

  // While streaming, expose a stop button IFF the host gave us an `onStop`.
  const stopHandler = isStreaming && onStop ? onStop : null

  return (
    <div className="chat-input" data-disabled={disabled ? 'true' : undefined}>
      {hasAttachments ? (
        <ul className="chat-input-attachments" aria-label="Attachments">
          {attachmentList.map((attachment, index) => (
            <li key={`${attachment.url}-${index}`} className="chat-input-attachment">
              <PaperclipIcon className="chat-input-attachment-icon" />
              <span className="chat-input-attachment-name">
                {attachment.name ?? attachment.url}
              </span>
              <Button
                className="chat-input-attachment-remove"
                aria-label={`Remove ${attachment.name ?? attachment.url}`}
                onClick={() => removeAttachment(attachmentList, index)}
              >
                <CloseIcon className="chat-input-attachment-remove-icon" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div
        className="chat-input-field"
        // Drag-and-drop hook: hand dropped files to the host (no processing).
        onDrop={
          attachEnabled
            ? (event) => {
                const files = Array.from(event.dataTransfer.files)
                if (files.length > 0) {
                  event.preventDefault()
                  emitFiles(files)
                }
              }
            : undefined
        }
        onDragOver={attachEnabled ? (event) => event.preventDefault() : undefined}
      >
        <div ref={overlayRef} className="chat-input-overlay" aria-hidden="true">
          {segments.map((segment, index) =>
            typeof segment === 'string' ? (
              // Literal runs can repeat (e.g. `@a x @b x`), so the index keeps
              // keys unique; segments are positional and never reordered.
              // biome-ignore lint/suspicious/noArrayIndexKey: positional, non-reordering list
              <span key={`text-${index}`}>{segment}</span>
            ) : (
              <span key={segment.key} className="chat-input-mention">
                {segment.mention.text}
              </span>
            ),
          )}
          {/* Trailing newline needs a placeholder so overlay height matches. */}
          {value.endsWith('\n') ? <span>{'​'}</span> : null}
        </div>
        <textarea
          ref={textareaRef}
          className="chat-input-textarea"
          value={value}
          rows={1}
          placeholder={placeholder}
          disabled={disabled}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onScroll={syncScroll}
          // Selection-only caret moves (clicks, arrow keys that don't edit) must
          // re-sync the popup so it closes when the caret leaves an active token.
          onSelect={() => popupRef.current?.syncCaret()}
          // Paste hook: surface any pasted files to the host (text paste is left
          // to the browser's default insertion).
          onPaste={
            attachEnabled
              ? (event) => {
                  const files = Array.from(event.clipboardData.files)
                  if (files.length > 0) {
                    event.preventDefault()
                    emitFiles(files)
                  }
                }
              : undefined
          }
        />
      </div>

      {onAddFiles ? (
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="chat-input-file"
          // Visually hidden but kept in the a11y tree for the picker affordance.
          style={{ display: 'none' }}
          {...(accept ? { accept } : {})}
          onChange={handleFileInput}
        />
      ) : null}

      <div className="chat-input-actions">
        {onAddFiles ? (
          <Button
            className="chat-input-attach"
            aria-label="Attach file"
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
          >
            <PaperclipIcon className="chat-input-action-icon" />
          </Button>
        ) : null}
        {stopHandler ? (
          <Button className="chat-input-stop" aria-label="Stop" onClick={stopHandler}>
            <StopIcon className="chat-input-action-icon" />
          </Button>
        ) : (
          <Button
            className="chat-input-send"
            aria-label="Send"
            disabled={!canSend}
            onClick={submit}
          >
            <SendIcon className="chat-input-action-icon" />
          </Button>
        )}
      </div>

      <CompletionPopup
        ref={popupRef}
        textareaRef={textareaRef}
        value={value}
        onChange={applyCompletion}
        providers={providers}
        {...(portalContainer ? { portalContainer } : {})}
      />
    </div>
  )
}
