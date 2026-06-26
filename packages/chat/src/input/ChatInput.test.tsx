/**
 * `ChatInput` composer tests.
 *
 * Covers both controlled and uncontrolled modes, Enter-vs-Shift+Enter, send
 * gating (empty / disabled / streaming) and the stop affordance, autosize,
 * attachment chips (render, removal, inclusion in `onSend`), the mention overlay
 * (segments + trailing-newline placeholder), atomic mention deletion in both
 * directions, the IME guard, and that the completion popup's `handleKeyDown`
 * runs BEFORE the composer's own Enter/mention handling.
 *
 * Uses `@testing-library/user-event` for realistic typing/keyboard sequences.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Attachment } from '../model'
import { ChatInput, autosize, computeAtomicMentionDeletion } from './ChatInput'
import { referenceProvider } from './completion/reference'
import type { CompletionProvider } from './completion/types'

const attachment = (name: string): Attachment => ({
  url: `blob:${name}`,
  mediaType: 'image/png',
  kind: 'image',
  name,
})

describe('ChatInput uncontrolled mode', () => {
  it('owns its value and clears after send', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)
    const textarea = screen.getByRole('textbox')
    await user.type(textarea, 'hello')
    await user.keyboard('{Enter}')
    expect(onSend).toHaveBeenCalledWith('hello', undefined)
    expect((textarea as HTMLTextAreaElement).value).toBe('')
  })

  it('fires onChange in uncontrolled mode while typing', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ChatInput onSend={vi.fn()} onChange={onChange} />)
    await user.type(screen.getByRole('textbox'), 'hi')
    expect(onChange).toHaveBeenLastCalledWith('hi')
  })
})

describe('ChatInput controlled mode', () => {
  it('reflects the value prop and does not self-clear', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    const onChange = vi.fn()
    render(<ChatInput value="fixed" onChange={onChange} onSend={onSend} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toBe('fixed')
    await user.click(textarea)
    await user.keyboard('{Enter}')
    expect(onSend).toHaveBeenCalledWith('fixed', undefined)
    // Controlled: the composer asks the host to clear via onChange('').
    expect(onChange).toHaveBeenCalledWith('')
    // The DOM value is still driven by the (unchanged) prop.
    expect(textarea.value).toBe('fixed')
  })

  it('calls onChange when the user types in controlled mode', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ChatInput value="" onChange={onChange} onSend={vi.fn()} />)
    await user.type(screen.getByRole('textbox'), 'x')
    expect(onChange).toHaveBeenCalledWith('x')
  })
})

describe('ChatInput Enter vs Shift+Enter', () => {
  it('Enter submits, Shift+Enter inserts a newline', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    await user.type(textarea, 'a')
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(onSend).not.toHaveBeenCalled()
    expect(textarea.value).toBe('a\n')
    await user.type(textarea, 'b')
    await user.keyboard('{Enter}')
    expect(onSend).toHaveBeenCalledWith('a\nb', undefined)
  })
})

describe('ChatInput send gating', () => {
  it('does not send when trimmed-empty with no attachments', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)
    const textarea = screen.getByRole('textbox')
    await user.type(textarea, '   ')
    await user.keyboard('{Enter}')
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Send')).toBeDisabled()
  })

  it('does not send when disabled', async () => {
    const onSend = vi.fn()
    render(<ChatInput value="hi" onChange={vi.fn()} onSend={onSend} disabled />)
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it('does not send while streaming and shows a stop button when onStop given', async () => {
    const onSend = vi.fn()
    const onStop = vi.fn()
    render(<ChatInput value="hi" onChange={vi.fn()} onSend={onSend} isStreaming onStop={onStop} />)
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
    const stop = screen.getByLabelText('Stop')
    fireEvent.click(stop)
    expect(onStop).toHaveBeenCalledTimes(1)
    expect(screen.queryByLabelText('Send')).toBeNull()
  })

  it('keeps the send button (not stop) while streaming without onStop', () => {
    render(<ChatInput value="hi" onChange={vi.fn()} onSend={vi.fn()} isStreaming />)
    expect(screen.queryByLabelText('Stop')).toBeNull()
    expect(screen.getByLabelText('Send')).toBeDisabled()
  })

  it('sends via the send button click', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(<ChatInput onSend={onSend} />)
    await user.type(screen.getByRole('textbox'), 'hi')
    await user.click(screen.getByLabelText('Send'))
    expect(onSend).toHaveBeenCalledWith('hi', undefined)
  })

  it('can send with only attachments and no text', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(
      <ChatInput
        onSend={onSend}
        attachments={[attachment('a.png')]}
        onAttachmentsChange={vi.fn()}
      />,
    )
    await user.click(screen.getByLabelText('Send'))
    expect(onSend).toHaveBeenCalledWith('', [attachment('a.png')])
  })
})

describe('ChatInput autosize (integration)', () => {
  it('sets an explicit pixel height and hides overflow within maxLines', async () => {
    const user = userEvent.setup()
    render(<ChatInput onSend={vi.fn()} maxLines={3} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    await user.type(textarea, 'line')
    expect(textarea.style.height).toMatch(/px$/)
    expect(textarea.style.overflowY).toBe('hidden')
  })
})

describe('autosize (unit)', () => {
  function withTextarea(scrollHeight: number, lineHeight: string | null, padding = '4px') {
    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    Object.defineProperty(textarea, 'scrollHeight', {
      value: scrollHeight,
      configurable: true,
    })
    if (lineHeight !== null) {
      const real = window.getComputedStyle.bind(window)
      vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
        if (el === textarea) {
          return new Proxy(real(textarea), {
            get(target, prop) {
              if (prop === 'lineHeight') return lineHeight
              if (prop === 'paddingTop') return padding
              if (prop === 'paddingBottom') return padding
              return Reflect.get(target, prop)
            },
          }) as CSSStyleDeclaration
        }
        return real(el)
      })
    }
    return textarea
  }

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('caps the height and enables scrolling past maxLines', () => {
    // 1 line of 20px + 8px padding = 28px cap; scrollHeight 200 exceeds it.
    const textarea = withTextarea(200, '20px')
    autosize(textarea, 1)
    expect(textarea.style.height).toBe('28px')
    expect(textarea.style.overflowY).toBe('auto')
  })

  it('grows to fit content under the cap and hides overflow', () => {
    const textarea = withTextarea(50, '20px')
    autosize(textarea, 10)
    expect(textarea.style.height).toBe('50px')
    expect(textarea.style.overflowY).toBe('hidden')
  })

  it('falls back to a default line height when line-height is unparseable', () => {
    const textarea = withTextarea(1000, 'normal')
    autosize(textarea, 2)
    // 2 * 20 (fallback) + 8 padding = 48px cap.
    expect(textarea.style.height).toBe('48px')
  })

  it('treats unparseable padding as zero', () => {
    const textarea = withTextarea(1000, '20px', 'auto')
    autosize(textarea, 1)
    // 1 * 20 line height + 0 padding (auto → NaN → 0) = 20px cap.
    expect(textarea.style.height).toBe('20px')
  })

  it('treats a detached defaultView as no style (all fallbacks)', () => {
    // A document created via createHTMLDocument has `defaultView === null`
    // naturally, so `autosize` takes its no-style path without mutating the
    // shared global document (which would break other tests' window lookup).
    const detached = document.implementation.createHTMLDocument('t')
    const textarea = detached.createElement('textarea')
    detached.body.appendChild(textarea)
    Object.defineProperty(textarea, 'scrollHeight', { value: 1000, configurable: true })
    expect(textarea.ownerDocument.defaultView).toBeNull()
    autosize(textarea, 1)
    // 1 * 20 fallback + 0 padding = 20px cap.
    expect(textarea.style.height).toBe('20px')
    expect(textarea.style.overflowY).toBe('auto')
  })
})

describe('ChatInput attachments', () => {
  it('renders removable chips and removes on click', async () => {
    const user = userEvent.setup()
    const onAttachmentsChange = vi.fn()
    render(
      <ChatInput
        onSend={vi.fn()}
        attachments={[attachment('a.png'), attachment('b.png')]}
        onAttachmentsChange={onAttachmentsChange}
      />,
    )
    expect(screen.getByText('a.png')).toBeInTheDocument()
    await user.click(screen.getByLabelText('Remove a.png'))
    expect(onAttachmentsChange).toHaveBeenCalledWith([attachment('b.png')])
  })

  it('includes attachments in the onSend payload', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(
      <ChatInput
        onSend={onSend}
        attachments={[attachment('a.png')]}
        onAttachmentsChange={vi.fn()}
      />,
    )
    await user.type(screen.getByRole('textbox'), 'caption')
    await user.keyboard('{Enter}')
    expect(onSend).toHaveBeenCalledWith('caption', [attachment('a.png')])
  })

  it('falls back to the url when an attachment has no name', () => {
    const noName: Attachment = { url: 'blob:x', mediaType: 'image/png', kind: 'image' }
    render(<ChatInput onSend={vi.fn()} attachments={[noName]} onAttachmentsChange={vi.fn()} />)
    expect(screen.getByText('blob:x')).toBeInTheDocument()
    expect(screen.getByLabelText('Remove blob:x')).toBeInTheDocument()
  })

  it('renders no attachment list when there are none', () => {
    render(<ChatInput onSend={vi.fn()} />)
    expect(screen.queryByLabelText('Attachments')).toBeNull()
  })

  it('the attach button is inert (host wires the picker)', async () => {
    const user = userEvent.setup()
    render(<ChatInput onSend={vi.fn()} />)
    // Clicking the paperclip must not throw; it is a host hook point.
    await user.click(screen.getByLabelText('Attach file'))
    expect(screen.getByLabelText('Attach file')).toBeInTheDocument()
  })

  it('removeAttachment is a no-op when attachments is undefined', () => {
    // No attachments prop → no chips and nothing to remove; covered for safety.
    render(<ChatInput onSend={vi.fn()} onAttachmentsChange={vi.fn()} />)
    expect(screen.queryByLabelText('Attachments')).toBeNull()
  })
})

describe('ChatInput mention overlay', () => {
  it('renders repeated literal runs without duplicate React keys', () => {
    // `@a x @b x` yields two identical ` x ` literal runs; indexed keys keep
    // them unique. A duplicate-key warning would fail this test.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { container } = render(
      <ChatInput value="@a x @b x" onChange={vi.fn()} onSend={vi.fn()} />,
    )
    const overlay = container.querySelector('.chat-input-overlay') as HTMLElement
    expect(overlay.querySelectorAll('.chat-input-mention').length).toBe(2)
    expect(errorSpy.mock.calls.some((args) => String(args[0]).includes('same key'))).toBe(false)
    errorSpy.mockRestore()
  })

  it('renders mention segments in the aria-hidden overlay', () => {
    render(<ChatInput value="hi @alice there" onChange={vi.fn()} onSend={vi.fn()} />)
    const mention = screen.getByText('@alice')
    expect(mention).toHaveClass('chat-input-mention')
    expect(mention.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('adds a trailing-newline placeholder so overlay height matches', () => {
    const { container } = render(<ChatInput value={'line\n'} onChange={vi.fn()} onSend={vi.fn()} />)
    const overlay = container.querySelector('.chat-input-overlay') as HTMLElement
    // The placeholder zero-width span follows the text segment.
    expect(overlay.querySelectorAll('span').length).toBeGreaterThanOrEqual(2)
  })

  it('syncs the overlay scroll position to the textarea on scroll', () => {
    const { container } = render(<ChatInput value="x" onChange={vi.fn()} onSend={vi.fn()} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    const overlay = container.querySelector('.chat-input-overlay') as HTMLElement
    Object.defineProperty(textarea, 'scrollTop', { value: 25, configurable: true })
    Object.defineProperty(textarea, 'scrollLeft', { value: 5, configurable: true })
    fireEvent.scroll(textarea)
    expect(overlay.scrollTop).toBe(25)
    expect(overlay.scrollLeft).toBe(5)
  })
})

describe('computeAtomicMentionDeletion', () => {
  it('backspace at the end of a mention + trailing space removes the whole token', () => {
    // 'hello @alice ' caret after the trailing space (index 13).
    const result = computeAtomicMentionDeletion('hello @alice ', 13, 'backspace')
    expect(result).toEqual({ value: 'hello ', caret: 6 })
  })

  it('backspace immediately after the token (no trailing space) removes the token', () => {
    const result = computeAtomicMentionDeletion('hi @bob', 7, 'backspace')
    expect(result).toEqual({ value: 'hi ', caret: 3 })
  })

  it('forward delete at the token start removes the token + a following space', () => {
    const result = computeAtomicMentionDeletion('@alice rest', 0, 'delete')
    expect(result).toEqual({ value: 'rest', caret: 0 })
  })

  it('forward delete at the token start with no trailing space', () => {
    const result = computeAtomicMentionDeletion('@bob', 0, 'delete')
    expect(result).toEqual({ value: '', caret: 0 })
  })

  it('returns null when the caret is not at a mention boundary', () => {
    expect(computeAtomicMentionDeletion('hello @alice ', 2, 'backspace')).toBeNull()
  })

  it('returns null when there are no mentions', () => {
    expect(computeAtomicMentionDeletion('plain text', 5, 'backspace')).toBeNull()
  })

  it('returns null for forward delete when caret is not at a token start', () => {
    expect(computeAtomicMentionDeletion('@alice rest', 3, 'delete')).toBeNull()
  })
})

describe('ChatInput atomic mention deletion (integration)', () => {
  it('Backspace at a mention boundary removes the whole token in one press', () => {
    const onChange = vi.fn()
    function Stateful() {
      const [value, setValue] = useState('hello @alice ')
      return (
        <ChatInput
          value={value}
          onChange={(v) => {
            setValue(v)
            onChange(v)
          }}
          onSend={vi.fn()}
        />
      )
    }
    render(<Stateful />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    textarea.setSelectionRange(13, 13)
    fireEvent.keyDown(textarea, { key: 'Backspace' })
    expect(onChange).toHaveBeenCalledWith('hello ')
    expect(textarea.value).toBe('hello ')
  })

  it('forward Delete at a mention start removes the whole token in one press', () => {
    const onChange = vi.fn()
    function Stateful() {
      const [value, setValue] = useState('@alice rest')
      return (
        <ChatInput
          value={value}
          onChange={(v) => {
            setValue(v)
            onChange(v)
          }}
          onSend={vi.fn()}
        />
      )
    }
    render(<Stateful />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    textarea.setSelectionRange(0, 0)
    fireEvent.keyDown(textarea, { key: 'Delete' })
    expect(onChange).toHaveBeenCalledWith('rest')
    expect(textarea.value).toBe('rest')
  })

  it('falls through to default deletion when not at a boundary', () => {
    const onChange = vi.fn()
    render(<ChatInput value="hello @alice " onChange={onChange} onSend={vi.fn()} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    textarea.setSelectionRange(2, 2)
    fireEvent.keyDown(textarea, { key: 'Backspace' })
    // No atomic handling → onChange not called by us (browser handles default).
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not atomically delete when there is a selection range', () => {
    const onChange = vi.fn()
    render(<ChatInput value="hello @alice " onChange={onChange} onSend={vi.fn()} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    textarea.setSelectionRange(0, 13)
    fireEvent.keyDown(textarea, { key: 'Backspace' })
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('ChatInput IME guard', () => {
  it('does not submit while composing', () => {
    const onSend = vi.fn()
    render(<ChatInput value="hi" onChange={vi.fn()} onSend={onSend} />)
    const textarea = screen.getByRole('textbox')
    fireEvent.keyDown(textarea, { key: 'Enter', isComposing: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('does not submit for the keyCode 229 IME sentinel', () => {
    const onSend = vi.fn()
    render(<ChatInput value="hi" onChange={vi.fn()} onSend={onSend} />)
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', keyCode: 229 })
    expect(onSend).not.toHaveBeenCalled()
  })
})

describe('ChatInput completion wiring', () => {
  it('runs the popup handleKeyDown before composer Enter handling', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    const onChange = vi.fn()
    function Wrapper() {
      return <ChatInput onChange={onChange} onSend={onSend} providers={[referenceProvider]} />
    }
    render(<Wrapper />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    await user.type(textarea, '~ap')
    // Popup should be open now.
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    // Enter is consumed by the popup (apply), NOT by the composer (submit).
    await user.keyboard('{Enter}')
    expect(onSend).not.toHaveBeenCalled()
    // The popup applied the item via onChange.
    expect(onChange).toHaveBeenLastCalledWith('~apple ')
  })

  it('does not submit while the completion popup is loading (Enter is consumed)', async () => {
    vi.useFakeTimers()
    try {
      const onSend = vi.fn()
      const slow: CompletionProvider = {
        id: 'slow',
        trigger: '~',
        match: referenceProvider.match,
        items: () => new Promise<never[]>(() => {}), // never resolves
        apply: referenceProvider.apply,
      }
      render(<ChatInput onSend={onSend} providers={[slow]} />)
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      // Type a trigger token; the provider's items() hangs (loading).
      fireEvent.change(textarea, { target: { value: '~a' } })
      textarea.setSelectionRange(2, 2)
      fireEvent.select(textarea)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(160) // past LOADING_DELAY
      })
      expect(screen.getByTestId('chat-completion-loading')).toBeInTheDocument()
      // Enter is consumed by the loading popup — the composer must NOT submit.
      fireEvent.keyDown(textarea, { key: 'Enter' })
      expect(onSend).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not submit while a completion request is pending before the loading delay', async () => {
    vi.useFakeTimers()
    try {
      const onSend = vi.fn()
      const slow: CompletionProvider = {
        id: 'slow-pending',
        trigger: '~',
        match: referenceProvider.match,
        items: () => new Promise<never[]>(() => {}), // hangs — request stays pending
        apply: referenceProvider.apply,
      }
      render(<ChatInput onSend={onSend} providers={[slow]} />)
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
      fireEvent.change(textarea, { target: { value: '~a' } })
      textarea.setSelectionRange(2, 2)
      await act(async () => {
        fireEvent.select(textarea)
      })
      // BEFORE the loading delay: no spinner yet, but the request is pending so
      // the popup is key-active and Enter must not fall through to submit.
      expect(screen.queryByTestId('chat-completion-loading')).toBeNull()
      fireEvent.keyDown(textarea, { key: 'Enter' })
      expect(onSend).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('closes the popup when a selection-only caret move leaves the token', async () => {
    const user = userEvent.setup()
    render(<ChatInput onSend={vi.fn()} providers={[referenceProvider]} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    await user.type(textarea, '~ap done')
    // Caret is now at the end (past the token); type back into the token first.
    textarea.setSelectionRange(3, 3)
    fireEvent.select(textarea)
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    // Move the caret out of the token via a selection-only change (e.g. a click).
    textarea.setSelectionRange(8, 8)
    fireEvent.select(textarea)
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  })

  it('forwards a custom portalContainer to the popup', async () => {
    const user = userEvent.setup()
    const container = document.createElement('div')
    container.id = 'ci-portal'
    document.body.appendChild(container)
    render(
      <ChatInput onSend={vi.fn()} providers={[referenceProvider]} portalContainer={container} />,
    )
    await user.type(screen.getByRole('textbox'), '~ap')
    await waitFor(() => expect(container.querySelector('[role="listbox"]')).not.toBeNull())
    document.body.removeChild(container)
  })

  it('places the caret after applying a completion', async () => {
    const user = userEvent.setup()
    render(<ChatInput onSend={vi.fn()} providers={[referenceProvider]} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    await user.type(textarea, '~ap')
    await waitFor(() => expect(screen.getByRole('listbox')).toBeInTheDocument())
    await user.keyboard('{Enter}')
    await waitFor(() => expect(textarea.value).toBe('~apple '))
    await waitFor(() => expect(textarea.selectionStart).toBe('~apple '.length))
  })
})
