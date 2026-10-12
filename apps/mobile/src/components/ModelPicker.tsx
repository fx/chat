/**
 * Pick an endpoint and one of its models: a search field with the common
 * capability filters as icon toggles (tools, reasoning, vision), and a
 * filters panel behind a sliders button with every filter — the endpoint
 * to browse, the providers, and the same capabilities. Typing an id the endpoint does not list is tucked
 * away as an advanced option (shown up front when the listing fails). Shared
 * by a conversation's model sheet and the assistant settings.
 */
import type { ModelInfo } from '@fx/chat-agent'
import { cn } from '@fx/chat-shadcn'
import { Brain, Check, Eye, Search, SlidersHorizontal, Wrench, X } from 'lucide-react'
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
import { PrimaryButton, SecondaryButton } from './ui'

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
  /** The current endpoint; browsing starts there. */
  profile: Profile | undefined
  model: string | undefined
  /** List models only while shown (a closed sheet stays quiet). */
  active?: boolean
  onChoose: (choice: ModelChoice) => void
}) {
  const { settings } = useAppState()
  const store = useStore()
  // The endpoint being browsed: models are only ever listed from the current
  // endpoint or one the user picked in the filters.
  const [browseId, setBrowseId] = useState(profile?.id)
  const browsing = settings.profiles.find((p) => p.id === browseId)
  const [models, setModels] = useState<ModelInfo[]>()
  const [error, setError] = useState<string>()
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<string[]>([])
  const [capabilities, setCapabilities] = useState<Capability[]>([])
  const [filtersOpen, setFiltersOpen] = useState(false)

  useEffect(() => setBrowseId(profile?.id), [profile?.id])

  useEffect(() => {
    if (!active || !browsing) return
    const controller = new AbortController()
    setError(undefined)
    // Never offer the previous endpoint's models (or its providers) under this one.
    setModels(undefined)
    setChosen([])
    store
      .listModelInfo(browsing, controller.signal)
      .then(setModels)
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e))
      })
    return () => controller.abort()
  }, [active, browsing, store])

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
    () => filterModels(listed, { query, providers: chosen, capabilities }),
    [listed, query, chosen, capabilities],
  )
  const toggle = (capability: Capability) =>
    setCapabilities((on) =>
      on.includes(capability) ? on.filter((c) => c !== capability) : [...on, capability],
    )
  const choose = (id: string) => browsing && onChoose({ profileId: browsing.id, model: id })
  const filtering = query.trim() !== '' || chosen.length > 0 || capabilities.length > 0
  const current = browsing?.id === profile?.id ? model : undefined
  const panelCount = chosen.length + (browsing && browsing.id !== profile?.id ? 1 : 0)

  if (filtersOpen || !browsing) {
    return (
      <FiltersPanel
        profiles={settings.profiles}
        browsing={browsing}
        onBrowse={setBrowseId}
        providers={providerList}
        chosen={chosen}
        onChosen={setChosen}
        capabilityList={capabilityList}
        capabilities={capabilities}
        onToggle={toggle}
        onClear={() => {
          setChosen([])
          setCapabilities([])
        }}
        matches={browsing ? shown.length : undefined}
        onDone={() => setFiltersOpen(false)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="sticky top-0 z-10 -mx-1 flex flex-col gap-1 bg-background px-1 pb-1">
        <div className="flex items-center gap-0.5">
          <div className="relative min-w-0 flex-1">
            <Search
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              aria-label="Search models"
              placeholder="Search models"
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
          {capabilityList.map((c) => {
            const Icon = CAPABILITY_ICONS[c]
            const label = CAPABILITIES.find((x) => x.id === c)?.label as string
            return (
              <IconToggle
                key={c}
                label={label}
                pressed={capabilities.includes(c)}
                onClick={() => toggle(c)}
              >
                <Icon size={18} />
              </IconToggle>
            )
          })}
          <button
            type="button"
            aria-label={panelCount > 0 ? `Filters, ${panelCount} on` : 'Filters'}
            title="Filters"
            onClick={() => setFiltersOpen(true)}
            className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
          >
            <SlidersHorizontal size={18} />
            {panelCount > 0 ? (
              <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[0.625rem] font-medium text-primary-foreground">
                {panelCount}
              </span>
            ) : null}
          </button>
        </div>
        <p aria-live="polite" className="truncate px-3 text-xs text-muted-foreground">
          {[
            settings.profiles.length > 1 ? browsing.name : undefined,
            chosen.length > 2 ? `${chosen.length} providers` : chosen.join(', '),
            models
              ? filtering
                ? `${shown.length} of ${listed.length}`
                : `${listed.length} models`
              : undefined,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {models === undefined && !error ? (
        <p className="text-sm text-muted-foreground">Loading models…</p>
      ) : null}
      {models?.length === 0 ? (
        <p className="text-sm text-muted-foreground">The endpoint lists no models.</p>
      ) : null}

      {shown.length > 0 ? (
        <ul ref={listRef} aria-label="Models" className="-mx-1 flex flex-col">
          {shown.map((m) => (
            <li
              key={m.id}
              className="[contain-intrinsic-size:auto_3.5rem] [content-visibility:auto]"
            >
              <ModelRow info={m} selected={m.id === current} onChoose={() => choose(m.id)} />
            </li>
          ))}
        </ul>
      ) : null}
      {models && models.length > 0 && shown.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">No models match.</p>
      ) : null}

      <ManualModel open={Boolean(error) || models?.length === 0} onUse={(id) => choose(id)} />
    </div>
  )
}

/**
 * Every filter: which endpoint to browse, which providers, and the
 * capabilities (also toggled beside the search), so the count it shows is
 * explained by what it shows.
 */
function FiltersPanel({
  profiles,
  browsing,
  onBrowse,
  providers,
  chosen,
  onChosen,
  capabilityList,
  capabilities,
  onToggle,
  onClear,
  matches,
  onDone,
}: {
  profiles: readonly Profile[]
  browsing: Profile | undefined
  onBrowse: (id: string) => void
  providers: readonly string[]
  chosen: readonly string[]
  onChosen: (providers: string[]) => void
  capabilityList: readonly Capability[]
  capabilities: readonly Capability[]
  onToggle: (capability: Capability) => void
  onClear: () => void
  matches: number | undefined
  onDone: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      {profiles.length > 1 || !browsing ? (
        <fieldset className="m-0 flex min-w-0 flex-col border-0 p-0">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Endpoint
          </legend>
          {profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={p.id === browsing?.id}
              onClick={() => onBrowse(p.id)}
              className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-left active:bg-muted"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{p.baseUrl}</span>
              </span>
              {p.id === browsing?.id ? <Check size={18} className="shrink-0 text-primary" /> : null}
            </button>
          ))}
        </fieldset>
      ) : null}
      {!browsing ? <p className="text-sm text-muted-foreground">Choose an endpoint.</p> : null}

      {capabilityList.length > 0 ? (
        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Capabilities
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {capabilityList.map((c) => {
              const Icon = CAPABILITY_ICONS[c]
              return (
                <Chip key={c} pressed={capabilities.includes(c)} onClick={() => onToggle(c)}>
                  <Icon size={14} />
                  {CAPABILITIES.find((x) => x.id === c)?.label}
                </Chip>
              )
            })}
          </div>
        </fieldset>
      ) : null}

      {providers.length > 1 ? (
        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Provider
          </legend>
          <div className="flex flex-wrap gap-1.5">
            <Chip pressed={chosen.length === 0} onClick={() => onChosen([])}>
              All
            </Chip>
            {providers.map((p) => (
              <Chip
                key={p}
                pressed={chosen.includes(p)}
                onClick={() =>
                  onChosen(chosen.includes(p) ? chosen.filter((c) => c !== p) : [...chosen, p])
                }
              >
                {p}
              </Chip>
            ))}
          </div>
        </fieldset>
      ) : null}

      {browsing ? (
        <div className="flex gap-2">
          {chosen.length > 0 || capabilities.length > 0 ? (
            <SecondaryButton className="flex-1" onClick={onClear}>
              Clear
            </SecondaryButton>
          ) : null}
          <PrimaryButton className="flex-1" onClick={onDone}>
            {matches === undefined ? 'Show models' : `Show ${matches} models`}
          </PrimaryButton>
        </div>
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

function IconToggle({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string
  pressed: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'relative inline-flex size-11 shrink-0 items-center justify-center rounded-full',
        pressed ? 'bg-primary text-primary-foreground' : 'text-muted-foreground active:bg-muted',
      )}
    >
      {children}
    </button>
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
