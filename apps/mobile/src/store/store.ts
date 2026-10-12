import {
  ChatController,
  type FetchLike,
  type KeyValueStore,
  type ModelInfo,
  type RunResolution,
  type RunResult,
  createClient,
  type runAgent,
} from '@fx/chat-agent'
/**
 * The app store: settings and endpoint profiles on top of `@fx/chat-agent`'s
 * `ChatController`, which owns conversations, transcripts, runs and the
 * tool-approval queue. Both persist to the same key-value store.
 *
 * Framework-free (subscribe / getState) so it is testable without React; the
 * UI binds to it with `useSyncExternalStore`.
 */
import type { ChatMessage } from '@fx/chat-core'
import {
  type AppState,
  type ConversationMeta,
  DEFAULT_SETTINGS,
  type ModelRef,
  type Profile,
  type Settings,
} from './types'

const SETTINGS_KEY = 'settings'

/** How often streamed updates reach the transcript, at most (ms). */
export const UPDATE_INTERVAL_MS = 50

/** A profile's model listing, as last fetched. */
export interface ModelCatalog {
  models: ModelInfo[]
  fetchedAt: number
}

/** How long a cached listing is used before the picker fetches it again (ms). */
export const CATALOG_MAX_AGE_MS = 24 * 60 * 60 * 1000

/** A cached listing, tied to the URL and key it came from. */
interface StoredCatalog extends ModelCatalog {
  endpoint: string
}

/** A model on an enabled endpoint. */
export interface ModelTarget {
  profile: Profile
  model: string
}

/**
 * Settings from before the default model: one endpoint was "active", with
 * its own default model, and the assistant's choice could name only an
 * endpoint. The active endpoint's model becomes the default model.
 */
export function migrate(settings: Settings): Settings {
  const { activeProfileId, ...rest } = settings
  const modelOf = (id: string | undefined) => settings.profiles.find((p) => p.id === id)?.model
  const active = settings.profiles.find((p) => p.id === activeProfileId) ?? settings.profiles[0]
  const { assistant } = settings
  return {
    ...rest,
    profiles: settings.profiles.map(({ model: _legacy, ...profile }) => profile),
    defaultModel:
      settings.defaultModel ??
      (active?.model ? { profileId: active.id, model: active.model } : undefined),
    assistant:
      assistant.profileId && !assistant.model
        ? { ...assistant, model: modelOf(assistant.profileId) }
        : assistant,
  }
}

/** Whether stored settings are in the shape from before the default model. */
export function isLegacy(settings: Settings): boolean {
  return 'activeProfileId' in settings || settings.profiles.some((p) => 'model' in p)
}

const catalogKey = (profileId: string) => `models:${profileId}`

/** The endpoint a listing belongs to: its URL and a hash of its key (not the key). */
function endpointOf(profile: Pick<Profile, 'baseUrl' | 'apiKey'>): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < profile.apiKey.length; i++) {
    hash = Math.imul(hash ^ profile.apiKey.charCodeAt(i), 0x01000193)
  }
  return `${profile.baseUrl}\n${(hash >>> 0).toString(16)}`
}

export interface StoreDeps {
  kv: KeyValueStore
  fetch: FetchLike
  now?: () => number
  /** HTML-to-text for the fetch tool (the webview passes a DOM-based one). */
  htmlToText?: (html: string) => string
  /** Injectable for tests. */
  run?: typeof runAgent
  /** Streamed-update interval; tests pass 0 to apply every chunk at once. */
  updateIntervalMs?: number
}

export class AppStore {
  private readonly chat: ChatController<ConversationMeta>
  private settings: Settings = DEFAULT_SETTINGS
  private settingsLoaded = false
  private state: AppState
  private listeners = new Set<() => void>()
  private catalogs = new Map<string, StoredCatalog>()

  constructor(private readonly deps: StoreDeps) {
    this.chat = new ChatController<ConversationMeta>({
      kv: deps.kv,
      fetch: deps.fetch,
      now: deps.now,
      htmlToText: deps.htmlToText,
      run: deps.run,
      resolveRun: (meta) => this.resolveRun(meta),
      // Streamed chunks arrive far faster than a phone needs to repaint the
      // transcript; apply them at most every UPDATE_INTERVAL_MS.
      updateIntervalMs: deps.updateIntervalMs ?? UPDATE_INTERVAL_MS,
    })
    this.state = this.compose()
    this.chat.subscribe(() => this.publish())
  }

  // ── subscription ───────────────────────────────────────────────────────────

  getState = (): AppState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private compose(): AppState {
    const chat = this.chat.getState()
    return { ...chat, loaded: chat.loaded && this.settingsLoaded, settings: this.settings }
  }

  private publish(): void {
    this.state = this.compose()
    for (const listener of this.listeners) listener()
  }

  async load(): Promise<void> {
    const [settings] = await Promise.all([
      this.deps.kv.get<Settings>(SETTINGS_KEY),
      this.chat.load(),
    ])
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...settings,
      tools: { ...DEFAULT_SETTINGS.tools, ...settings?.tools },
      approvals: { ...DEFAULT_SETTINGS.approvals, ...settings?.approvals },
      favorites: { ...DEFAULT_SETTINGS.favorites, ...settings?.favorites },
      assistant: { ...DEFAULT_SETTINGS.assistant, ...settings?.assistant },
    }
    const legacy = isLegacy(this.settings)
    this.settings = migrate(this.settings)
    this.settingsLoaded = true
    this.publish()
    if (legacy) {
      // Store the migrated shape so the legacy fields are gone for good. A
      // failed write is not fatal: the app runs on the migrated settings, and
      // the next load migrates again.
      await this.deps.kv.set(SETTINGS_KEY, this.settings).catch(() => undefined)
    }
  }

  // ── settings & profiles ────────────────────────────────────────────────────

  async updateSettings(patch: Partial<Settings>): Promise<void> {
    this.settings = { ...this.settings, ...patch }
    this.publish()
    await this.deps.kv.set(SETTINGS_KEY, this.settings)
  }

  /** A model on an enabled endpoint, or undefined. */
  private resolve(
    ref: { profileId?: string | undefined; model?: string | undefined } | undefined,
  ): ModelTarget | undefined {
    const profile = this.settings.profiles.find((p) => p.id === ref?.profileId && !p.disabled)
    return profile && ref?.model ? { profile, model: ref.model } : undefined
  }

  /** What new chats start on: the default model, unless its endpoint is gone or disabled. */
  defaultModel(): ModelTarget | undefined {
    return this.resolve(this.settings.defaultModel)
  }

  setDefaultModel(choice: ModelRef): Promise<void> {
    return this.updateSettings({ defaultModel: choice })
  }

  /**
   * The profile a conversation is bound to. Never another profile: a
   * conversation's transcript only ever goes to the endpoint it was bound to,
   * so a deleted or missing binding resolves to nothing, not the active one.
   */
  conversationProfile(meta: ConversationMeta): Profile | undefined {
    if (meta.profileId === undefined) return undefined
    return this.settings.profiles.find((p) => p.id === meta.profileId)
  }

  /** Why a run cannot start for this conversation, or undefined when it can. */
  runBlocker(meta: ConversationMeta): string | undefined {
    const profile = this.conversationProfile(meta)
    if (profile) return meta.model ? undefined : 'Choose a model from the model menu first.'
    if (this.settings.profiles.length === 0) return 'Set up an endpoint in Settings first.'
    return meta.profileId === undefined
      ? 'Choose a model from the model menu first.'
      : "This conversation's profile is unavailable. Choose another model from the model menu."
  }

  private resolveRun(meta: ConversationMeta): RunResolution {
    const blocked = this.runBlocker(meta)
    if (blocked) return { blocked }
    // Not blocked: the profile exists and a model is set.
    const profile = this.conversationProfile(meta) as Profile
    return {
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKey || undefined,
      model: meta.model as string,
      system: this.settings.systemPrompt,
      tools: this.settings.tools,
      approvals: this.settings.approvals,
    }
  }

  /** Insert or replace a profile. */
  async saveProfile(profile: Profile): Promise<void> {
    const profiles = this.settings.profiles.some((p) => p.id === profile.id)
      ? this.settings.profiles.map((p) => (p.id === profile.id ? profile : p))
      : [...this.settings.profiles, profile]
    await this.updateSettings({ profiles })
  }

  async deleteProfile(id: string): Promise<void> {
    const profiles = this.settings.profiles.filter((p) => p.id !== id)
    const { assistant, defaultModel } = this.settings
    const { [id]: _dropped, ...favorites } = this.settings.favorites
    await this.updateSettings({
      profiles,
      defaultModel: defaultModel?.profileId === id ? undefined : defaultModel,
      assistant: assistant.profileId === id ? {} : assistant,
      favorites,
    })
    this.catalogs.delete(id)
    await this.deps.kv.delete(catalogKey(id))
  }

  /** Disable an endpoint (or enable it again). */
  setProfileDisabled(id: string, disabled: boolean): Promise<void> {
    return this.updateSettings({
      profiles: this.settings.profiles.map((p) =>
        p.id === id ? { ...p, disabled: disabled || undefined } : p,
      ),
    })
  }

  /** Star or unstar a model of a profile's endpoint. */
  toggleFavorite(profileId: string, model: string): Promise<void> {
    const starred = this.settings.favorites[profileId] ?? []
    const next = starred.includes(model) ? starred.filter((m) => m !== model) : [...starred, model]
    return this.updateSettings({ favorites: { ...this.settings.favorites, [profileId]: next } })
  }

  /** List models offered by a profile's endpoint. */
  listModels(
    profile: Pick<Profile, 'baseUrl' | 'apiKey'>,
    signal?: AbortSignal,
  ): Promise<string[]> {
    return createClient({
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKey || undefined,
      fetch: this.deps.fetch,
    }).listModels(signal)
  }

  /**
   * A profile's last fetched model listing (memory, then storage), or
   * undefined when there is none for its current URL and key.
   */
  async cachedModels(profile: Profile): Promise<ModelCatalog | undefined> {
    let entry = this.catalogs.get(profile.id)
    if (!entry) {
      entry = await this.deps.kv.get<StoredCatalog>(catalogKey(profile.id))
      if (entry) this.catalogs.set(profile.id, entry)
    }
    if (entry?.endpoint !== endpointOf(profile)) return undefined
    return { models: entry.models, fetchedAt: entry.fetchedAt }
  }

  /** Fetch a profile's model listing (with what each model declares) and cache it. */
  async refreshModels(profile: Profile, signal?: AbortSignal): Promise<ModelCatalog> {
    const models = await createClient({
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKey || undefined,
      fetch: this.deps.fetch,
    }).listModelInfo(signal)
    const catalog = { models, fetchedAt: (this.deps.now ?? Date.now)() }
    const entry = { ...catalog, endpoint: endpointOf(profile) }
    this.catalogs.set(profile.id, entry)
    await this.deps.kv.set(catalogKey(profile.id), entry)
    return catalog
  }

  // ── conversations (the controller's) ───────────────────────────────────────

  conversation(id: string): ConversationMeta | undefined {
    return this.chat.conversation(id)
  }

  /** Start a conversation on the default model (or none, to choose). */
  createConversation(): Promise<ConversationMeta> {
    const target = this.defaultModel()
    return this.chat.createConversation({ profileId: target?.profile.id, model: target?.model })
  }

  /**
   * Put a conversation on a model (and its endpoint). With no default model
   * yet, the first one chosen becomes it.
   */
  async chooseModel(id: string, choice: ModelRef): Promise<void> {
    await this.updateConversation(id, choice)
    if (!this.defaultModel()) await this.setDefaultModel(choice)
  }

  /** The endpoint and model the assistant runs on (see `AssistantSettings`). */
  assistantModel(): ModelTarget | undefined {
    return this.resolve(this.settings.assistant) ?? this.defaultModel()
  }

  /**
   * Whether the assistant runs on what new chats do (the default model): by
   * default, or because its own choice is the same.
   */
  assistantMatchesNewChats(): boolean {
    const target = this.assistantModel()
    const fallback = this.defaultModel()
    return target?.profile.id === fallback?.profile.id && target?.model === fallback?.model
  }

  /**
   * Run the assistant on this endpoint and model. The same as new chats
   * stores no choice, so the assistant keeps following new chats.
   */
  setAssistantModel(choice: ModelRef): Promise<void> {
    const fallback = this.defaultModel()
    const same = choice.profileId === fallback?.profile.id && choice.model === fallback.model
    return this.updateSettings({ assistant: same ? {} : choice })
  }

  /** Start a conversation for a prompt spoken to the assistant. */
  createAssistantConversation(): Promise<ConversationMeta> {
    const target = this.assistantModel()
    return this.chat.createConversation({ profileId: target?.profile.id, model: target?.model })
  }

  openConversation(id: string): Promise<void> {
    return this.chat.openConversation(id)
  }

  updateConversation(id: string, patch: Partial<Omit<ConversationMeta, 'id'>>): Promise<void> {
    return this.chat.updateConversation(id, patch)
  }

  deleteConversation(id: string): Promise<void> {
    return this.chat.deleteConversation(id)
  }

  send(
    id: string,
    text: string,
    attachments?: ChatMessage['attachments'],
  ): Promise<RunResult | undefined> {
    return this.chat.send(id, text, attachments)
  }

  regenerate(id: string, messageId?: string): Promise<RunResult | undefined> {
    return this.chat.regenerate(id, messageId)
  }

  stop(id: string): void {
    this.chat.stop(id)
  }

  flush(id: string): Promise<void> {
    return this.chat.flush(id)
  }
}
