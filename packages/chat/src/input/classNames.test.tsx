import type { Attachment } from '@fx/chat-core'
import { referenceProvider } from '@fx/chat-core'
/**
 * Threading tests for the `classNames` injection API across the input layer
 * (`ChatInput` + `CompletionPopup`).
 *
 * Each converted site is asserted to carry BOTH its stable `chat-*` hook AND the
 * injected host class, proving the context value reaches every composer/popup
 * element. With no provider, the bare hooks render unchanged (additive contract).
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import { type RefObject, useImperativeHandle, useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatProvider } from '../registry'
import { ChatInput } from './ChatInput'
import { CompletionPopup, type CompletionPopupHandle, LOADING_DELAY } from './CompletionPopup'
import type { CompletionItem, CompletionProvider } from './completion/types'

describe('ChatInput classNames threading', () => {
  const attachments: Attachment[] = [
    { url: 'https://x/a.png', mediaType: 'image/png', kind: 'image', name: 'a' },
  ]

  it('appends the host class to every composer hook (attachments + actions)', () => {
    const { container } = render(
      <ChatProvider
        classNames={{
          input: 'input-x',
          inputAttachments: 'inatts-x',
          inputAttachment: 'inatt-x',
          inputAttachmentIcon: 'inatti-x',
          inputAttachmentName: 'inattn-x',
          inputAttachmentRemove: 'inattr-x',
          inputAttachmentRemoveIcon: 'inattri-x',
          inputField: 'field-x',
          inputOverlay: 'overlay-x',
          inputMention: 'mention-x',
          inputTextarea: 'ta-x',
          inputFile: 'file-x',
          inputActions: 'actions-x',
          inputAttach: 'attach-x',
          inputSend: 'send-x',
          inputActionIcon: 'icon-x',
        }}
      >
        <ChatInput
          onSend={() => {}}
          onAddFiles={() => {}}
          attachments={attachments}
          onAttachmentsChange={() => {}}
          value="hi @agent"
          onChange={() => {}}
        />
      </ChatProvider>,
    )
    expect(container.querySelector('.chat-input.input-x')).not.toBeNull()
    expect(container.querySelector('.chat-input-attachments.inatts-x')).not.toBeNull()
    expect(container.querySelector('.chat-input-attachment.inatt-x')).not.toBeNull()
    expect(container.querySelector('.chat-input-attachment-icon.inatti-x')).not.toBeNull()
    expect(container.querySelector('.chat-input-attachment-name.inattn-x')).not.toBeNull()
    expect(container.querySelector('.chat-input-attachment-remove.inattr-x')).not.toBeNull()
    expect(container.querySelector('.chat-input-attachment-remove-icon.inattri-x')).not.toBeNull()
    expect(container.querySelector('.chat-input-field.field-x')).not.toBeNull()
    expect(container.querySelector('.chat-input-overlay.overlay-x')).not.toBeNull()
    expect(container.querySelector('.chat-input-mention.mention-x')).not.toBeNull()
    expect(container.querySelector('.chat-input-textarea.ta-x')).not.toBeNull()
    expect(container.querySelector('.chat-input-file.file-x')).not.toBeNull()
    expect(container.querySelector('.chat-input-actions.actions-x')).not.toBeNull()
    expect(container.querySelector('.chat-input-attach.attach-x')).not.toBeNull()
    expect(container.querySelector('.chat-input-send.send-x')).not.toBeNull()
    expect(container.querySelector('.chat-input-action-icon.icon-x')).not.toBeNull()
  })

  it('appends the host class to the stop affordance while streaming', () => {
    const { container } = render(
      <ChatProvider classNames={{ inputStop: 'stop-x', inputActionIcon: 'icon-x' }}>
        <ChatInput onSend={() => {}} onStop={() => {}} isStreaming />
      </ChatProvider>,
    )
    expect(container.querySelector('.chat-input-stop.stop-x')).not.toBeNull()
    expect(container.querySelector('.chat-input-action-icon.icon-x')).not.toBeNull()
  })

  it('renders the bare hook with no extra class when unset (additive-safe)', () => {
    const { container } = render(<ChatInput onSend={() => {}} />)
    expect(container.querySelector('.chat-input')?.className).toBe('chat-input')
  })
})

/** Minimal harness wrapping a textarea + popup so a value/caret can be driven. */
interface HarnessHandle {
  type(value: string, caret: number): void
}

function Harness({
  providers,
  handleRef,
}: {
  providers: CompletionProvider[]
  handleRef: RefObject<HarnessHandle | null>
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const popupRef = useRef<CompletionPopupHandle>(null)
  const [value, setValue] = useState('')

  useImperativeHandle(handleRef, () => ({
    type(next: string, caret: number) {
      act(() => {
        setValue(next)
        const ta = textareaRef.current
        if (ta) {
          ta.value = next
          ta.setSelectionRange(caret, caret)
        }
        popupRef.current?.handleKeyDown({
          key: 'Process',
          keyCode: 0,
          nativeEvent: { isComposing: false } as KeyboardEvent,
          preventDefault: () => {},
          currentTarget: ta,
        } as never)
      })
    },
  }))

  return (
    <div>
      <textarea ref={textareaRef} data-testid="ta" value={value} onChange={() => {}} />
      <CompletionPopup
        ref={popupRef}
        textareaRef={textareaRef}
        value={value}
        onChange={() => {}}
        providers={providers}
      />
    </div>
  )
}

describe('CompletionPopup classNames threading', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('appends the host class to the popup, list, option, icon, label, description', async () => {
    const provider: CompletionProvider = {
      ...referenceProvider,
      items: (): CompletionItem[] => [
        { id: 'i', label: 'apple', description: 'a pome fruit', icon: <i data-testid="ic" /> },
      ],
    }
    const handleRef = { current: null as HarnessHandle | null }
    // The popup portals to document.body, so assert against `document`, not the
    // render container.
    render(
      <ChatProvider
        classNames={{
          completionPopup: 'pop-x',
          completionScroll: 'scroll-x',
          completionList: 'list-x',
          completionOption: 'opt-x',
          completionIcon: 'icon-x',
          completionLabel: 'label-x',
          completionDescription: 'desc-x',
        }}
      >
        <Harness providers={[provider]} handleRef={handleRef} />
      </ChatProvider>,
    )
    handleRef.current?.type('~ap', 3)
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    expect(document.querySelector('.chat-completion-popup.pop-x')).not.toBeNull()
    expect(document.querySelector('.chat-completion-scroll.scroll-x')).not.toBeNull()
    expect(document.querySelector('.chat-completion-list.list-x')).not.toBeNull()
    expect(document.querySelector('.chat-completion-option.opt-x')).not.toBeNull()
    expect(document.querySelector('.chat-completion-icon.icon-x')).not.toBeNull()
    expect(document.querySelector('.chat-completion-label.label-x')).not.toBeNull()
    expect(document.querySelector('.chat-completion-description.desc-x')).not.toBeNull()
  })

  it('appends the host class to the loading + spinner while a request is pending', async () => {
    vi.useFakeTimers()
    // A provider whose items() never resolves keeps the popup in the loading
    // state past LOADING_DELAY so the spinner renders.
    const provider: CompletionProvider = {
      ...referenceProvider,
      items: () => new Promise<CompletionItem[]>(() => {}),
    }
    const handleRef = { current: null as HarnessHandle | null }
    render(
      <ChatProvider classNames={{ completionLoading: 'loading-x', completionSpinner: 'spin-x' }}>
        <Harness providers={[provider]} handleRef={handleRef} />
      </ChatProvider>,
    )
    handleRef.current?.type('~ap', 3)
    act(() => {
      vi.advanceTimersByTime(LOADING_DELAY + 1)
    })
    // The popup portals to document.body; assert against `document`.
    await vi.waitFor(() =>
      expect(document.querySelector('.chat-completion-loading')).not.toBeNull(),
    )
    expect(document.querySelector('.chat-completion-loading.loading-x')).not.toBeNull()
    expect(document.querySelector('.chat-completion-spinner.spin-x')).not.toBeNull()
  })
})
