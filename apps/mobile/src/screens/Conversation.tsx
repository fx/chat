/**
 * One conversation: the live transcript (rendered by `@fx/chat`), the
 * composer, tool approvals, run errors with retry, and the model picker.
 */
import { type Attachment, type ChatExtensions, ChatInput, MessageLog } from '@fx/chat'
import { ArrowLeft, ChevronDown, RotateCcw, ShieldQuestion } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { ModelPicker } from '../components/ModelPicker'
import { Header, IconButton, PrimaryButton, SecondaryButton, Sheet } from '../components/ui'
import { useAppState, useStore } from '../store/context'
import type { PendingApproval } from '../store/types'

/** Longest image edge sent to the model; larger photos are downscaled. */
const MAX_IMAGE_EDGE = 1568

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * Read picked files as attachments. Non-images are skipped; a file that
 * cannot be read (the picker's grant can fail) is counted, not thrown.
 */
export async function readAttachments(
  files: File[],
): Promise<{ added: Attachment[]; failed: number }> {
  const results = await Promise.allSettled(files.map(fileToAttachment))
  const added: Attachment[] = []
  let failed = 0
  for (const result of results) {
    if (result.status === 'rejected') failed++
    else if (result.value) added.push(result.value)
  }
  return { added, failed }
}

/** What to tell the user when picked images could not be read. */
export function unreadable(count: number): string {
  return `Couldn’t read ${count === 1 ? 'that image' : `${count} of those images`}. Try picking ${count === 1 ? 'it' : 'them'} again.`
}

/**
 * The composer's picked images and the notice about any that could not be
 * read. The notice shows after a pick with unreadable images and clears on the
 * next pick that reads every image (picking again is the fix) or on send.
 */
export function usePickedImages() {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [error, setError] = useState<string>()
  const add = useCallback(async (files: File[]) => {
    const { added, failed } = await readAttachments(files)
    setAttachments((current) => [...current, ...added])
    setError(failed > 0 ? unreadable(failed) : undefined)
  }, [])
  const clear = useCallback(() => {
    setAttachments([])
    setError(undefined)
  }, [])
  return { attachments, setAttachments, error, add, clear }
}

/** Turn a picked image into a (downscaled) data-URL attachment. */
export async function fileToAttachment(file: File): Promise<Attachment | undefined> {
  if (!file.type.startsWith('image/')) return undefined
  const url = await readAsDataUrl(file)
  const scaled = await downscale(url).catch(() => url)
  return {
    url: scaled,
    mediaType: scaled.slice(5, scaled.indexOf(';')),
    kind: 'image',
    name: file.name,
  }
}

function downscale(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.width, img.height))
      if (scale === 1) return resolve(url)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return resolve(url)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = reject
    img.src = url
  })
}

/** Distance from the bottom (px) still treated as "following" the output. */
const FOLLOW_THRESHOLD = 48

export function Conversation({ id, onBack }: { id: string; onBack: () => void }) {
  const state = useAppState()
  const store = useStore()
  const meta = state.conversations.find((c) => c.id === id)
  const messages = state.messages[id]
  const run = state.runs[id]
  // The transcript sees a finished run one render late, inside a view
  // transition, so the live activity tiles morph into the footer.
  const shownRun = useFinishTransition(run)
  const lastAnswer = messages?.filter((message) => message.role === 'assistant').at(-1)?.id
  const error = state.errors[id]
  // A conversation runs only against its own profile; when that is gone,
  // every run-starting action is withheld until the user re-binds it.
  const blocker = meta ? store.runBlocker(meta) : undefined
  const blocked = Boolean(blocker)
  const approval = state.approvals.find((a) => a.conversationId === id)
  const picked = usePickedImages()
  // A chat with no model (no default model yet) opens on the model picker.
  const [pickerOpen, setPickerOpen] = useState(() => meta !== undefined && !meta.model)
  // The one assistant message whose footer shows (tap a message to show it).
  const [selected, setSelected] = useState<string>()
  const scrollRef = useRef<HTMLDivElement>(null)
  const followRef = useRef(true)

  useEffect(() => {
    void store.openConversation(id)
  }, [store, id])

  // Follow new output while the user is at the bottom; never yank them down
  // after they scrolled up to read.
  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_THRESHOLD
  }, [])
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && followRef.current) el.scrollTop = el.scrollHeight
  })
  // Keep following when the viewport shrinks (keyboard opening).
  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (followRef.current) el.scrollTop = el.scrollHeight
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const extensions = useMemo<ChatExtensions | undefined>(() => {
    if (!error || run) return undefined
    return {
      timelineItems: [
        {
          id: `error-${error.at}`,
          at: error.at,
          render: () => (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-md border border-destructive/50 p-3 text-sm"
            >
              <p className="text-destructive [overflow-wrap:anywhere]">{error.message}</p>
              {blocked ? null : (
                <SecondaryButton className="self-start" onClick={() => void store.regenerate(id)}>
                  <RotateCcw size={16} /> Retry
                </SecondaryButton>
              )}
            </div>
          ),
        },
      ],
    }
  }, [error, run, store, id, blocked])

  if (!meta) {
    return (
      <div className="flex h-full flex-col">
        <Header
          title="Not found"
          left={
            <IconButton label="Back" onClick={onBack}>
              <ArrowLeft size={20} />
            </IconButton>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <Header
        left={
          <IconButton label="Back" onClick={onBack}>
            <ArrowLeft size={20} />
          </IconButton>
        }
        title={
          <button
            type="button"
            className="flex min-h-11 max-w-full flex-col items-start justify-center text-left"
            onClick={() => setPickerOpen(true)}
            aria-label="Change model"
          >
            <span className="max-w-full truncate text-base font-semibold">{meta.title}</span>
            <span className="flex max-w-full items-center gap-0.5 text-xs text-muted-foreground">
              <span className="truncate">{meta.model ?? 'choose a model'}</span>
              <ChevronDown size={12} className="shrink-0" />
            </span>
          </button>
        }
      />

      <style>{conversationStyle(selected, lastAnswer)}</style>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: tapping shows the message's footer; its actions stay reachable from the keyboard */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        onClick={(event) => {
          // Read the event now: `currentTarget` is only set during dispatch.
          const tap = { target: event.target, currentTarget: event.currentTarget }
          setSelected((current) => selectionAfterTap(tap, current))
        }}
        className="conversation-log min-h-0 flex-1 overflow-y-auto px-3 py-3"
      >
        {messages && messages.length === 0 && !run ? (
          <p className="px-6 py-16 text-center text-sm text-muted-foreground">
            Ask anything. Reasoning and tool calls show up live as the model works.
          </p>
        ) : null}
        {messages ? (
          <MessageLog
            messages={messages}
            isStreaming={Boolean(shownRun)}
            {...(shownRun ? { streamingMessageId: shownRun.messageId } : {})}
            showFooter
            compactFooter
            activityDisplay="summary"
            activityPlacement="after-content"
            finishedActivity="footer"
            {...(blocker
              ? {}
              : { onRegenerate: (messageId: string) => void store.regenerate(id, messageId) })}
            {...(extensions ? { extensions } : {})}
          />
        ) : null}
      </div>

      {approval ? <ApprovalBar approval={approval} /> : null}

      <div className="safe-bottom shrink-0 border-t border-border bg-background px-3 pt-2 pb-2">
        {picked.error ? (
          <p role="alert" className="px-1 pb-1.5 text-xs text-destructive">
            {picked.error}
          </p>
        ) : null}
        <ChatInput
          onSend={(text, sent) => {
            followRef.current = true
            picked.clear()
            void store.send(id, text, sent)
          }}
          onStop={() => store.stop(id)}
          isStreaming={Boolean(run)}
          attachments={picked.attachments}
          onAttachmentsChange={picked.setAttachments}
          onAddFiles={(files) => void picked.add(files)}
          accept="image/*"
          maxLines={6}
          placeholder={blocker ?? 'Message'}
          disabled={Boolean(blocker)}
        />
      </div>

      <ModelSheet open={pickerOpen} onClose={() => setPickerOpen(false)} conversationId={id} />
    </div>
  )
}

function ApprovalBar({ approval }: { approval: PendingApproval }) {
  const args = JSON.stringify(approval.call.arguments, null, 2)
  return (
    <div
      role="alertdialog"
      aria-label={`Allow ${approval.call.name}?`}
      className="shrink-0 border-t border-border bg-muted/50 px-4 py-3"
    >
      <p className="flex items-center gap-2 text-sm font-medium">
        <ShieldQuestion size={18} className="shrink-0" /> Allow {approval.call.name}?
      </p>
      <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-background p-2 text-xs [overflow-wrap:anywhere] whitespace-pre-wrap">
        {args}
      </pre>
      <div className="mt-2 flex gap-2">
        <PrimaryButton className="flex-1" onClick={() => approval.resolve(true)}>
          Allow
        </PrimaryButton>
        <SecondaryButton className="flex-1" onClick={() => approval.resolve(false)}>
          Deny
        </SecondaryButton>
      </div>
    </div>
  )
}

function ModelSheet({
  open,
  onClose,
  conversationId,
}: {
  open: boolean
  onClose: () => void
  conversationId: string
}) {
  const state = useAppState()
  const store = useStore()
  const meta = state.conversations.find((c) => c.id === conversationId)
  // Only the conversation's own profile: never list models from (or bind a
  // model to) another endpoint without the user picking that profile.
  const profile = meta ? store.conversationProfile(meta) : undefined
  return (
    <Sheet open={open} onClose={onClose} title="Model" tall>
      <ModelPicker
        profile={profile}
        model={meta?.model}
        active={open}
        onChoose={(choice) => {
          void store.chooseModel(conversationId, choice)
          onClose()
        }}
      />
    </Sheet>
  )
}

/**
 * Footers are hidden except the last answer's and the selected message's,
 * and the last answer's activity tiles and footer share a view-transition
 * name, so finishing morphs one into the other. Message ids go into the rules
 * (escaped), so they are generated rather than static classes.
 */
export function conversationStyle(selected: string | undefined, last: string | undefined): string {
  const is = (id: string) => `[data-message-id="${CSS.escape(id)}"]`
  const kept = [selected, last]
    .filter((id): id is string => id !== undefined)
    .map((id) => `:not(${is(id)})`)
    .join('')
  const hide = `.conversation-log .chat-message${kept} .chat-footer { display: none; }`
  if (last === undefined) return hide
  const morph = `.conversation-log .chat-message${is(last)} :is(.chat-tiles, .chat-footer) { view-transition-name: answer-activity; }`
  return `${hide}\n${morph}`
}

/**
 * `run`, except that its end reaches the transcript inside a view transition
 * (where supported and motion is welcome): the transcript still shows the
 * live tiles in the snapshot taken before, and the footer after.
 */
export function useFinishTransition<T>(run: T | undefined): T | undefined {
  const [shown, setShown] = useState(run)
  useEffect(() => {
    if (run !== undefined || shown === undefined) {
      setShown(run)
      return
    }
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (!document.startViewTransition || still) {
      setShown(undefined)
      return
    }
    // React refuses `flushSync` while it is running an effect, so start the
    // transition once the effect has returned: its callback must commit the
    // end synchronously for the snapshot after it to show the footer.
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      document.startViewTransition(() => {
        if (!cancelled) flushSync(() => setShown(undefined))
      })
    })
    return () => {
      cancelled = true
    }
  }, [run, shown])
  return shown
}

/**
 * The selected message after a tap in the transcript: an assistant message
 * becomes selected (tapping it again on its text deselects it), anywhere else
 * clears the selection. Taps on a footer, and those bubbling through React
 * from a portal (the details sheet), change nothing.
 */
export function selectionAfterTap(
  event: { target: EventTarget; currentTarget: Element },
  current: string | undefined,
): string | undefined {
  const target = event.target as Element
  if (!event.currentTarget.contains(target) || target.closest('.chat-footer')) return current
  const message = target.closest<HTMLElement>('.chat-message[data-role="assistant"]')
  const id = message?.dataset.messageId
  if (!id) return undefined
  const control = target.closest('button, a, input, textarea, select, [role="button"]')
  return id === current && !control ? undefined : id
}
