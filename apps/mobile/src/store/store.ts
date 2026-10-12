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
  type Profile,
  type Settings,
} from './types'

const SETTINGS_KEY = 'settings'

/** How often streamed updates reach the transcript, at most (ms). */
export const UPDATE_INTERVAL_MS = 50

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
      assistant: { ...DEFAULT_SETTINGS.assistant, ...settings?.assistant },
    }
    this.settingsLoaded = true
    this.publish()
  }

  // ── settings & profiles ────────────────────────────────────────────────────

  async updateSettings(patch: Partial<Settings>): Promise<void> {
    this.settings = { ...this.settings, ...patch }
    this.publish()
    await this.deps.kv.set(SETTINGS_KEY, this.settings)
  }

  activeProfile(): Profile | undefined {
    const { profiles, activeProfileId } = this.settings
    return profiles.find((p) => p.id === activeProfileId) ?? profiles[0]
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
    if (profile) {
      return meta.model || profile.model ? undefined : 'Choose a model from the model menu first.'
    }
    if (this.settings.profiles.length === 0) {
      return 'Set up an endpoint and model in Settings first.'
    }
    return meta.profileId === undefined
      ? 'Choose a profile for this conversation from the model menu.'
      : "This conversation's profile is unavailable. Choose another from the model menu."
  }

  private resolveRun(meta: ConversationMeta): RunResolution {
    const blocked = this.runBlocker(meta)
    if (blocked) return { blocked }
    // Not blocked: the profile exists and a model is set.
    const profile = this.conversationProfile(meta) as Profile
    return {
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKey || undefined,
      model: meta.model || profile.model,
      system: this.settings.systemPrompt,
      tools: this.settings.tools,
      approvals: this.settings.approvals,
    }
  }

  /** Insert or replace a profile; the first profile becomes active. */
  async saveProfile(profile: Profile): Promise<void> {
    const profiles = this.settings.profiles.some((p) => p.id === profile.id)
      ? this.settings.profiles.map((p) => (p.id === profile.id ? profile : p))
      : [...this.settings.profiles, profile]
    await this.updateSettings({
      profiles,
      activeProfileId: this.settings.activeProfileId ?? profile.id,
    })
  }

  async deleteProfile(id: string): Promise<void> {
    const profiles = this.settings.profiles.filter((p) => p.id !== id)
    const activeProfileId =
      this.settings.activeProfileId === id ? profiles[0]?.id : this.settings.activeProfileId
    const { assistant } = this.settings
    await this.updateSettings({
      profiles,
      activeProfileId,
      assistant: assistant.profileId === id ? {} : assistant,
    })
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

  /** List a profile's models with what each declares (name, context, capabilities). */
  listModelInfo(
    profile: Pick<Profile, 'baseUrl' | 'apiKey'>,
    signal?: AbortSignal,
  ): Promise<ModelInfo[]> {
    return createClient({
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKey || undefined,
      fetch: this.deps.fetch,
    }).listModelInfo(signal)
  }

  // ── conversations (the controller's) ───────────────────────────────────────

  conversation(id: string): ConversationMeta | undefined {
    return this.chat.conversation(id)
  }

  /** Start a conversation bound to the active profile and its model. */
  createConversation(): Promise<ConversationMeta> {
    const profile = this.activeProfile()
    return this.chat.createConversation({ profileId: profile?.id, model: profile?.model })
  }

  /** The endpoint and model the assistant runs on (see `AssistantSettings`). */
  assistantModel(): { profile: Profile; model: string } | undefined {
    const { profileId, model } = this.settings.assistant
    const bound = this.settings.profiles.find((p) => p.id === profileId)
    if (bound) return { profile: bound, model: model || bound.model }
    const active = this.activeProfile()
    return active && { profile: active, model: active.model }
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
