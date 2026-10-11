import { type FetchLike, type RunResult, buildTools, createClient, runAgent } from '@fx/chat-agent'
/**
 * The app store: settings, conversations, transcripts, active runs, and the
 * tool-approval queue, persisted to a key-value store.
 *
 * Framework-free (subscribe / getState) so it is testable without React; the
 * UI binds to it with `useSyncExternalStore`.
 */
import type { ChatMessage, ToolCallBlock } from '@fx/chat-core'
import type { KeyValueStore } from '../platform/storage'
import {
  type AppState,
  type ConversationMeta,
  DEFAULT_SETTINGS,
  type PendingApproval,
  type Profile,
  type Settings,
} from './types'

const SETTINGS_KEY = 'settings'
const CONVERSATIONS_KEY = 'conversations'
const messagesKey = (id: string) => `messages:${id}`
const SAVE_DELAY_MS = 400
const TITLE_LENGTH = 48

/** A random id that does not need a secure context. */
export function newId(prefix = ''): string {
  const random = Math.random().toString(36).slice(2, 10)
  return `${prefix}${Date.now().toString(36)}${random}`
}

/** A conversation title from the first user message. */
export function titleFrom(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim()
  if (!line) return 'New chat'
  return line.length > TITLE_LENGTH ? `${line.slice(0, TITLE_LENGTH - 1).trimEnd()}…` : line
}

/** Tool calls left running when the app was killed can never finish. */
function settleInterrupted(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) =>
    message.blocks.some(
      (b) => b.type === 'tool_call' && (b.status === 'pending' || b.status === 'running'),
    )
      ? {
          ...message,
          blocks: message.blocks.map((b) =>
            b.type === 'tool_call' && (b.status === 'pending' || b.status === 'running')
              ? { ...b, status: 'error' as const, result: b.result ?? { error: 'Interrupted.' } }
              : b,
          ),
        }
      : message,
  )
}

export interface StoreDeps {
  kv: KeyValueStore
  fetch: FetchLike
  now?: () => number
  /** HTML-to-text for the fetch tool (the webview passes a DOM-based one). */
  htmlToText?: (html: string) => string
  /** Injectable for tests. */
  run?: typeof runAgent
}

export class AppStore {
  private state: AppState = {
    loaded: false,
    settings: DEFAULT_SETTINGS,
    conversations: [],
    messages: {},
    runs: {},
    errors: {},
    approvals: [],
  }
  private listeners = new Set<() => void>()
  private controllers = new Map<string, AbortController>()
  private saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
  /**
   * Conversations deleted this session. A run, load or save still in flight
   * when its conversation is deleted must not bring it back in memory or in
   * storage, so every write path checks this set.
   */
  private deleted = new Set<string>()
  private readonly now: () => number
  private readonly run: typeof runAgent

  constructor(private readonly deps: StoreDeps) {
    this.now = deps.now ?? Date.now
    this.run = deps.run ?? runAgent
  }

  // ── subscription ───────────────────────────────────────────────────────────

  getState = (): AppState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private set(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  // ── loading ────────────────────────────────────────────────────────────────

  async load(): Promise<void> {
    const [settings, conversations] = await Promise.all([
      this.deps.kv.get<Settings>(SETTINGS_KEY),
      this.deps.kv.get<ConversationMeta[]>(CONVERSATIONS_KEY),
    ])
    this.set({
      loaded: true,
      settings: {
        ...DEFAULT_SETTINGS,
        ...settings,
        tools: { ...DEFAULT_SETTINGS.tools, ...settings?.tools },
        approvals: { ...DEFAULT_SETTINGS.approvals, ...settings?.approvals },
      },
      conversations: [...(conversations ?? [])].sort((a, b) => b.updatedAt - a.updatedAt),
    })
  }

  /** Load a conversation's transcript if not loaded yet. */
  async openConversation(id: string): Promise<void> {
    if (this.state.messages[id]) return
    const stored = (await this.deps.kv.get<ChatMessage[]>(messagesKey(id))) ?? []
    if (this.state.messages[id] || this.deleted.has(id)) return
    this.set({ messages: { ...this.state.messages, [id]: settleInterrupted(stored) } })
  }

  // ── settings & profiles ────────────────────────────────────────────────────

  async updateSettings(patch: Partial<Settings>): Promise<void> {
    this.set({ settings: { ...this.state.settings, ...patch } })
    await this.deps.kv.set(SETTINGS_KEY, this.state.settings)
  }

  activeProfile(): Profile | undefined {
    const { profiles, activeProfileId } = this.state.settings
    return profiles.find((p) => p.id === activeProfileId) ?? profiles[0]
  }

  /**
   * The profile a conversation is bound to. Never another profile: a
   * conversation's transcript only ever goes to the endpoint it was bound to,
   * so a deleted or missing binding resolves to nothing, not the active one.
   */
  conversationProfile(meta: ConversationMeta): Profile | undefined {
    if (meta.profileId === undefined) return undefined
    return this.state.settings.profiles.find((p) => p.id === meta.profileId)
  }

  /** Why a run cannot start for this conversation, or undefined when it can. */
  runBlocker(meta: ConversationMeta): string | undefined {
    const profile = this.conversationProfile(meta)
    if (profile) {
      return meta.model || profile.model ? undefined : 'Choose a model from the model menu first.'
    }
    if (this.state.settings.profiles.length === 0) {
      return 'Set up an endpoint and model in Settings first.'
    }
    return meta.profileId === undefined
      ? 'Choose a profile for this conversation from the model menu.'
      : "This conversation's profile is unavailable. Choose another from the model menu."
  }

  /** Record why a run did not start; true when it was blocked. */
  private blockRun(id: string, meta: ConversationMeta): boolean {
    const message = this.runBlocker(meta)
    if (!message) return false
    this.set({ errors: { ...this.state.errors, [id]: { message, at: this.now() } } })
    return true
  }

  /** Insert or replace a profile; the first profile becomes active. */
  async saveProfile(profile: Profile): Promise<void> {
    const profiles = this.state.settings.profiles.some((p) => p.id === profile.id)
      ? this.state.settings.profiles.map((p) => (p.id === profile.id ? profile : p))
      : [...this.state.settings.profiles, profile]
    await this.updateSettings({
      profiles,
      activeProfileId: this.state.settings.activeProfileId ?? profile.id,
    })
  }

  async deleteProfile(id: string): Promise<void> {
    const profiles = this.state.settings.profiles.filter((p) => p.id !== id)
    const activeProfileId =
      this.state.settings.activeProfileId === id
        ? profiles[0]?.id
        : this.state.settings.activeProfileId
    await this.updateSettings({ profiles, activeProfileId })
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

  // ── conversations ──────────────────────────────────────────────────────────

  private async saveConversations(conversations: ConversationMeta[]): Promise<void> {
    const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)
    this.set({ conversations: sorted })
    await this.deps.kv.set(CONVERSATIONS_KEY, sorted)
  }

  conversation(id: string): ConversationMeta | undefined {
    return this.state.conversations.find((c) => c.id === id)
  }

  async createConversation(): Promise<ConversationMeta> {
    const profile = this.activeProfile()
    const at = this.now()
    const meta: ConversationMeta = {
      id: newId('c'),
      title: 'New chat',
      createdAt: at,
      updatedAt: at,
      profileId: profile?.id,
      model: profile?.model,
    }
    this.set({ messages: { ...this.state.messages, [meta.id]: [] } })
    await this.saveConversations([meta, ...this.state.conversations])
    return meta
  }

  async updateConversation(
    id: string,
    patch: Partial<Omit<ConversationMeta, 'id'>>,
  ): Promise<void> {
    await this.saveConversations(
      this.state.conversations.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    )
  }

  async deleteConversation(id: string): Promise<void> {
    this.deleted.add(id)
    this.stop(id)
    const timer = this.saveTimers.get(id)
    if (timer) clearTimeout(timer)
    this.saveTimers.delete(id)
    const { [id]: _messages, ...messages } = this.state.messages
    const { [id]: _error, ...errors } = this.state.errors
    this.set({ messages, errors })
    await this.deps.kv.delete(messagesKey(id))
    await this.saveConversations(this.state.conversations.filter((c) => c.id !== id))
  }

  // ── transcript persistence ─────────────────────────────────────────────────

  private setMessages(id: string, messages: ChatMessage[]): void {
    if (this.deleted.has(id)) return
    this.set({ messages: { ...this.state.messages, [id]: messages } })
    this.scheduleSave(id)
  }

  private scheduleSave(id: string): void {
    if (this.saveTimers.has(id)) return
    this.saveTimers.set(
      id,
      setTimeout(() => void this.flush(id), SAVE_DELAY_MS),
    )
  }

  /** Write a conversation's transcript now. */
  async flush(id: string): Promise<void> {
    const timer = this.saveTimers.get(id)
    if (timer) clearTimeout(timer)
    this.saveTimers.delete(id)
    const messages = this.state.messages[id]
    if (messages && !this.deleted.has(id)) await this.deps.kv.set(messagesKey(id), messages)
  }

  private upsertMessage(id: string, message: ChatMessage): void {
    const current = this.state.messages[id] ?? []
    const index = current.findIndex((m) => m.id === message.id)
    const next =
      index === -1 ? [...current, message] : current.map((m, i) => (i === index ? message : m))
    this.setMessages(id, next)
  }

  // ── runs ───────────────────────────────────────────────────────────────────

  /** Send a user message and start an agent turn. */
  async send(
    id: string,
    text: string,
    attachments?: ChatMessage['attachments'],
  ): Promise<RunResult | undefined> {
    await this.openConversation(id)
    const meta = this.conversation(id)
    if (!meta || this.state.runs[id] || this.blockRun(id, meta)) return undefined
    const user: ChatMessage = {
      id: newId('u'),
      role: 'user',
      blocks: [{ type: 'text', id: newId('t'), text }],
      createdAt: this.now(),
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
    }
    const history = [...(this.state.messages[id] ?? []), user]
    this.setMessages(id, history)
    const isFirst = !history.some((m) => m.role === 'user' && m !== user)
    await this.updateConversation(id, {
      updatedAt: this.now(),
      ...(isFirst ? { title: titleFrom(text) } : {}),
    })
    return this.startRun(id, history)
  }

  /** Re-run the turn that produced assistant message `messageId` (or the last turn). */
  async regenerate(id: string, messageId?: string): Promise<RunResult | undefined> {
    await this.openConversation(id)
    const meta = this.conversation(id)
    // Checked before cutting the transcript, so a blocked regenerate keeps it.
    if (!meta || this.state.runs[id] || this.blockRun(id, meta)) return undefined
    const messages = this.state.messages[id] ?? []
    let cut = messageId ? messages.findIndex((m) => m.id === messageId) : -1
    if (cut === -1) {
      cut = messages.length
      while (cut > 0 && messages[cut - 1]?.role !== 'user') cut--
    }
    const history = messages.slice(0, cut)
    if (history.at(-1)?.role !== 'user') return undefined
    this.setMessages(id, history)
    return this.startRun(id, history)
  }

  stop(id: string): void {
    this.controllers.get(id)?.abort()
  }

  private async startRun(id: string, history: ChatMessage[]): Promise<RunResult | undefined> {
    const meta = this.conversation(id)
    // Deleted while `send` awaited its own writes.
    if (!meta) return undefined
    const profile = this.conversationProfile(meta)
    const model = meta.model || profile?.model
    if (!profile || !model) {
      this.blockRun(id, meta)
      return undefined
    }
    const { [id]: _previous, ...errors } = this.state.errors
    const controller = new AbortController()
    const messageId = newId('a')
    this.controllers.set(id, controller)
    this.set({ runs: { ...this.state.runs, [id]: { messageId } }, errors })

    const { settings } = this.state
    const result = await this.run({
      client: createClient({
        baseUrl: profile.baseUrl,
        apiKey: profile.apiKey || undefined,
        fetch: this.deps.fetch,
      }),
      model,
      history,
      system: settings.systemPrompt,
      tools: buildTools(settings.tools, settings.approvals, {
        fetch: this.deps.fetch,
        ...(this.deps.htmlToText ? { htmlToText: this.deps.htmlToText } : {}),
      }),
      approve: (call, signal) => this.requestApproval(id, call, signal),
      signal: controller.signal,
      messageId,
      onUpdate: (message) => this.upsertMessage(id, message),
    })

    this.controllers.delete(id)
    const { [id]: _run, ...runs } = this.state.runs
    // A failed or stopped run is described by the message's own outcome, which
    // the transcript renders (with the footer's regenerate action as retry).
    this.set({ runs })
    if (this.deleted.has(id)) return result
    await this.updateConversation(id, { updatedAt: this.now() })
    await this.flush(id)
    return result
  }

  // ── approvals ──────────────────────────────────────────────────────────────

  private requestApproval(
    conversationId: string,
    call: ToolCallBlock,
    signal: AbortSignal,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const approval: PendingApproval = {
        id: newId('p'),
        conversationId,
        call,
        resolve: (approved) => {
          this.set({ approvals: this.state.approvals.filter((a) => a !== approval) })
          resolve(approved)
        },
      }
      signal.addEventListener('abort', () => approval.resolve(false), { once: true })
      this.set({ approvals: [...this.state.approvals, approval] })
    })
  }
}
