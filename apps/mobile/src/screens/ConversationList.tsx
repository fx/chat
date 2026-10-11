/** The conversation list: newest activity first, with rename and delete. */
import { MessageSquarePlus, MoreVertical, Settings as SettingsIcon } from 'lucide-react'
import { useState } from 'react'
import {
  Header,
  IconButton,
  PrimaryButton,
  SecondaryButton,
  Sheet,
  TextInput,
} from '../components/ui'
import { useAppState, useStore } from '../store/context'
import type { ConversationMeta } from '../store/types'

/** Short relative time: "now", "5m", "3h", "2d", else a date. */
export function relativeTime(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 60) return 'now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`
  if (seconds < 7 * 86_400) return `${Math.floor(seconds / 86_400)}d`
  return new Date(at).toLocaleDateString()
}

export function ConversationList({
  onOpen,
  onNew,
  onSettings,
}: {
  onOpen: (id: string) => void
  onNew: () => void
  onSettings: () => void
}) {
  const { conversations, runs } = useAppState()
  const store = useStore()
  const [menuFor, setMenuFor] = useState<ConversationMeta>()
  const [renaming, setRenaming] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const now = Date.now()

  const closeMenu = () => {
    setMenuFor(undefined)
    setConfirmDelete(false)
  }

  return (
    <div className="flex h-full flex-col">
      <Header
        title="Chats"
        right={
          <IconButton label="Settings" onClick={onSettings}>
            <SettingsIcon size={20} />
          </IconButton>
        }
      />
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <li className="px-6 py-16 text-center text-sm text-muted-foreground">
            No conversations yet. Start one with the button below.
          </li>
        ) : null}
        {conversations.map((c) => (
          <li key={c.id} className="flex items-center border-b border-border">
            <button
              type="button"
              onClick={() => onOpen(c.id)}
              className="flex min-h-16 min-w-0 flex-1 flex-col justify-center px-4 py-2 text-left active:bg-muted"
            >
              <span className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {runs[c.id] ? 'replying…' : relativeTime(c.updatedAt, now)}
                </span>
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {c.model ?? 'no model'}
              </span>
            </button>
            <IconButton
              label={`Actions for ${c.title}`}
              onClick={() => {
                setMenuFor(c)
                setRenaming(c.title)
              }}
            >
              <MoreVertical size={18} />
            </IconButton>
          </li>
        ))}
      </ul>
      <div className="safe-bottom shrink-0 border-t border-border p-3">
        <PrimaryButton className="w-full" onClick={onNew}>
          <MessageSquarePlus size={18} /> New chat
        </PrimaryButton>
      </div>

      <Sheet open={menuFor !== undefined} onClose={closeMenu} title="Conversation">
        {menuFor ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              const title = renaming.trim()
              if (title) void store.updateConversation(menuFor.id, { title })
              closeMenu()
            }}
          >
            <TextInput
              aria-label="Title"
              value={renaming}
              onChange={(e) => setRenaming(e.target.value)}
            />
            <PrimaryButton type="submit">Rename</PrimaryButton>
            {confirmDelete ? (
              <SecondaryButton
                className="text-destructive"
                onClick={() => {
                  void store.deleteConversation(menuFor.id)
                  closeMenu()
                }}
              >
                Delete permanently
              </SecondaryButton>
            ) : (
              <SecondaryButton className="text-destructive" onClick={() => setConfirmDelete(true)}>
                Delete…
              </SecondaryButton>
            )}
          </form>
        ) : null}
      </Sheet>
    </div>
  )
}
