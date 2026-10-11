import { TOOL_INFO } from '@fx/chat-agent'
/** Settings: endpoint profiles, system prompt, and built-in tools. */
import { ArrowLeft, Check, Plus } from 'lucide-react'
import { useState } from 'react'
import { Header, IconButton, SecondaryButton, Section, TextArea, Toggle } from '../components/ui'
import { useAppState, useStore } from '../store/context'
import type { Profile } from '../store/types'
import { ProfileEditor } from './ProfileEditor'

export function Settings({ onBack }: { onBack: () => void }) {
  const { settings } = useAppState()
  const store = useStore()
  const [editing, setEditing] = useState<Profile | 'new'>()
  const [systemPrompt, setSystemPrompt] = useState(settings.systemPrompt)
  const active = store.activeProfile()

  if (editing) {
    const profile = editing === 'new' ? undefined : editing
    return (
      <div className="flex h-full flex-col">
        <Header
          title={profile ? 'Edit endpoint' : 'Add endpoint'}
          left={
            <IconButton label="Back" onClick={() => setEditing(undefined)}>
              <ArrowLeft size={20} />
            </IconButton>
          }
        />
        <div className="safe-bottom min-h-0 flex-1 overflow-y-auto">
          <ProfileEditor
            profile={profile}
            onCancel={() => setEditing(undefined)}
            onSaved={(saved) => {
              void store.saveProfile(saved)
              setEditing(undefined)
            }}
            onDelete={
              profile
                ? () => {
                    void store.deleteProfile(profile.id)
                    setEditing(undefined)
                  }
                : undefined
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <Header
        title="Settings"
        left={
          <IconButton label="Back" onClick={onBack}>
            <ArrowLeft size={20} />
          </IconButton>
        }
      />
      <div className="safe-bottom min-h-0 flex-1 overflow-y-auto">
        <Section title="Endpoints">
          <ul className="flex flex-col">
            {settings.profiles.map((p) => (
              <li key={p.id} className="flex items-center gap-1">
                <button
                  type="button"
                  className="flex min-h-14 min-w-0 flex-1 flex-col justify-center text-left"
                  onClick={() => setEditing(p)}
                >
                  <span className="truncate text-sm font-medium">{p.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {p.model} · {p.baseUrl}
                  </span>
                </button>
                <IconButton
                  label={p.id === active?.id ? `${p.name} is active` : `Use ${p.name}`}
                  aria-pressed={p.id === active?.id}
                  onClick={() => void store.updateSettings({ activeProfileId: p.id })}
                  className={p.id === active?.id ? 'text-primary' : 'text-muted-foreground'}
                >
                  <Check size={18} className={p.id === active?.id ? undefined : 'opacity-30'} />
                </IconButton>
              </li>
            ))}
          </ul>
          <SecondaryButton onClick={() => setEditing('new')}>
            <Plus size={16} /> Add endpoint
          </SecondaryButton>
          <p className="text-xs text-muted-foreground">
            The active endpoint is used for new chats; each chat remembers its own.
          </p>
        </Section>

        <Section title="System prompt">
          <TextArea
            aria-label="System prompt"
            rows={4}
            placeholder="Optional instructions sent at the start of every turn."
            value={systemPrompt}
            onChange={(event) => setSystemPrompt(event.target.value)}
            onBlur={() => void store.updateSettings({ systemPrompt })}
          />
        </Section>

        <Section title="Tools">
          {TOOL_INFO.map((tool) => (
            <div key={tool.id} className="flex flex-col">
              <Toggle
                label={tool.label}
                description={tool.description}
                checked={settings.tools[tool.id]}
                onChange={(checked) =>
                  void store.updateSettings({ tools: { ...settings.tools, [tool.id]: checked } })
                }
              />
              {settings.tools[tool.id] ? (
                <div className="pl-4">
                  <Toggle
                    label="Ask before each use"
                    checked={settings.approvals[tool.id]}
                    onChange={(checked) =>
                      void store.updateSettings({
                        approvals: { ...settings.approvals, [tool.id]: checked },
                      })
                    }
                  />
                </div>
              ) : null}
            </div>
          ))}
        </Section>

        <Section title="About">
          <p className="text-xs text-muted-foreground">
            A reference app for the @fx/chat libraries. Everything stays on this device; requests go
            only to the endpoints you configure and the pages tools fetch with your approval.
          </p>
        </Section>
      </div>
    </div>
  )
}
