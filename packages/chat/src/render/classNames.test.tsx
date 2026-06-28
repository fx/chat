/**
 * Threading tests for the headless `classNames` injection API (STAGE A).
 *
 * Mount the render layer through `<ChatProvider classNames={…}>` with a host
 * class per stable `chat-*` hook, then assert each converted element carries
 * BOTH its stable hook AND the injected host class — proving every
 * `cx('chat-x', cn.x)` site threads the context value through. The stable hook
 * is asserted alongside the host class so the additive contract (stable class
 * stays first, host class appended) is locked in.
 */
import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '../model'
import { ChatProvider } from '../registry'
import type { ChatClassNames } from '../registry'
import { MessageLog } from './MessageLog'
import { stubMatchMedia } from './test-helpers'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1000)
  stubMatchMedia(false)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/**
 * A host class per `ChatClassNames` key (`<key>-x`). Used to assert each
 * converted site appends exactly its own injected class next to the stable hook.
 */
const CN: Required<ChatClassNames> = Object.fromEntries(
  (
    [
      'log',
      'message',
      'messageBlocks',
      'gutterRow',
      'gutterTime',
      'gutterContent',
      'row',
      'rowError',
      'rowHeader',
      'rowAffordance',
      'rowAffordanceIcon',
      'rowIcon',
      'rowLabel',
      'rowErrorMarker',
      'rowTimer',
      'rowTps',
      'group',
      'groupBody',
      'groupSummary',
      'groupSummaryLabel',
      'groupMore',
      'text',
      'textUser',
      'textAssistant',
      'textPlain',
      'mention',
      'toolBody',
      'toolSection',
      'toolSectionLabel',
      'toolMedia',
      'toolMediaImage',
      'toolMediaAudio',
      'reasoningBody',
      'systemBody',
      'rawJson',
      'inertBlock',
      'timelineItem',
      'footer',
      'footerMetrics',
      'footerLabel',
      'footerCopy',
      'footerRegenerate',
      'footerFork',
      'footerReset',
      'footerReveal',
      'footerIcon',
      'attachments',
      'attachmentGrid',
      'attachmentGridItem',
      'attachmentThumb',
      'attachmentThumbImage',
      'attachmentThumbExpand',
      'attachmentChips',
      'attachmentChip',
      'attachmentChipIcon',
      'attachmentChipName',
      'attachmentChipDownload',
      'md',
      'mdP',
      'mdPre',
      'mdLink',
      'mdCodeInline',
      'input',
      'inputAttachments',
      'inputAttachment',
      'inputAttachmentIcon',
      'inputAttachmentName',
      'inputAttachmentRemove',
      'inputAttachmentRemoveIcon',
      'inputField',
      'inputOverlay',
      'inputMention',
      'inputTextarea',
      'inputFile',
      'inputActions',
      'inputAttach',
      'inputSend',
      'inputStop',
      'inputActionIcon',
      'completionPopup',
      'completionScroll',
      'completionList',
      'completionOption',
      'completionIcon',
      'completionLabel',
      'completionDescription',
      'completionLoading',
      'completionSpinner',
      'lightbox',
      'lightboxDialog',
      'lightboxClose',
      'lightboxCloseIcon',
      'lightboxImage',
    ] as const
  ).map((k) => [k, `${k}-x`]),
) as Required<ChatClassNames>

/** Assert at least one element matching `.chat-hook` ALSO carries `.hostClass`. */
function expectHooked(container: HTMLElement, hook: string, hostClass: string) {
  const el = container.querySelector(`.${hook}.${hostClass}`)
  expect(el, `expected an element with both "${hook}" and "${hostClass}"`).not.toBeNull()
}

describe('classNames threading — render layer', () => {
  it('appends the host class beside every converted hook across the log', () => {
    const assistant: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      createdAt: 1000,
      metrics: { model: 'demo', durationMs: 1200, tokensPerSecond: 42 },
      blocks: [
        // Assistant prose → Markdown path (chat-text + textAssistant).
        { type: 'text', id: 't1', text: 'Hello `code` and [link](https://example.com)' },
        // A tool_call with media + result (chat-tool-* + media image/audio).
        {
          type: 'tool_call',
          id: 'tc1',
          name: 'search',
          arguments: { q: 'x' },
          result: { ok: true },
          status: 'error',
          startedAt: 1000,
          durationMs: 500,
          media: [
            { kind: 'image', url: 'https://example.com/i.png' },
            { kind: 'audio', url: 'https://example.com/a.mp3' },
          ],
        },
        // A RUNNING tool drives the active affordance spinner (chat-row-affordance*).
        {
          type: 'tool_call',
          id: 'tc2',
          name: 'fetch',
          arguments: {},
          status: 'running',
          startedAt: 1000,
        },
        // Reasoning (chat-reasoning-body) — grouped with the tools above.
        { type: 'reasoning', id: 'r1', text: 'thinking', durationMs: 300 },
        // System (chat-system-body) — also auxiliary, grows the group to (+N).
        { type: 'system', id: 's1', text: 'system prompt' },
      ],
    }
    const user: ChatMessage = {
      id: 'u1',
      role: 'user',
      createdAt: 1000,
      blocks: [{ type: 'text', id: 'ut', text: 'Ask @agent something' }],
      attachments: [
        { url: 'https://example.com/p.png', mediaType: 'image/png', kind: 'image', name: 'pic' },
        {
          url: 'https://example.com/f.pdf',
          mediaType: 'application/pdf',
          kind: 'file',
          name: 'doc',
        },
      ],
    }

    // A standalone, actively-streaming status row: drives the timer + tps pills
    // (chat-row-timer / chat-row-tps) as a bare row, plus the spinner affordance.
    const status: ChatMessage = {
      id: 'st1',
      role: 'assistant',
      createdAt: 1000,
      metrics: { tokensPerSecond: 30 },
      blocks: [{ type: 'status', id: 'sb', phase: 'streaming' }],
    }

    const { container } = render(
      <ChatProvider classNames={CN}>
        <MessageLog
          messages={[assistant, status, user]}
          isStreaming
          streamingMessageId="st1"
          defaultOpen
          compactFooter
          timestampGutter
          onRegenerate={() => {}}
          onFork={() => {}}
          onReset={() => {}}
        />
      </ChatProvider>,
    )

    // Log + message shell.
    expectHooked(container, 'chat-log', CN.log)
    expectHooked(container, 'chat-message', CN.message)
    expectHooked(container, 'chat-message-blocks', CN.messageBlocks)
    // Timestamp gutter.
    expectHooked(container, 'chat-gutter-row', CN.gutterRow)
    expectHooked(container, 'chat-gutter-time', CN.gutterTime)
    expectHooked(container, 'chat-gutter-content', CN.gutterContent)
    // Collapsible row chrome (error tool row drives row/rowError + marker).
    expectHooked(container, 'chat-row', CN.row)
    expectHooked(container, 'chat-row-error', CN.rowError)
    expectHooked(container, 'chat-row-header', CN.rowHeader)
    expectHooked(container, 'chat-row-affordance', CN.rowAffordance)
    expectHooked(container, 'chat-row-affordance-icon', CN.rowAffordanceIcon)
    expectHooked(container, 'chat-row-icon', CN.rowIcon)
    expectHooked(container, 'chat-row-label', CN.rowLabel)
    expectHooked(container, 'chat-row-error-marker', CN.rowErrorMarker)
    expectHooked(container, 'chat-row-timer', CN.rowTimer)
    expectHooked(container, 'chat-row-tps', CN.rowTps)
    // Group.
    expectHooked(container, 'chat-group', CN.group)
    expectHooked(container, 'chat-group-body', CN.groupBody)
    expectHooked(container, 'chat-group-summary', CN.groupSummary)
    expectHooked(container, 'chat-group-summary-label', CN.groupSummaryLabel)
    expectHooked(container, 'chat-group-more', CN.groupMore)
    // Text (assistant role branch) + markdown atoms.
    expectHooked(container, 'chat-text', CN.text)
    expectHooked(container, 'chat-text', CN.textAssistant)
    expectHooked(container, 'chat-md', CN.md)
    expectHooked(container, 'chat-md-p', CN.mdP)
    expectHooked(container, 'chat-md-link', CN.mdLink)
    expectHooked(container, 'chat-md-code-inline', CN.mdCodeInline)
    // Tool body.
    expectHooked(container, 'chat-tool-body', CN.toolBody)
    expectHooked(container, 'chat-tool-section', CN.toolSection)
    expectHooked(container, 'chat-tool-section-label', CN.toolSectionLabel)
    expectHooked(container, 'chat-tool-media', CN.toolMedia)
    expectHooked(container, 'chat-tool-media-image', CN.toolMediaImage)
    expectHooked(container, 'chat-tool-media-audio', CN.toolMediaAudio)
    // Reasoning + system bodies.
    expectHooked(container, 'chat-reasoning-body', CN.reasoningBody)
    expectHooked(container, 'chat-system-body', CN.systemBody)
    // Footer.
    expectHooked(container, 'chat-footer', CN.footer)
    expectHooked(container, 'chat-footer-reveal', CN.footerReveal)
    expectHooked(container, 'chat-footer-copy', CN.footerCopy)
    expectHooked(container, 'chat-footer-regenerate', CN.footerRegenerate)
    expectHooked(container, 'chat-footer-fork', CN.footerFork)
    expectHooked(container, 'chat-footer-reset', CN.footerReset)
    expectHooked(container, 'chat-footer-icon', CN.footerIcon)
    // User text (plain + mention) covers the textUser role branch.
    expectHooked(container, 'chat-text', CN.textUser)
    expectHooked(container, 'chat-text-plain', CN.textPlain)
    expectHooked(container, 'chat-mention', CN.mention)
    // Attachments.
    expectHooked(container, 'chat-attachments', CN.attachments)
    expectHooked(container, 'chat-attachment-grid', CN.attachmentGrid)
    expectHooked(container, 'chat-attachment-grid-item', CN.attachmentGridItem)
    expectHooked(container, 'chat-attachment-thumb', CN.attachmentThumb)
    expectHooked(container, 'chat-attachment-thumb-image', CN.attachmentThumbImage)
    expectHooked(container, 'chat-attachment-thumb-expand', CN.attachmentThumbExpand)
    expectHooked(container, 'chat-attachment-chips', CN.attachmentChips)
    expectHooked(container, 'chat-attachment-chip', CN.attachmentChip)
    expectHooked(container, 'chat-attachment-chip-icon', CN.attachmentChipIcon)
    expectHooked(container, 'chat-attachment-chip-name', CN.attachmentChipName)
    expectHooked(container, 'chat-attachment-chip-download', CN.attachmentChipDownload)
  })

  it('compact footer metrics + label append the host class once revealed', () => {
    // Reveal the kebab so the metrics line and inline labels render.
    const msg: ChatMessage = {
      id: 'm',
      role: 'assistant',
      blocks: [{ type: 'text', id: 't', text: 'x' }],
      metrics: { model: 'demo' },
    }
    const { container } = render(
      <ChatProvider classNames={CN}>
        <MessageLog messages={[msg]} />
      </ChatProvider>,
    )
    // Non-compact footer: metrics + labels render inline by default.
    expectHooked(container, 'chat-footer-metrics', CN.footerMetrics)
    // No callbacks here, so labels only appear via Copy's text-free button; add
    // a regenerate-bearing render to exercise the inline label.
    const withCb = render(
      <ChatProvider classNames={CN}>
        <MessageLog messages={[msg]} onRegenerate={() => {}} />
      </ChatProvider>,
    )
    expectHooked(withCb.container, 'chat-footer-label', CN.footerLabel)
  })

  it('inert + raw + timeline + plain-status hooks append the host class', () => {
    const { container } = render(
      <ChatProvider classNames={CN}>
        <MessageLog
          messages={[
            {
              id: 'raw',
              role: 'assistant',
              blocks: [{ type: 'text', id: 't', text: 'x' }],
            },
          ]}
          raw
        />
        <MessageLog
          messages={[
            {
              id: 'inert',
              role: 'assistant',
              // Unknown block type → inert fallback.
              blocks: [{ id: 'x', type: 'mystery' } as unknown as ChatMessage['blocks'][number]],
            },
          ]}
        />
        <MessageLog
          messages={[]}
          extensions={{
            timelineItems: [{ id: 'ti', at: 1, render: () => <span>item</span> }],
          }}
        />
      </ChatProvider>,
    )
    expectHooked(container, 'chat-rawjson', CN.rawJson)
    expectHooked(container, 'chat-inert-block', CN.inertBlock)
    expectHooked(container, 'chat-timeline-item', CN.timelineItem)
  })
})

describe('classNames threading — no provider / no classNames is additive-safe', () => {
  it('renders the bare stable hooks with no extra class when unset', () => {
    const { container } = render(
      <MessageLog
        messages={[{ id: 'm', role: 'assistant', blocks: [{ type: 'text', id: 't', text: 'hi' }] }]}
      />,
    )
    const log = container.querySelector('.chat-log')
    expect(log).not.toBeNull()
    // The class list is exactly the stable hook — nothing appended.
    expect(log?.className).toBe('chat-log')
    const text = container.querySelector('.chat-text')
    expect(text?.className).toBe('chat-text')
  })
})
