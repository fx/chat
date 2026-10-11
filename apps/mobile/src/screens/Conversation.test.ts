import { describe, expect, it } from 'vitest'
import { footerStyle, selectionAfterTap } from './Conversation'

function transcript() {
  const log = document.createElement('div')
  log.innerHTML = `
    <div class="chat-message" data-role="assistant" data-message-id="a1">
      <p>first</p><button>tile</button><div class="chat-footer"><button>copy</button></div>
    </div>
    <div class="chat-message" data-role="user" data-message-id="u1"><p>question</p></div>
    <div class="chat-message" data-role="assistant" data-message-id="a2"><p>second</p></div>
    <p class="empty">blank space</p>`
  const at = (selector: string) => log.querySelector(selector) as Element
  const tap = (selector: string, current?: string) =>
    selectionAfterTap({ target: at(selector), currentTarget: log }, current)
  return { tap }
}

describe('selectionAfterTap', () => {
  it('selects the tapped assistant message, and moves to another', () => {
    const { tap } = transcript()
    expect(tap('[data-message-id=a1] p')).toBe('a1')
    expect(tap('[data-message-id=a2] p', 'a1')).toBe('a2')
  })

  it('deselects on a second tap of its text, but not of a control in it', () => {
    const { tap } = transcript()
    expect(tap('[data-message-id=a1] p', 'a1')).toBeUndefined()
    expect(tap('[data-message-id=a1] > button', 'a1')).toBe('a1')
  })

  it('keeps the selection for taps on a footer or from outside the transcript', () => {
    const { tap } = transcript()
    expect(tap('.chat-footer button', 'a1')).toBe('a1')
    const portal = document.createElement('div')
    expect(
      selectionAfterTap({ target: portal, currentTarget: document.createElement('div') }, 'a1'),
    ).toBe('a1')
  })

  it('clears the selection for a user message or blank space', () => {
    const { tap } = transcript()
    expect(tap('[data-message-id=u1] p', 'a1')).toBeUndefined()
    expect(tap('.empty', 'a1')).toBeUndefined()
  })
})

describe('footerStyle', () => {
  it('hides every footer but the selected message’s', () => {
    expect(footerStyle(undefined)).toBe(
      '.conversation-log .chat-message .chat-footer { display: none; }',
    )
    expect(footerStyle('a"1')).toBe(
      '.conversation-log .chat-message:not([data-message-id="a\\"1"]) .chat-footer { display: none; }',
    )
  })
})
