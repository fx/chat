/**
 * The conversation controller: conversations, lazily loaded transcripts,
 * active runs, run errors, the tool-approval queue and messages queued while
 * a run streams, persisted to an injected key-value store.
 *
 * Framework-free (`subscribe` / `getState`, compatible with React's
 * `useSyncExternalStore`) so every app — webview, terminal, tests — drives the
 * same mechanics. Endpoints, models and tool settings stay app-owned: the app
 * answers {@link ControllerOptions.resolveRun} for each run.
 */
import type { ChatMessage, ToolCallBlock } from '@fx/chat-core'
import { type FetchLike, createClient } from './client'
import { type RunResult, runAgent } from './run'
import { type KeyValueStore, memoryStore } from './storage'
import { type ToolId, buildTools } from './tools/builtin'
import type { AgentTool } from './types'

/** The stored description of one conversation. Apps extend it with their own fields. */
export interface ConversationMeta {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

/** Everything one run needs, answered by the app per conversation. */
export interface RunConfig {
  /** OpenAI-compatible base URL, e.g. `https://api.openai.com/v1`. */
  baseUrl: string
  apiKey?: string | undefined
  model: string
  /** System prompt; blank prompts are not sent. */
  system?: string | undefined
  /** Enabled built-in tools. */
  tools?: Partial<Record<ToolId, boolean>> | undefined
  /** Built-in tools that need the user's approval before each call. */
  approvals?: Partial<Record<ToolId, boolean>> | undefined
  /** App-defined tools, offered after the built-ins. */
  extraTools?: readonly AgentTool[] | undefined
}

/** A run config, or why the conversation cannot run (shown as its error). */
export type RunResolution = RunConfig | { blocked: string }

/** A tool call waiting for the user's decision. */
export interface PendingApproval {
  id: string
  conversationId: string
  call: ToolCallBlock
  resolve: (approved: boolean) => void
}

export interface ActiveRun {
  /** Id of the assistant message the run streams into. */
  messageId: string
  startedAt: number
  /** Stop was requested; the run is winding down. */
  stopping: boolean
}

export interface RunError {
  message: string
  at: number
}

/** A message sent while a run was active, waiting for its turn. */
export interface QueuedMessage {
  text: string
  attachments?: ChatMessage['attachments']
}

export interface ControllerState<M extends ConversationMeta = ConversationMeta> {
  /** `load()` has read the conversation list. */
  loaded: boolean
  /** Ordered by last activity, newest first. */
  conversations: M[]
  /** Loaded transcripts by conversation id. */
  messages: Record<string, ChatMessage[]>
  runs: Record<string, ActiveRun>
  /** Why the last run could not start, by conversation id. */
  errors: Record<string, RunError>
  approvals: PendingApproval[]
  /** Messages waiting for the active run to end, oldest first. */
  queued: Record<string, QueuedMessage[]>
}

export interface ControllerOptions<M extends ConversationMeta = ConversationMeta> {
  /** Transport for model endpoints and the fetch tool. */
  fetch: FetchLike
  /** The run config for a conversation, or why it cannot run. */
  resolveRun: (meta: M) => RunResolution
  /** Persistence (default: in memory). */
  kv?: KeyValueStore | undefined
  /** HTML-to-text for the fetch tool (default: a tag stripper). */
  htmlToText?: ((html: string) => string) | undefined
  now?: (() => number) | undefined
  newId?: ((prefix: string) => string) | undefined
  /** The agent loop, injectable for tests. */
  run?: typeof runAgent | undefined
  /** Transcript writes are debounced by this much (default 400ms). */
  saveDelayMs?: number | undefined
  /**
   * Apply streamed updates at most once per this many ms (default 0: every
   * update). Pending updates are applied before an approval is shown and when
   * the run ends.
   */
  updateIntervalMs?: number | undefined
  /** Queue messages sent while a run is active (default: drop them). */
  queue?: boolean | undefined
}

const CONVERSATIONS_KEY = 'conversations'
const messagesKey = (id: string) => `messages:${id}`
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

const unfinished = (b: ChatMessage['blocks'][number]) =>
  b.type === 'tool_call' && (b.status === 'pending' || b.status === 'running')

/** Tool calls left running when the app was killed can never finish. */
function settleInterrupted(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) =>
    message.blocks.some(unfinished)
      ? {
          ...message,
          blocks: message.blocks.map((b) =>
            b.type === 'tool_call' && unfinished(b)
              ? { ...b, status: 'error' as const, result: b.result ?? { error: 'Interrupted.' } }
              : b,
          ),
        }
      : message,
  )
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record
  return rest
}

export class ChatController<M extends ConversationMeta = ConversationMeta> {
  private state: ControllerState<M> = {
    loaded: false,
    conversations: [],
    messages: {},
    runs: {},
    errors: {},
    approvals: [],
    queued: {},
  }
  private listeners = new Set<() => void>()
  private aborts = new Map<string, AbortController>()
  private saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
  /** Streamed snapshots not applied yet, by conversation then message id. */
  private pending = new Map<string, Map<string, ChatMessage>>()
  private updateTimer: ReturnType<typeof setTimeout> | undefined
  private lastUpdate = Number.NEGATIVE_INFINITY
  /**
   * Conversations deleted this session. A run, load or save still in flight
   * when its conversation is deleted must not bring it back in memory or in
   * storage, so every write path checks this set.
   */
  private deleted = new Set<string>()
  private readonly kv: KeyValueStore
  private readonly now: () => number
  private readonly newId: (prefix: string) => string
  private readonly run: typeof runAgent

  constructor(private readonly options: ControllerOptions<M>) {
    this.kv = options.kv ?? memoryStore()
    this.now = options.now ?? Date.now
    this.newId = options.newId ?? newId
    this.run = options.run ?? runAgent
  }

  // ── subscription ───────────────────────────────────────────────────────────

  getState = (): ControllerState<M> => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private set(patch: Partial<ControllerState<M>>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  // ── conversations ──────────────────────────────────────────────────────────

  /** Read the conversation list. */
  async load(): Promise<void> {
    const conversations = (await this.kv.get<M[]>(CONVERSATIONS_KEY)) ?? []
    this.set({
      loaded: true,
      conversations: [...conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    })
  }

  conversation(id: string): M | undefined {
    return this.state.conversations.find((c) => c.id === id)
  }

  /** Load a conversation's transcript if not loaded yet. */
  async openConversation(id: string): Promise<void> {
    if (this.state.messages[id]) return
    const stored = (await this.kv.get<ChatMessage[]>(messagesKey(id))) ?? []
    if (this.state.messages[id] || this.deleted.has(id)) return
    this.set({ messages: { ...this.state.messages, [id]: settleInterrupted(stored) } })
  }

  /**
   * Start a conversation. Its state is in place synchronously; the promise
   * settles once the list is stored.
   */
  async createConversation(init: Partial<M> = {}): Promise<M> {
    const at = this.now()
    const meta = {
      title: 'New chat',
      createdAt: at,
      updatedAt: at,
      ...init,
      id: init.id ?? this.newId('c'),
    } as M
    this.deleted.delete(meta.id)
    this.set({ messages: { ...this.state.messages, [meta.id]: [] } })
    await this.saveConversations([meta, ...this.state.conversations])
    return meta
  }

  async updateConversation(id: string, patch: Partial<Omit<M, 'id'>>): Promise<void> {
    await this.saveConversations(
      this.state.conversations.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    )
  }

  async deleteConversation(id: string): Promise<void> {
    this.deleted.add(id)
    this.stop(id)
    this.cancelSave(id)
    this.pending.delete(id)
    this.set({
      messages: without(this.state.messages, id),
      errors: without(this.state.errors, id),
      queued: without(this.state.queued, id),
    })
    await this.kv.delete(messagesKey(id))
    await this.saveConversations(this.state.conversations.filter((c) => c.id !== id))
  }

  /**
   * Empty a conversation's transcript, error and queue. Refused (false) while
   * a run is active: its remaining updates would write the answer back.
   */
  clear(id: string): boolean {
    if (this.state.runs[id]) return false
    this.pending.delete(id)
    this.set({ errors: without(this.state.errors, id), queued: without(this.state.queued, id) })
    this.setMessages(id, [])
    return true
  }

  private async saveConversations(conversations: M[]): Promise<void> {
    const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)
    this.set({ conversations: sorted })
    await this.kv.set(CONVERSATIONS_KEY, sorted)
  }

  // ── transcript persistence ─────────────────────────────────────────────────

  private setMessages(id: string, messages: ChatMessage[]): void {
    if (this.deleted.has(id)) return
    this.set({ messages: { ...this.state.messages, [id]: messages } })
    if (this.saveTimers.has(id)) return
    this.saveTimers.set(
      id,
      setTimeout(() => void this.flush(id), this.options.saveDelayMs ?? 400),
    )
  }

  private cancelSave(id: string): void {
    clearTimeout(this.saveTimers.get(id))
    this.saveTimers.delete(id)
  }

  /** Write a conversation's transcript now. */
  async flush(id: string): Promise<void> {
    this.cancelSave(id)
    const messages = this.state.messages[id]
    if (messages && !this.deleted.has(id)) await this.kv.set(messagesKey(id), messages)
  }

  // ── streamed updates ───────────────────────────────────────────────────────

  private receive(id: string, message: ChatMessage): void {
    const updates = this.pending.get(id) ?? new Map<string, ChatMessage>()
    this.pending.set(id, updates)
    updates.set(message.id, message)
    if (this.updateTimer !== undefined) return
    const wait = (this.options.updateIntervalMs ?? 0) - (performance.now() - this.lastUpdate)
    if (wait <= 0) this.applyUpdates()
    else this.updateTimer = setTimeout(() => this.applyUpdates(), wait)
  }

  /** Apply every pending streamed snapshot (the latest of each message wins). */
  private applyUpdates(): void {
    clearTimeout(this.updateTimer)
    this.updateTimer = undefined
    this.lastUpdate = performance.now()
    const all = [...this.pending]
    this.pending.clear()
    for (const [id, updates] of all) {
      let next = this.state.messages[id] ?? []
      for (const message of updates.values()) {
        const index = next.findIndex((m) => m.id === message.id)
        next = index === -1 ? [...next, message] : next.map((m, i) => (i === index ? message : m))
      }
      this.setMessages(id, next)
    }
  }

  // ── runs ───────────────────────────────────────────────────────────────────

  /** Why a run cannot start (recorded as the conversation's error), or the config. */
  private resolve(id: string, meta: M): Exclude<RunResolution, { blocked: string }> | undefined {
    const resolution = this.options.resolveRun(meta)
    if (!('blocked' in resolution)) return resolution
    this.set({
      errors: { ...this.state.errors, [id]: { message: resolution.blocked, at: this.now() } },
    })
    return undefined
  }

  /**
   * Send a user message and start an agent turn. While a run is active the
   * message is queued (with `queue`) or dropped; either way this resolves
   * undefined.
   */
  async send(
    id: string,
    text: string,
    attachments?: ChatMessage['attachments'],
  ): Promise<RunResult | undefined> {
    await this.openConversation(id)
    const meta = this.conversation(id)
    if (!meta) return undefined
    if (this.state.runs[id]) {
      if (this.options.queue) {
        const item: QueuedMessage = attachments?.length ? { text, attachments } : { text }
        this.set({
          queued: { ...this.state.queued, [id]: [...(this.state.queued[id] ?? []), item] },
        })
      }
      return undefined
    }
    const config = this.resolve(id, meta)
    if (!config) return undefined
    const user: ChatMessage = {
      id: this.newId('u'),
      role: 'user',
      blocks: [{ type: 'text', id: this.newId('t'), text }],
      createdAt: this.now(),
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
    }
    const history = [...(this.state.messages[id] ?? []), user]
    this.setMessages(id, history)
    const isFirst = !history.some((m) => m.role === 'user' && m !== user)
    await this.updateConversation(id, {
      updatedAt: this.now(),
      ...(isFirst ? { title: titleFrom(text) } : {}),
    } as Partial<Omit<M, 'id'>>)
    return this.startRun(id, history)
  }

  /**
   * Re-run the turn that produced assistant message `messageId`, or the last
   * turn (everything after the last user message is replaced).
   */
  async regenerate(id: string, messageId?: string): Promise<RunResult | undefined> {
    await this.openConversation(id)
    const meta = this.conversation(id)
    // Resolved before cutting the transcript, so a blocked regenerate keeps it.
    if (!meta || this.state.runs[id] || !this.resolve(id, meta)) return undefined
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

  /** Stop a conversation's run; true when a running turn was told to stop. */
  stop(id: string): boolean {
    const run = this.state.runs[id]
    if (!run || run.stopping) return false
    this.set({ runs: { ...this.state.runs, [id]: { ...run, stopping: true } } })
    // Every recorded run has its abort controller.
    const abort = this.aborts.get(id) as AbortController
    abort.abort()
    return true
  }

  /** Take the newest queued message back (e.g. for editing). */
  unqueue(id: string): QueuedMessage | undefined {
    const queue = this.state.queued[id] ?? []
    const last = queue.at(-1)
    if (last) this.set({ queued: { ...this.state.queued, [id]: queue.slice(0, -1) } })
    return last
  }

  /** Stop every run and drop pending timers (the controller stays usable). */
  dispose(): void {
    for (const id of Object.keys(this.state.runs)) this.stop(id)
    clearTimeout(this.updateTimer)
    this.updateTimer = undefined
  }

  private async startRun(id: string, history: ChatMessage[]): Promise<RunResult | undefined> {
    const meta = this.conversation(id)
    // Deleted while `send` awaited its own writes.
    if (!meta) return undefined
    const config = this.resolve(id, meta)
    if (!config) return undefined
    const abort = new AbortController()
    const messageId = this.newId('a')
    this.aborts.set(id, abort)
    this.set({
      runs: { ...this.state.runs, [id]: { messageId, startedAt: this.now(), stopping: false } },
      errors: without(this.state.errors, id),
    })

    const { fetch, htmlToText } = this.options
    let result: RunResult | undefined
    try {
      result = await this.run({
        client: createClient({ baseUrl: config.baseUrl, apiKey: config.apiKey, fetch }),
        model: config.model,
        history,
        system: config.system,
        tools: [
          ...buildTools(config.tools ?? {}, config.approvals ?? {}, {
            fetch,
            ...(htmlToText ? { htmlToText } : {}),
          }),
          ...(config.extraTools ?? []),
        ],
        approve: (call, signal) => this.requestApproval(id, call, signal),
        signal: abort.signal,
        messageId,
        now: this.now,
        onUpdate: (message) => this.receive(id, message),
      })
    } catch (error) {
      this.set({
        errors: {
          ...this.state.errors,
          [id]: { message: error instanceof Error ? error.message : String(error), at: this.now() },
        },
      })
    }

    this.applyUpdates()
    this.aborts.delete(id)
    // A failed or stopped run is described by the message's own outcome.
    this.set({ runs: without(this.state.runs, id) })
    if (this.deleted.has(id)) return result
    await this.updateConversation(id, { updatedAt: this.now() } as Partial<Omit<M, 'id'>>)
    await this.flush(id)
    const [next, ...rest] = this.state.queued[id] ?? []
    if (next) {
      this.set({ queued: { ...this.state.queued, [id]: rest } })
      void this.send(id, next.text, next.attachments)
    }
    return result
  }

  // ── approvals ──────────────────────────────────────────────────────────────

  private requestApproval(
    conversationId: string,
    call: ToolCallBlock,
    signal: AbortSignal,
  ): Promise<boolean> {
    // Show the transcript as it stands when the question is asked.
    this.applyUpdates()
    return new Promise((resolve) => {
      const approval: PendingApproval = {
        id: this.newId('p'),
        conversationId,
        call,
        resolve: (approved) => {
          if (!this.state.approvals.includes(approval)) return
          this.set({ approvals: this.state.approvals.filter((a) => a !== approval) })
          resolve(approved)
        },
      }
      signal.addEventListener('abort', () => approval.resolve(false), { once: true })
      this.set({ approvals: [...this.state.approvals, approval] })
    })
  }
}
