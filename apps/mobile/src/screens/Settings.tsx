import { TOOL_INFO } from '@fx/chat-agent'
/**
 * Settings: a menu of sub-pages — endpoint profiles, system prompt, built-in
 * tools, the digital assistant, and about. The page shown is part of the app
 * route (`path`), so the Android back action walks back up the menu.
 */
import { ArrowLeft, Check, Plus, RefreshCw } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { ModelPicker } from '../components/ModelPicker'
import {
  Header,
  IconButton,
  MenuRow,
  SecondaryButton,
  Section,
  Sheet,
  TextArea,
  Toggle,
  errorText,
} from '../components/ui'
import { isAssistant, openAssistantSettings } from '../platform'
import { useAppState, useStore } from '../store/context'
import type { Profile } from '../store/types'
import { ProfileEditor } from './ProfileEditor'

export type SettingsPage = 'endpoints' | 'prompt' | 'tools' | 'assistant' | 'about'

/**
 * Where in settings: `[]` is the menu, `[page]` a sub-page, and
 * `['endpoints', id]` editing an endpoint (`'new'` adds one).
 */
export type SettingsPath = [] | [SettingsPage] | ['endpoints', string]

/** The path one level up, or undefined at the menu. */
export function parentPath(path: SettingsPath): SettingsPath | undefined {
  if (path.length === 2) return [path[0]]
  return path.length === 1 ? [] : undefined
}

const TITLES: Record<SettingsPage, string> = {
  endpoints: 'Endpoints',
  prompt: 'System prompt',
  tools: 'Tools',
  assistant: 'Assistant',
  about: 'About',
}

export function Settings({
  path,
  onNavigate,
  onBack,
}: {
  path: SettingsPath
  onNavigate: (path: SettingsPath) => void
  /** Leave settings. */
  onBack: () => void
}) {
  const [page, editing] = path
  const up = () => {
    const parent = parentPath(path)
    if (parent) onNavigate(parent)
    else onBack()
  }
  let title = 'Settings'
  let body: ReactNode
  if (editing !== undefined) {
    title = editing === 'new' ? 'Add endpoint' : 'Edit endpoint'
    body = <EditEndpoint id={editing} onDone={up} />
  } else if (page) {
    title = TITLES[page]
    body = {
      endpoints: <Endpoints onEdit={(id) => onNavigate(['endpoints', id])} />,
      prompt: <SystemPrompt />,
      tools: <Tools />,
      assistant: <Assistant />,
      about: <About />,
    }[page]
  } else {
    body = <Menu onOpen={(next) => onNavigate([next])} />
  }
  return (
    <div className="flex h-full flex-col">
      <Header
        title={title}
        left={
          <IconButton label="Back" onClick={up}>
            <ArrowLeft size={20} />
          </IconButton>
        }
      />
      <div className="safe-bottom min-h-0 flex-1 overflow-y-auto">{body}</div>
    </div>
  )
}

function Menu({ onOpen }: { onOpen: (page: SettingsPage) => void }) {
  const { settings } = useAppState()
  const store = useStore()
  const active = store.activeProfile()
  const assistant = store.assistantModel()
  const toolsOn = TOOL_INFO.filter((tool) => settings.tools[tool.id]).length
  const summaries: Record<SettingsPage, string> = {
    endpoints: active
      ? `${active.name} · ${active.model}`
      : `${settings.profiles.length} endpoints`,
    prompt: settings.systemPrompt.trim() || 'None',
    tools: `${toolsOn} of ${TOOL_INFO.length} on`,
    assistant: assistant ? `${assistant.profile.name} · ${assistant.model}` : 'No endpoint yet',
    about: 'Privacy and version',
  }
  return (
    <nav aria-label="Settings">
      {(Object.keys(TITLES) as SettingsPage[]).map((page) => (
        <MenuRow
          key={page}
          title={TITLES[page]}
          summary={summaries[page]}
          onClick={() => onOpen(page)}
        />
      ))}
    </nav>
  )
}

function Endpoints({ onEdit }: { onEdit: (id: string) => void }) {
  const { settings } = useAppState()
  const store = useStore()
  const active = store.activeProfile()
  return (
    <Section>
      <ul className="flex flex-col">
        {settings.profiles.map((p) => (
          <li key={p.id} className="flex items-center gap-1">
            <button
              type="button"
              className="flex min-h-14 min-w-0 flex-1 flex-col justify-center text-left"
              onClick={() => onEdit(p.id)}
            >
              <span className="truncate text-sm font-medium">{p.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {p.model} · {p.baseUrl}
              </span>
            </button>
            <RefreshModels profile={p} />
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
      <SecondaryButton onClick={() => onEdit('new')}>
        <Plus size={16} /> Add endpoint
      </SecondaryButton>
      <p className="text-xs text-muted-foreground">
        The active endpoint is used for new chats; each chat remembers its own.
      </p>
    </Section>
  )
}

/** Refresh an endpoint's cached model listing; says how many it lists, or why it failed. */
function RefreshModels({ profile }: { profile: Profile }) {
  const store = useStore()
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>('idle')
  const [count, setCount] = useState<number>()
  useEffect(() => {
    let current = true
    void store.cachedModels(profile).then((cached) => {
      if (current) setCount(cached?.models.length)
    })
    return () => {
      current = false
    }
  }, [store, profile])
  const label =
    state === 'loading'
      ? `Refreshing ${profile.name} models`
      : state === 'failed'
        ? `Refreshing ${profile.name} models failed; try again`
        : `Refresh ${profile.name} models${count === undefined ? '' : ` (${count} listed)`}`
  return (
    <IconButton
      label={label}
      disabled={state === 'loading'}
      className={state === 'failed' ? 'text-destructive' : 'text-muted-foreground'}
      onClick={() => {
        setState('loading')
        store.refreshModels(profile).then(
          (catalog) => {
            setCount(catalog.models.length)
            setState('idle')
          },
          () => setState('failed'),
        )
      }}
    >
      <RefreshCw
        size={18}
        className={state === 'loading' ? 'motion-safe:animate-spin' : undefined}
      />
    </IconButton>
  )
}

function EditEndpoint({ id, onDone }: { id: string; onDone: () => void }) {
  const { settings } = useAppState()
  const store = useStore()
  const profile = settings.profiles.find((p) => p.id === id)
  return (
    <ProfileEditor
      profile={profile}
      onCancel={onDone}
      onSaved={(saved) => {
        void store.saveProfile(saved)
        onDone()
      }}
      onDelete={
        profile
          ? () => {
              void store.deleteProfile(profile.id)
              onDone()
            }
          : undefined
      }
    />
  )
}

function SystemPrompt() {
  const { settings } = useAppState()
  const store = useStore()
  const [systemPrompt, setSystemPrompt] = useState(settings.systemPrompt)
  return (
    <Section>
      <TextArea
        aria-label="System prompt"
        rows={6}
        placeholder="Optional instructions sent at the start of every turn."
        value={systemPrompt}
        onChange={(event) => setSystemPrompt(event.target.value)}
        onBlur={() => void store.updateSettings({ systemPrompt })}
      />
    </Section>
  )
}

function Tools() {
  const { settings } = useAppState()
  const store = useStore()
  return (
    <Section>
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
  )
}

/** Whether the app is the digital assistant, re-read when the app comes back. */
function useAssistantRole(): boolean | undefined {
  const [held, setHeld] = useState(isAssistant)
  useEffect(() => {
    const update = () => {
      if (document.visibilityState === 'visible') setHeld(isAssistant())
    }
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  return held
}

function Assistant() {
  const store = useStore()
  useAppState() // re-render when settings change
  const held = useAssistantRole()
  const [picking, setPicking] = useState(false)
  const target = store.assistantModel()
  const same = store.assistantMatchesNewChats()
  // The choice applies at once; a failed write would silently revert it on
  // the next launch, so say so.
  const [saveError, setSaveError] = useState<string>()
  const save = (write: Promise<void>) => {
    setSaveError(undefined)
    write.catch((error: unknown) => {
      setSaveError(`Couldn't save the assistant model: ${errorText(error)}`)
    })
  }
  return (
    <>
      {held !== undefined ? (
        <Section title="Digital assistant">
          <p className="text-sm">
            {held
              ? 'This app is your digital assistant. Long-press power (or swipe up from a bottom corner) and speak; your prompt starts a new chat.'
              : 'Make this app your digital assistant to start a chat by voice from anywhere.'}
          </p>
          <SecondaryButton onClick={openAssistantSettings}>
            {held ? 'Change assistant app' : 'Choose assistant app'}
          </SecondaryButton>
        </Section>
      ) : null}
      <MenuRow
        title="Model"
        summary={target ? `${target.profile.name} · ${target.model}` : 'No endpoint yet'}
        onClick={() => setPicking(true)}
      />
      <div className="border-b border-border px-4">
        <Toggle
          label="Same as new chats"
          description="Follow the active endpoint and its model."
          checked={same}
          // On: follow new chats again. Off means choosing a different model.
          onChange={(on) => (on ? save(store.updateSettings({ assistant: {} })) : setPicking(true))}
        />
        {saveError ? (
          <p role="alert" className="pb-3 text-xs text-destructive">
            {saveError}
          </p>
        ) : null}
      </div>
      <Sheet open={picking} onClose={() => setPicking(false)} title="Assistant model" tall>
        <ModelPicker
          profile={target?.profile}
          model={target?.model}
          active={picking}
          onChoose={(choice) => {
            save(store.setAssistantModel(choice))
            setPicking(false)
          }}
        />
      </Sheet>
    </>
  )
}

function About() {
  return (
    <Section>
      <p className="text-xs text-muted-foreground">
        A reference app for the @fx/chat libraries. Everything stays on this device; requests go
        only to the endpoints you configure and the pages tools fetch with your approval.
      </p>
    </Section>
  )
}
