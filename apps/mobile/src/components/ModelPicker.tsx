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
import {
  Brain,
  Check,
  Eye,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
  Wrench,
  X,
} from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppState, useStore } from '../store/context'
import { CATALOG_MAX_AGE_MS, type ModelCatalog } from '../store/store'
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
  const [catalog, setCatalog] = useState<ModelCatalog>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<string[]>([])
  const [capabilities, setCapabilities] = useState<Capability[]>([])
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const fetching = useRef<AbortController | null>(null)

  useEffect(() => setBrowseId(profile?.id), [profile?.id])

  const refresh = useCallback(
    (target: Profile) => {
      fetching.current?.abort()
      const controller = new AbortController()
      fetching.current = controller
      setLoading(true)
      setError(undefined)
      store
        .refreshModels(target, controller.signal)
        .then((fresh) => {
          if (!controller.signal.aborted) setCatalog(fresh)
        })
        .catch((e: unknown) => {
          if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e))
        })
        .finally(() => {
          if (fetching.current === controller) setLoading(false)
        })
    },
    [store],
  )

  // Show the cached listing at once; fetch when there is none or it is old.
  useEffect(() => {
    if (!active || !browsing) return
    let current = true
    setError(undefined)
    // Never offer the previous endpoint's models (or its providers) under this one.
    setCatalog(undefined)
    setChosen([])
    void store.cachedModels(browsing).then((cached) => {
      if (!current) return
      if (cached) setCatalog(cached)
      if (!cached || Date.now() - cached.fetchedAt > CATALOG_MAX_AGE_MS) refresh(browsing)
    })
    return () => {
      current = false
      fetching.current?.abort()
    }
  }, [active, browsing, store, refresh])

  const models = catalog?.models
  const listed = useMemo(() => models ?? [], [models])
  const providerList = useMemo(() => providers(listed), [listed])
  const capabilityList = useMemo(() => knownCapabilities(listed), [listed])
  const starred = browsing ? settings.favorites[browsing.id] : undefined
  const favorites = useMemo(() => new Set(starred), [starred])
  const shown = useMemo(
    () =>
      filterModels(listed, { query, providers: chosen, capabilities, favorites, favoritesOnly }),
    [listed, query, chosen, capabilities, favorites, favoritesOnly],
  )
  const toggle = (capability: Capability) =>
    setCapabilities((on) =>
      on.includes(capability) ? on.filter((c) => c !== capability) : [...on, capability],
    )
  const choose = (id: string) => browsing && onChoose({ profileId: browsing.id, model: id })
  const filtering =
    query.trim() !== '' || chosen.length > 0 || capabilities.length > 0 || favoritesOnly
  const current = browsing?.id === profile?.id ? model : undefined
  const panelCount = chosen.length + (browsing && browsing.id !== profile?.id ? 1 : 0)

  if (filtersOpen || !browsing) {
    return (
      <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4 pb-4">
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
          favoritesOnly={favoritesOnly}
          onFavoritesOnly={setFavoritesOnly}
          onClear={() => {
            setChosen([])
            setCapabilities([])
            setFavoritesOnly(false)
          }}
          matches={browsing ? shown.length : undefined}
          onDone={() => setFiltersOpen(false)}
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-1 border-b border-border pb-1">
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
          <IconToggle
            label="Favorites"
            pressed={favoritesOnly}
            onClick={() => setFavoritesOnly((on) => !on)}
          >
            <Star size={18} className={favoritesOnly ? 'fill-current' : undefined} />
          </IconToggle>
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
        <div className="flex items-center">
          <p
            aria-live="polite"
            className="min-w-0 flex-1 truncate px-3 text-xs text-muted-foreground"
          >
            {[
              settings.profiles.length > 1 ? browsing.name : undefined,
              chosen.length > 2 ? `${chosen.length} providers` : chosen.join(', '),
              models
                ? filtering
                  ? `${shown.length} of ${listed.length}`
                  : `${listed.length} models`
                : undefined,
              catalog && !loading ? `updated ${ago(Date.now() - catalog.fetchedAt)}` : undefined,
              loading && catalog ? 'refreshing…' : undefined,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <button
            type="button"
            aria-label="Refresh models"
            title="Refresh models"
            disabled={loading}
            onClick={() => refresh(browsing)}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted disabled:opacity-60"
          >
            <RefreshCw size={14} className={loading ? 'motion-safe:animate-spin' : undefined} />
          </button>
        </div>
      </div>

      <ModelList
        models={shown}
        current={current}
        onChoose={choose}
        favorites={favorites}
        onToggleFavorite={(id) => void store.toggleFavorite(browsing.id, id)}
        resetKey={`${query}\n${chosen.join()}\n${capabilities.join()}\n${favoritesOnly}`}
      >
        {error ? <p className="px-1 pt-2 text-xs text-destructive">{error}</p> : null}
        {models === undefined && !error ? (
          <p className="px-1 pt-2 text-sm text-muted-foreground">Loading models…</p>
        ) : null}
        {models?.length === 0 ? (
          <p className="px-1 pt-2 text-sm text-muted-foreground">The endpoint lists no models.</p>
        ) : null}
        {models && models.length > 0 && shown.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {favoritesOnly && favorites.size === 0
              ? 'No favorites yet. Star a model to keep it here.'
              : 'No models match.'}
          </p>
        ) : null}
        <ManualModel open={Boolean(error) || models?.length === 0} onUse={(id) => choose(id)} />
      </ModelList>
    </div>
  )
}

/** "just now", "5m ago", "3h ago", "2d ago". */
export function ago(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`
}

/** Every row is this tall (px), so the list can draw only the rows in view. */
export const ROW_HEIGHT = 56
/** Rows drawn beyond each edge of the view. */
const OVERSCAN = 8
/** The view height assumed before it is measured. */
const FALLBACK_HEIGHT = 800

/**
 * The models as a windowed list: a full-height track with only the rows in
 * (or near) view drawn into it. It owns the scrolling, so nothing slides
 * under the search above it. Opens at the current model; a new filter
 * (`resetKey`) goes back to the top. `children` follow the list.
 */
function ModelList({
  models,
  current,
  onChoose,
  favorites,
  onToggleFavorite,
  resetKey,
  children,
}: {
  models: readonly ModelInfo[]
  current: string | undefined
  onChoose: (id: string) => void
  favorites: ReadonlySet<string>
  onToggleFavorite: (id: string) => void
  resetKey: string
  children: ReactNode
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ top: 0, height: FALLBACK_HEIGHT })

  const measure = useCallback(() => {
    const el = scroller.current as HTMLDivElement
    const next = { top: el.scrollTop, height: el.clientHeight || FALLBACK_HEIGHT }
    // Re-render only when the drawn range changes, not on every scrolled pixel.
    setView((prev) =>
      Math.floor(prev.top / ROW_HEIGHT) === Math.floor(next.top / ROW_HEIGHT) &&
      prev.height === next.height
        ? prev
        : next,
    )
  }, [])

  useEffect(() => {
    const el = scroller.current as HTMLDivElement
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [measure])

  // Open at the current model: it may be far down a long list.
  const opened = useRef(false)
  useEffect(() => {
    if (opened.current || models.length === 0) return
    opened.current = true
    const index = models.findIndex((m) => m.id === current)
    const el = scroller.current as HTMLDivElement
    if (index > 0) el.scrollTop = index * ROW_HEIGHT - (el.clientHeight - ROW_HEIGHT) / 2
    measure()
  }, [models, current, measure])

  // A new search or filter starts from the top.
  const lastKey = useRef(resetKey)
  useEffect(() => {
    if (lastKey.current === resetKey) return
    lastKey.current = resetKey
    ;(scroller.current as HTMLDivElement).scrollTop = 0
    measure()
  }, [resetKey, measure])

  const first = Math.max(0, Math.floor(view.top / ROW_HEIGHT) - OVERSCAN)
  const last = Math.min(models.length, Math.ceil((view.top + view.height) / ROW_HEIGHT) + OVERSCAN)

  return (
    <div
      ref={scroller}
      onScroll={measure}
      className="-mx-4 min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-1 pb-4"
    >
      {models.length > 0 ? (
        <ul aria-label="Models" className="relative" style={{ height: models.length * ROW_HEIGHT }}>
          {models.slice(first, last).map((m, i) => (
            <li
              key={m.id}
              className="absolute inset-x-0"
              style={{ top: (first + i) * ROW_HEIGHT, height: ROW_HEIGHT }}
            >
              <ModelRow
                info={m}
                selected={m.id === current}
                onChoose={() => onChoose(m.id)}
                favorite={favorites.has(m.id)}
                onToggleFavorite={() => onToggleFavorite(m.id)}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {children}
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
  favoritesOnly,
  onFavoritesOnly,
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
  favoritesOnly: boolean
  onFavoritesOnly: (on: boolean) => void
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

      {browsing ? (
        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Show
          </legend>
          <div className="flex flex-wrap gap-1.5">
            <Chip pressed={favoritesOnly} onClick={() => onFavoritesOnly(!favoritesOnly)}>
              <Star size={14} className={favoritesOnly ? 'fill-current' : undefined} />
              Favorites
            </Chip>
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
          {chosen.length > 0 || capabilities.length > 0 || favoritesOnly ? (
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
  favorite,
  onToggleFavorite,
}: {
  info: ModelInfo
  selected: boolean
  onChoose: () => void
  favorite: boolean
  onToggleFavorite: () => void
}) {
  const facts = [
    info.name ? info.id : undefined,
    info.contextLength && formatContext(info.contextLength),
  ]
    .filter(Boolean)
    .join(' · ')
  const caps = CAPABILITIES.filter((c) => declares(info, c.id))
  const name = info.name ?? info.id
  return (
    <div
      className={cn('flex h-14 items-center rounded-lg', selected && 'bg-muted')}
      data-selected={selected || undefined}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={onChoose}
        className="flex h-full min-w-0 flex-1 items-center gap-3 rounded-lg pl-3 text-left active:bg-muted"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{name}</span>
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
      <button
        type="button"
        aria-label={favorite ? `Unstar ${name}` : `Star ${name}`}
        aria-pressed={favorite}
        onClick={onToggleFavorite}
        className={cn(
          'inline-flex size-11 shrink-0 items-center justify-center rounded-full active:bg-muted',
          favorite ? 'text-amber-500' : 'text-muted-foreground/50',
        )}
      >
        <Star size={16} className={favorite ? 'fill-current' : undefined} />
      </button>
    </div>
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
