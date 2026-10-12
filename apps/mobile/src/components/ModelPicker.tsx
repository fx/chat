/**
 * Pick a model from every endpoint at once: one list (each row says which
 * endpoint it is on, when there are several), a search field with the
 * common capability filters as icon toggles (tools, reasoning, vision), and
 * a filters panel behind a sliders button with every filter — endpoints,
 * providers, favorites and the same capabilities. Choosing a model binds to
 * its endpoint. Typing an id no endpoint lists is tucked away as an advanced
 * option (shown up front when nothing is listed). Shared by a conversation's
 * model sheet and the assistant settings.
 */
import type { ModelInfo } from '@fx/chat-agent'
import { cn } from '@fx/chat-shadcn'
import {
  Brain,
  ChevronLeft,
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

/** A listed model, with the endpoint (profile) that lists it. */
interface ModelEntry extends ModelInfo {
  profileId: string
}

/** One endpoint's listing as the picker has it. */
interface Listing {
  catalog?: ModelCatalog | undefined
  loading: boolean
  error?: string | undefined
}

const entryKey = (entry: { profileId: string; id: string }) => `${entry.profileId}\n${entry.id}`

const CAPABILITY_ICONS: Record<Capability, typeof Wrench> = {
  tools: Wrench,
  reasoning: Brain,
  vision: Eye,
}

/**
 * Every endpoint's cached listing, fetched where there is none or it is
 * old, while `active`; `refresh` fetches one again.
 */
function useListings(profiles: readonly Profile[], active: boolean) {
  const store = useStore()
  const [listings, setListings] = useState<Record<string, Listing>>({})
  const fetching = useRef(new Map<string, AbortController>())
  const update = useCallback(
    (id: string, patch: Partial<Listing>) =>
      setListings((all) => ({ ...all, [id]: { loading: false, ...all[id], ...patch } })),
    [],
  )

  const refresh = useCallback(
    (profile: Profile) => {
      fetching.current.get(profile.id)?.abort()
      const controller = new AbortController()
      fetching.current.set(profile.id, controller)
      update(profile.id, { loading: true, error: undefined })
      store.refreshModels(profile, controller.signal).then(
        (catalog) => {
          if (!controller.signal.aborted) update(profile.id, { catalog, loading: false })
        },
        (e: unknown) => {
          if (controller.signal.aborted) return
          update(profile.id, { loading: false, error: e instanceof Error ? e.message : String(e) })
        },
      )
    },
    [store, update],
  )

  // Only an endpoint's URL or key changes its listing, not other settings.
  const key = profiles.map((p) => `${p.id}\n${p.baseUrl}\n${p.apiKey}`).join('\n\n')
  const latest = useRef(profiles)
  latest.current = profiles
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for the profiles' endpoints
  useEffect(() => {
    if (!active) return
    let current = true
    const controllers = fetching.current
    setListings({})
    for (const profile of latest.current) {
      void store.cachedModels(profile).then((cached) => {
        if (!current) return
        if (cached) update(profile.id, { catalog: cached })
        if (!cached || Date.now() - cached.fetchedAt > CATALOG_MAX_AGE_MS) refresh(profile)
      })
    }
    return () => {
      current = false
      for (const controller of controllers.values()) controller.abort()
      controllers.clear()
    }
  }, [active, key, store, refresh, update])

  return { listings, refresh }
}

export function ModelPicker({
  profile,
  model,
  active = true,
  onChoose,
}: {
  /** The current endpoint, with `model` the current choice on it. */
  profile: Profile | undefined
  model: string | undefined
  /** List models only while shown (a closed sheet stays quiet). */
  active?: boolean
  onChoose: (choice: ModelChoice) => void
}) {
  const { settings } = useAppState()
  const store = useStore()
  const { profiles } = settings
  const { listings, refresh } = useListings(profiles, active)
  const [query, setQuery] = useState('')
  const [endpoints, setEndpoints] = useState<string[]>([])
  const [chosen, setChosen] = useState<string[]>([])
  const [capabilities, setCapabilities] = useState<Capability[]>([])
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  // While the search has focus it takes the whole row; a caret gives the
  // filter icons back (and leaves the search).
  const [searching, setSearching] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // One list across the chosen endpoints (all by default), by id.
  const listed = useMemo(() => {
    const order = new Map(profiles.map((p, i) => [p.id, i]))
    const entries: ModelEntry[] = []
    for (const p of profiles) {
      if (endpoints.length > 0 && !endpoints.includes(p.id)) continue
      for (const info of listings[p.id]?.catalog?.models ?? []) {
        entries.push({ ...info, profileId: p.id })
      }
    }
    return entries.sort(
      (a, b) =>
        a.id.localeCompare(b.id) ||
        (order.get(a.profileId) as number) - (order.get(b.profileId) as number),
    )
  }, [profiles, listings, endpoints])
  const providerList = useMemo(() => providers(listed), [listed])
  const capabilityList = useMemo(() => knownCapabilities(listed), [listed])
  const { favorites } = settings
  const shown = useMemo(
    () =>
      filterModels(listed, {
        query,
        providers: chosen,
        capabilities,
        favoritesOnly,
        isFavorite: (m) => favorites[m.profileId]?.includes(m.id) ?? false,
      }),
    [listed, query, chosen, capabilities, favoritesOnly, favorites],
  )
  const toggle = (capability: Capability) =>
    setCapabilities((on) =>
      on.includes(capability) ? on.filter((c) => c !== capability) : [...on, capability],
    )
  const filtering =
    query.trim() !== '' ||
    endpoints.length > 0 ||
    chosen.length > 0 ||
    capabilities.length > 0 ||
    favoritesOnly
  const panelCount = endpoints.length + chosen.length + (favoritesOnly ? 1 : 0)
  const current = profile && model ? entryKey({ profileId: profile.id, id: model }) : undefined
  const names = useMemo(
    () => (profiles.length > 1 ? new Map(profiles.map((p) => [p.id, p.name])) : undefined),
    [profiles],
  )

  const states = profiles
    .filter((p) => endpoints.length === 0 || endpoints.includes(p.id))
    .map((p) => ({ profile: p, listing: listings[p.id] }))
  const loading = states.some((s) => s.listing?.loading)
  const failed = states.filter((s) => s.listing?.error)
  const pending = states.some((s) => !s.listing?.catalog && !s.listing?.error)
  const fetchedAt = states
    .map((s) => s.listing?.catalog?.fetchedAt)
    .filter((t): t is number => t !== undefined)
  const oldest = fetchedAt.length > 0 ? Math.min(...fetchedAt) : undefined
  // Typing an id binds to the one endpoint in view, else the current one.
  const manualTarget =
    (endpoints.length === 1 ? profiles.find((p) => p.id === endpoints[0]) : undefined) ??
    profile ??
    profiles[0]

  if (profiles.length === 0) {
    return <p className="text-sm text-muted-foreground">Set up an endpoint in Settings first.</p>
  }

  if (filtersOpen) {
    return (
      <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <FiltersPanel
          profiles={profiles}
          endpoints={endpoints}
          onEndpoints={setEndpoints}
          providers={providerList}
          chosen={chosen}
          onChosen={setChosen}
          capabilityList={capabilityList}
          capabilities={capabilities}
          onToggle={toggle}
          favoritesOnly={favoritesOnly}
          onFavoritesOnly={setFavoritesOnly}
          onClear={() => {
            setEndpoints([])
            setChosen([])
            setCapabilities([])
            setFavoritesOnly(false)
          }}
          matches={shown.length}
          onDone={() => setFiltersOpen(false)}
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-1 border-b border-border pb-1">
        <div className="flex items-center">
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
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearching(true)}
              onBlur={() => setSearching(false)}
              className="min-h-11 w-full rounded-full border border-input bg-muted/40 pr-10 pl-9 text-base [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button
                type="button"
                aria-label="Clear search"
                // Keep the search focused (and expanded) through the tap.
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setQuery('')}
                className="absolute top-1/2 right-0 inline-flex size-11 -translate-y-1/2 items-center justify-center text-muted-foreground"
              >
                <X size={16} />
              </button>
            ) : null}
          </div>
          {searching ? (
            <button
              type="button"
              aria-label="Show filters"
              title="Show filters"
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => searchRef.current?.blur()}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
            >
              <ChevronLeft size={18} />
            </button>
          ) : (
            <>
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
                className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
              >
                <SlidersHorizontal size={18} />
                {panelCount > 0 ? (
                  <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[0.625rem] font-medium text-primary-foreground">
                    {panelCount}
                  </span>
                ) : null}
              </button>
            </>
          )}
        </div>
        <div className="flex items-center">
          <p
            aria-live="polite"
            className="min-w-0 flex-1 truncate px-3 text-xs text-muted-foreground"
          >
            {[
              endpoints.length > 0
                ? endpoints.length > 2
                  ? `${endpoints.length} endpoints`
                  : endpoints.map((id) => names?.get(id)).join(', ')
                : undefined,
              favoritesOnly ? 'favorites' : undefined,
              chosen.length > 2 ? `${chosen.length} providers` : chosen.join(', '),
              listed.length > 0 || !pending
                ? filtering
                  ? `${shown.length} of ${listed.length}`
                  : `${listed.length} models`
                : undefined,
              loading
                ? 'refreshing…'
                : oldest !== undefined
                  ? `updated ${ago(Date.now() - oldest)}`
                  : undefined,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <button
            type="button"
            aria-label="Refresh models"
            title="Refresh models"
            disabled={loading}
            onClick={() => {
              for (const s of states) refresh(s.profile)
            }}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted disabled:opacity-60"
          >
            <RefreshCw size={14} className={loading ? 'motion-safe:animate-spin' : undefined} />
          </button>
        </div>
        {failed.map(({ profile: p, listing }) => (
          <p key={p.id} className="flex items-center gap-1 px-3 text-xs text-destructive">
            <span className="min-w-0 flex-1 truncate" title={listing?.error}>
              Couldn’t list {p.name}: {listing?.error}
            </span>
            <button
              type="button"
              onClick={() => refresh(p)}
              className="min-h-9 shrink-0 px-2 font-medium underline-offset-4 active:underline"
            >
              Retry
            </button>
          </p>
        ))}
      </div>

      <ModelList
        models={shown}
        current={current}
        names={names}
        isFavorite={(m) => favorites[m.profileId]?.includes(m.id) ?? false}
        onChoose={(m) => onChoose({ profileId: m.profileId, model: m.id })}
        onToggleFavorite={(m) => void store.toggleFavorite(m.profileId, m.id)}
        resetKey={`${query}\n${endpoints.join()}\n${chosen.join()}\n${capabilities.join()}\n${favoritesOnly}`}
      >
        {listed.length === 0 && pending ? (
          <p className="px-1 pt-2 text-sm text-muted-foreground">Loading models…</p>
        ) : null}
        {listed.length === 0 && !pending && failed.length < states.length ? (
          <p className="px-1 pt-2 text-sm text-muted-foreground">No models listed.</p>
        ) : null}
        {listed.length > 0 && shown.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {favoritesOnly &&
            !shown.length &&
            !listed.some((m) => favorites[m.profileId]?.includes(m.id))
              ? 'No favorites yet. Star a model to keep it here.'
              : 'No models match.'}
          </p>
        ) : null}
        {manualTarget ? (
          <ManualModel
            open={listed.length === 0 && !pending}
            endpoint={profiles.length > 1 ? manualTarget.name : undefined}
            onUse={(id) => onChoose({ profileId: manualTarget.id, model: id })}
          />
        ) : null}
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
  names,
  isFavorite,
  onChoose,
  onToggleFavorite,
  resetKey,
  children,
}: {
  models: readonly ModelEntry[]
  /** The current model's `entryKey`. */
  current: string | undefined
  /** Endpoint names by profile id, when there are several to tell apart. */
  names: ReadonlyMap<string, string> | undefined
  isFavorite: (model: ModelEntry) => boolean
  onChoose: (model: ModelEntry) => void
  onToggleFavorite: (model: ModelEntry) => void
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
    const index = models.findIndex((m) => entryKey(m) === current)
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
              key={entryKey(m)}
              className="absolute inset-x-0"
              style={{ top: (first + i) * ROW_HEIGHT, height: ROW_HEIGHT }}
            >
              <ModelRow
                info={m}
                endpoint={names?.get(m.profileId)}
                selected={entryKey(m) === current}
                onChoose={() => onChoose(m)}
                favorite={isFavorite(m)}
                onToggleFavorite={() => onToggleFavorite(m)}
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
 * Every filter: endpoints, favorites and capabilities (also toggled beside
 * the search), and providers, so the count it shows is explained by what it
 * shows. Several endpoints or providers match any of them; none means all.
 */
function FiltersPanel({
  profiles,
  endpoints,
  onEndpoints,
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
  endpoints: readonly string[]
  onEndpoints: (ids: string[]) => void
  providers: readonly string[]
  chosen: readonly string[]
  onChosen: (providers: string[]) => void
  capabilityList: readonly Capability[]
  capabilities: readonly Capability[]
  onToggle: (capability: Capability) => void
  favoritesOnly: boolean
  onFavoritesOnly: (on: boolean) => void
  onClear: () => void
  matches: number
  onDone: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      {profiles.length > 1 ? (
        <ChipGroup
          legend="Endpoint"
          options={profiles.map((p) => ({ id: p.id, label: p.name }))}
          on={endpoints}
          onChange={onEndpoints}
        />
      ) : null}

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

      {providers.length > 1 ? (
        <ChipGroup
          legend="Provider"
          options={providers.map((p) => ({ id: p, label: p }))}
          on={chosen}
          onChange={onChosen}
        />
      ) : null}

      <div className="flex gap-2">
        {endpoints.length > 0 || chosen.length > 0 || capabilities.length > 0 || favoritesOnly ? (
          <SecondaryButton className="flex-1" onClick={onClear}>
            Clear
          </SecondaryButton>
        ) : null}
        <PrimaryButton className="flex-1" onClick={onDone}>
          {`Show ${matches} models`}
        </PrimaryButton>
      </div>
    </div>
  )
}

/** A multi-select chip group with "All" (none chosen) first. */
function ChipGroup({
  legend,
  options,
  on,
  onChange,
}: {
  legend: string
  options: readonly { id: string; label: string }[]
  on: readonly string[]
  onChange: (ids: string[]) => void
}) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {legend}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        <Chip pressed={on.length === 0} onClick={() => onChange([])}>
          All
        </Chip>
        {options.map((o) => (
          <Chip
            key={o.id}
            pressed={on.includes(o.id)}
            onClick={() =>
              onChange(on.includes(o.id) ? on.filter((x) => x !== o.id) : [...on, o.id])
            }
          >
            {o.label}
          </Chip>
        ))}
      </div>
    </fieldset>
  )
}

function ModelRow({
  info,
  endpoint,
  selected,
  onChoose,
  favorite,
  onToggleFavorite,
}: {
  info: ModelInfo
  /** The endpoint's name, when there are several. */
  endpoint: string | undefined
  selected: boolean
  onChoose: () => void
  favorite: boolean
  onToggleFavorite: () => void
}) {
  const facts = [
    endpoint,
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
        aria-label={`${favorite ? 'Unstar' : 'Star'} ${name}${endpoint ? ` on ${endpoint}` : ''}`}
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

/** Use an id no endpoint lists; collapsed unless there is no list to pick from. */
function ManualModel({
  open,
  endpoint,
  onUse,
}: {
  open: boolean
  /** The endpoint it binds to, named when there are several. */
  endpoint: string | undefined
  onUse: (id: string) => void
}) {
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
        placeholder={endpoint ? `Model id on ${endpoint}` : 'Type a model id'}
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
        'relative inline-flex size-10 shrink-0 items-center justify-center rounded-full',
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
