/**
 * Pick an endpoint and one of its models: a searchable list, filtered by
 * provider and by what models declare (tools, reasoning, vision). Typing an
 * id the endpoint does not list is tucked away as an advanced option (shown
 * up front when the listing fails). Shared by a conversation's model sheet
 * and the assistant settings.
 */
import type { ModelInfo } from '@fx/chat-agent'
import { cn } from '@fx/chat-shadcn'
import { Brain, Eye, Search, Wrench, X } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useAppState, useStore } from '../store/context'
import type { Profile } from '../store/types'
import {
  CAPABILITIES,
  type Capability,
  declares,
  filterModels,
  formatContext,
  knownCapabilities,
  providers,
} from './model-filter'
import { PrimaryButton } from './ui'

export interface ModelChoice {
  profileId: string
  model: string
}

const CAPABILITY_ICONS: Record<Capability, typeof Wrench> = {
  tools: Wrench,
  reasoning: Brain,
  vision: Eye,
}

export function ModelPicker({
  profile,
  model,
  active = true,
  onChoose,
}: {
  /** The chosen endpoint; models are only ever listed from it. */
  profile: Profile | undefined
  model: string | undefined
  /** List models only while shown (a closed sheet stays quiet). */
  active?: boolean
  onChoose: (choice: ModelChoice) => void
}) {
  const { settings } = useAppState()
  const store = useStore()
  const [models, setModels] = useState<ModelInfo[]>()
  const [error, setError] = useState<string>()
  const [query, setQuery] = useState('')
  const [provider, setProvider] = useState<string>()
  const [capabilities, setCapabilities] = useState<Capability[]>([])

  useEffect(() => {
    if (!active || !profile) return
    const controller = new AbortController()
    setError(undefined)
    // Never offer the previous profile's models (or its filters) under the new one.
    setModels(undefined)
    setProvider(undefined)
    store
      .listModelInfo(profile, controller.signal)
      .then(setModels)
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e))
      })
    return () => controller.abort()
  }, [active, profile, store])

  const listed = useMemo(() => models ?? [], [models])
  const listRef = useRef<HTMLUListElement>(null)

  // Once listed, bring the current model into view: it may be far down a long list.
  useEffect(() => {
    if (!models) return
    listRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView?.({ block: 'center' })
  }, [models])
  const providerList = useMemo(() => providers(listed), [listed])
  const capabilityList = useMemo(() => knownCapabilities(listed), [listed])
  const shown = useMemo(
    () => filterModels(listed, { query, provider, capabilities }),
    [listed, query, provider, capabilities],
  )
  const toggle = (capability: Capability) =>
    setCapabilities((on) =>
      on.includes(capability) ? on.filter((c) => c !== capability) : [...on, capability],
    )
  const choose = (id: string) => profile && onChoose({ profileId: profile.id, model: id })
  const filtering = query.trim() !== '' || provider !== undefined || capabilities.length > 0

  return (
    <div className="flex flex-col gap-2">
      {settings.profiles.length > 1 || !profile ? (
        <fieldset aria-label="Endpoint" className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0">
          {settings.profiles.map((p) => (
            <Chip
              key={p.id}
              pressed={p.id === profile?.id}
              onClick={() => onChoose({ profileId: p.id, model: p.model })}
            >
              {p.name}
            </Chip>
          ))}
        </fieldset>
      ) : null}
      {!profile ? <p className="text-sm text-muted-foreground">Choose an endpoint.</p> : null}

      {profile && listed.length > 0 ? (
        <div className="sticky top-0 z-10 -mx-1 flex flex-col gap-2 bg-background px-1 pb-1">
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              aria-label="Search models"
              placeholder={`Search ${listed.length} models`}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="min-h-11 w-full rounded-full border border-input bg-muted/40 pr-10 pl-9 text-base [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery('')}
                className="absolute top-1/2 right-0 inline-flex size-11 -translate-y-1/2 items-center justify-center text-muted-foreground"
              >
                <X size={16} />
              </button>
            ) : null}
          </div>
          {capabilityList.length > 0 || providerList.length > 1 ? (
            <fieldset
              aria-label="Filters"
              className="-mx-1 m-0 flex min-w-0 gap-1.5 overflow-x-auto border-0 px-1 pt-0 pb-0.5 [scrollbar-width:none]"
            >
              {capabilityList.map((c) => {
                const Icon = CAPABILITY_ICONS[c]
                return (
                  <Chip key={c} pressed={capabilities.includes(c)} onClick={() => toggle(c)}>
                    <Icon size={14} />
                    {CAPABILITIES.find((x) => x.id === c)?.label}
                  </Chip>
                )
              })}
              {capabilityList.length > 0 && providerList.length > 1 ? (
                <span aria-hidden className="my-2 w-px shrink-0 bg-border" />
              ) : null}
              {providerList.length > 1
                ? providerList.map((p) => (
                    <Chip
                      key={p}
                      pressed={p === provider}
                      onClick={() => setProvider((on) => (on === p ? undefined : p))}
                    >
                      {p}
                    </Chip>
                  ))
                : null}
            </fieldset>
          ) : null}
          {filtering ? (
            <p aria-live="polite" className="px-1 text-xs text-muted-foreground">
              {shown.length} of {listed.length}
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {profile && models === undefined && !error ? (
        <p className="text-sm text-muted-foreground">Loading models…</p>
      ) : null}
      {profile && models?.length === 0 ? (
        <p className="text-sm text-muted-foreground">The endpoint lists no models.</p>
      ) : null}

      {profile && shown.length > 0 ? (
        <ul ref={listRef} aria-label="Models" className="-mx-1 flex flex-col">
          {shown.map((m) => (
            <li
              key={m.id}
              className="[content-visibility:auto] [contain-intrinsic-size:auto_3.5rem]"
            >
              <ModelRow info={m} selected={m.id === model} onChoose={() => choose(m.id)} />
            </li>
          ))}
        </ul>
      ) : null}
      {profile && models && models.length > 0 && shown.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">No models match.</p>
      ) : null}

      {profile ? (
        <ManualModel open={Boolean(error) || models?.length === 0} onUse={(id) => choose(id)} />
      ) : null}
    </div>
  )
}

function ModelRow({
  info,
  selected,
  onChoose,
}: {
  info: ModelInfo
  selected: boolean
  onChoose: () => void
}) {
  const facts = [
    info.name ? info.id : undefined,
    info.contextLength && formatContext(info.contextLength),
  ]
    .filter(Boolean)
    .join(' · ')
  const caps = CAPABILITIES.filter((c) => declares(info, c.id))
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onChoose}
      className="flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left active:bg-muted aria-pressed:bg-muted"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{info.name ?? info.id}</span>
        {facts ? (
          <span className="block truncate text-xs text-muted-foreground">{facts}</span>
        ) : null}
      </span>
      {caps.length > 0 ? (
        <span className="flex shrink-0 gap-1.5 text-muted-foreground">
          {caps.map((c) => {
            const Icon = CAPABILITY_ICONS[c.id]
            return <Icon key={c.id} size={14} aria-label={c.label} role="img" />
          })}
        </span>
      ) : null}
    </button>
  )
}

/** Use an id the endpoint does not list; collapsed unless there is no list to pick from. */
function ManualModel({ open, onUse }: { open: boolean; onUse: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [typed, setTyped] = useState('')
  if (!open && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="min-h-11 self-start px-1 text-xs text-muted-foreground underline-offset-4 active:underline"
      >
        Use a model id that isn’t listed…
      </button>
    )
  }
  return (
    <form
      className="flex gap-2 pt-1"
      onSubmit={(event) => {
        event.preventDefault()
        if (typed.trim()) onUse(typed.trim())
      }}
    >
      <input
        aria-label="Model id"
        placeholder="Type a model id"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        className="min-h-11 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-base"
      />
      <PrimaryButton type="submit">Use</PrimaryButton>
    </form>
  )
}

function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap',
        pressed
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border text-foreground active:bg-muted',
      )}
    >
      {children}
    </button>
  )
}
