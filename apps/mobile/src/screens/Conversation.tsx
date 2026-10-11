/**
 * One conversation: the live transcript (rendered by `@fx/chat`), the
 * composer, tool approvals, run errors with retry, and the model picker.
 */
import { type Attachment, type ChatExtensions, ChatInput, MessageLog } from '@fx/chat'
import { ArrowLeft, ChevronDown, RotateCcw, ShieldQuestion } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
  const error = state.errors[id]
  const approval = state.approvals.find((a) => a.conversationId === id)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
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
              <SecondaryButton className="self-start" onClick={() => void store.regenerate(id)}>
                <RotateCcw size={16} /> Retry
              </SecondaryButton>
            </div>
          ),
        },
      ],
    }
  }, [error, run, store, id])

  const onAddFiles = useCallback(async (files: File[]) => {
    const added = (await Promise.all(files.map(fileToAttachment))).filter(
      (a): a is Attachment => a !== undefined,
    )
    setAttachments((current) => [...current, ...added])
  }, [])

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

  const profile = state.settings.profiles.find((p) => p.id === meta.profileId)

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

      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {messages && messages.length === 0 && !run ? (
          <p className="px-6 py-16 text-center text-sm text-muted-foreground">
            Ask anything. Reasoning and tool calls show up live as the model works.
          </p>
        ) : null}
        {messages ? (
          <MessageLog
            messages={messages}
            isStreaming={Boolean(run)}
            {...(run ? { streamingMessageId: run.messageId } : {})}
            showFooter
            compactFooter
            onRegenerate={(messageId) => void store.regenerate(id, messageId)}
            {...(extensions ? { extensions } : {})}
          />
        ) : null}
      </div>

      {approval ? <ApprovalBar approval={approval} /> : null}

      <div className="safe-bottom shrink-0 border-t border-border bg-background px-3 pt-2 pb-2">
        <ChatInput
          onSend={(text, sent) => {
            followRef.current = true
            setAttachments([])
            void store.send(id, text, sent)
          }}
          onStop={() => store.stop(id)}
          isStreaming={Boolean(run)}
          attachments={attachments}
          onAttachmentsChange={setAttachments}
          onAddFiles={(files) => void onAddFiles(files)}
          accept="image/*"
          maxLines={6}
          placeholder={profile ? 'Message' : 'Add an endpoint in Settings first'}
          disabled={!profile}
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
  const profile =
    state.settings.profiles.find((p) => p.id === meta?.profileId) ?? store.activeProfile()
  const [models, setModels] = useState<string[]>()
  const [error, setError] = useState<string>()
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (!open || !profile) return
    const controller = new AbortController()
    setError(undefined)
    store
      .listModels(profile, controller.signal)
      .then(setModels)
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e))
      })
    return () => controller.abort()
  }, [open, profile, store])

  const choose = (patch: { profileId?: string; model: string }) => {
    void store.updateConversation(conversationId, patch)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Model">
      <div className="flex flex-col gap-3">
        {state.settings.profiles.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {state.settings.profiles.map((p) => (
              <SecondaryButton
                key={p.id}
                aria-pressed={p.id === profile?.id}
                className="aria-pressed:border-primary aria-pressed:text-primary"
                onClick={() => choose({ profileId: p.id, model: p.model })}
              >
                {p.name}
              </SecondaryButton>
            ))}
          </div>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        {models === undefined && !error ? (
          <p className="text-sm text-muted-foreground">Loading models…</p>
        ) : null}
        <ul className="flex max-h-72 flex-col overflow-y-auto">
          {(models ?? []).map((m) => (
            <li key={m}>
              <button
                type="button"
                aria-pressed={m === meta?.model}
                onClick={() => choose({ model: m })}
                className="min-h-11 w-full truncate rounded-md px-3 text-left text-sm aria-pressed:bg-muted aria-pressed:font-medium"
              >
                {m}
              </button>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (typed.trim()) choose({ model: typed.trim() })
          }}
        >
          <input
            aria-label="Model id"
            placeholder="Type a model id"
            autoCapitalize="off"
            autoCorrect="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="min-h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-base"
          />
          <PrimaryButton type="submit">Use</PrimaryButton>
        </form>
      </div>
    </Sheet>
  )
}
