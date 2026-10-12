/**
 * Search and filter a model listing by what models declare about themselves
 * (see `ModelInfo`): the provider in the id (or its owner), and capabilities
 * from the standard listing fields. Models that declare nothing only match
 * when no capability filter is on.
 */
import type { ModelInfo } from '@fx/chat-agent'

export type Capability = 'tools' | 'reasoning' | 'vision'

export const CAPABILITIES: { id: Capability; label: string }[] = [
  { id: 'tools', label: 'Tools' },
  { id: 'reasoning', label: 'Reasoning' },
  { id: 'vision', label: 'Vision' },
]

/** Whether a model declares a capability: true or false, undefined when it does not say. */
export function declares(model: ModelInfo, capability: Capability): boolean | undefined {
  if (capability === 'vision') return model.inputModalities?.includes('image')
  const params = model.supportedParameters
  if (!params) return undefined
  return capability === 'tools'
    ? params.includes('tools')
    : params.includes('reasoning') || params.includes('include_reasoning')
}

/** The id's first path segment (`openrouter/x/y` → `openrouter`), else its owner. */
export function providerOf(model: ModelInfo): string | undefined {
  const slash = model.id.indexOf('/')
  return slash > 0 ? model.id.slice(0, slash) : model.ownedBy
}

/** Distinct providers, by how many models each has, most first. */
export function providers(models: readonly ModelInfo[]): string[] {
  const counts = new Map<string, number>()
  for (const model of models) {
    const provider = providerOf(model)
    if (provider) counts.set(provider, (counts.get(provider) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([p]) => p)
}

/** The capabilities at least one model declares (the rest are not worth a filter). */
export function knownCapabilities(models: readonly ModelInfo[]): Capability[] {
  return CAPABILITIES.map((c) => c.id).filter((c) =>
    models.some((m) => declares(m, c) !== undefined),
  )
}

export interface ModelFilter {
  query: string
  /** Any of these providers; none means all. */
  providers?: readonly string[] | undefined
  capabilities: readonly Capability[]
  /** Starred model ids: listed first. */
  favorites?: ReadonlySet<string> | undefined
  /** Only the starred models. */
  favoritesOnly?: boolean | undefined
}

/**
 * The models matching every search term (in the id or name), any chosen
 * provider, all capabilities and (when asked) the favorites; favorites first.
 */
export function filterModels(models: readonly ModelInfo[], filter: ModelFilter): ModelInfo[] {
  const terms = filter.query.toLowerCase().split(/\s+/).filter(Boolean)
  const favorites = filter.favorites ?? new Set<string>()
  const matches = models.filter((model) => {
    if (filter.favoritesOnly && !favorites.has(model.id)) return false
    const chosen = filter.providers
    if (chosen?.length && !chosen.includes(providerOf(model) as string)) return false
    if (filter.capabilities.some((c) => !declares(model, c))) return false
    const haystack = `${model.id} ${model.name ?? ''}`.toLowerCase()
    return terms.every((term) => haystack.includes(term))
  })
  if (favorites.size === 0) return matches
  return [
    ...matches.filter((m) => favorites.has(m.id)),
    ...matches.filter((m) => !favorites.has(m.id)),
  ]
}

/** A context window in short form: `8K`, `131K`, `1M`, `1.5M`. */
export function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${Number((tokens / 1_000_000).toFixed(1))}M`
  return `${Math.max(1, Math.round(tokens / 1000))}K`
}
