/**
 * Normalized, transport-agnostic message model for `@fx/chat`.
 *
 * This module is **pure data**: type declarations only, no runtime code, no
 * React, no DOM. Every renderer and the composer consume these types. Hosts map
 * their own message shapes into this model via the codec (see `./codec`).
 *
 * The model deliberately covers only generic chat concepts. Application-specific
 * block kinds (job/wake timelines, generative-UI) are intentionally absent from
 * the core `ContentBlock` union — hosts extend rendering via registry renderer
 * slots, never by mutating this union.
 */

/**
 * The author role of a message. There is deliberately no `'tool'` role: tool
 * execution is represented as a {@link ToolCallBlock} on an assistant message,
 * and the transcript codec folds standalone host tool-role messages into the
 * originating assistant message.
 */
export type Role = 'system' | 'user' | 'assistant'

/**
 * Explicit lifecycle status of a tool invocation. Renderers MUST dispatch on
 * this enum rather than re-deriving error state by inspecting a result payload.
 */
export type ToolStatus = 'pending' | 'running' | 'success' | 'error'

/**
 * Extracted media surfaced on a tool result so renderers can show generated
 * images/audio without parsing the raw result payload.
 */
export interface ToolMedia {
  kind: 'image' | 'audio'
  url: string
}

/**
 * A single tool invocation, represented as a content block on an assistant
 * message. `arguments` and `result` are already-parsed JSON values (the codec
 * unwraps any multiply-encoded strings during normalization), not opaque
 * strings.
 */
export interface ToolCallBlock {
  type: 'tool_call'
  /**
   * Stable id, usable as a render key. Uniqueness is guaranteed only **within
   * the owning message**, not across a transcript — the same id MAY recur on
   * tool calls in different messages. The transcript codec therefore folds a
   * tool-role result into the NEAREST PRECEDING tool_call with this id that does
   * not yet carry a result (most-recent-unfilled proximity scoping), rather than
   * relying on global id uniqueness. See {@link normalizeTranscript}.
   */
  id: string
  /** Tool name. */
  name: string
  /** Parsed invocation arguments (not a JSON string). */
  arguments: unknown
  /** Parsed invocation result (not a JSON string), when available. */
  result?: unknown
  /** Explicit lifecycle status. */
  status: ToolStatus
  /** Epoch-ms timestamp the invocation started, when known. */
  startedAt?: number
  /** Wall-clock duration of the invocation in ms, when known. */
  durationMs?: number
  /** Extracted media on the result, when present. */
  media?: ToolMedia[]
  /** Human title for the invocation ("Read config.yaml"); preferred over `name` for display. */
  title?: string
  /** What the tool does; well-known values in {@link ToolKind}, any other string is `other`. */
  kind?: ToolKind
  /** One line saying what the call acts on (a command, a path, a query). */
  inputSummary?: string
  /** The outcome of asking permission, when one was asked. `status` stays authoritative. */
  approval?: ToolApproval
}

/** Well-known tool kinds. Any other string is allowed and treated as `'other'`. */
export type ToolKind =
  | 'read'
  | 'edit'
  | 'delete'
  | 'move'
  | 'search'
  | 'execute'
  | 'think'
  | 'fetch'
  | 'other'
  | (string & {})

/** Permission outcome of a tool call. */
export interface ToolApproval {
  /**
   * `pending` (waiting for a decision), `approved`, `denied` (by the user or a
   * policy), or `unavailable` (no way to allow it was offered).
   */
  state: 'pending' | 'approved' | 'denied' | 'unavailable'
  /** Short display label for the decision, e.g. "allow once". */
  label?: string
}

/** Assistant or user prose. */
export interface TextBlock {
  type: 'text'
  id: string
  text: string
  /**
   * Markdown hint. Assistant text is markdown by default; user text is plain by
   * default. The renderer decides; the model only carries the hint.
   */
  markdown?: boolean
}

/** Model "thinking" content. */
export interface ReasoningBlock {
  type: 'reasoning'
  id: string
  text: string
  /**
   * Epoch-ms timestamp the reasoning began, when known. Anchors the live
   * "Thinking…" timer for reasoning that follows earlier turn activity (e.g.
   * tool calls); when absent, renderers fall back to the message-level start.
   */
  startedAt?: number
  durationMs?: number
}

/** A generation-lifecycle marker. */
export interface StatusBlock {
  type: 'status'
  id: string
  phase?: 'pre-stream' | 'streaming' | 'complete'
}

/** System-prompt content. */
export interface SystemBlock {
  type: 'system'
  id: string
  text: string
}

/** One entry of an agent's plan. */
export interface PlanEntry {
  /** Stable within the block when the source has one; else renderers key by position. */
  id?: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  priority?: 'high' | 'medium' | 'low'
}

/**
 * An agent's checklist. An update replaces the whole entry list: producers
 * update the existing block (same `id`) in place, so the latest plan wins.
 */
export interface PlanBlock {
  type: 'plan'
  id: string
  entries: PlanEntry[]
}

/**
 * The discriminated union of content blocks, tagged by `type`. The core union
 * MUST NOT include application-specific kinds; extension happens via registry
 * renderer slots.
 */
export type ContentBlock =
  | TextBlock
  | ReasoningBlock
  | StatusBlock
  | SystemBlock
  | ToolCallBlock
  | PlanBlock

/**
 * A message-level attachment, kept separate from text blocks. The `kind` is
 * derived from `mediaType` by the codec.
 */
export interface Attachment {
  /** Any string the host can resolve (data:, https:, file:, an app-local id). */
  url: string
  mediaType: string
  kind: 'image' | 'video' | 'audio' | 'file'
  name?: string
  /** Display text ("screenshot.png · 1280×720 · 240 KB"), preferred over `name`. */
  description?: string
  /** Size in bytes, when known. */
  size?: number
}

/** Optional per-message timing/usage metrics. Renderers degrade gracefully. */
export interface MessageMetrics {
  durationMs?: number
  tokensPerSecond?: number
  usage?: { prompt?: number; completion?: number; total?: number }
  model?: string
  requestModel?: string
  /** What the turn cost, as the endpoint reported it (absent currency means USD). */
  cost?: { amount: number; currency?: string }
  /** Context window use after the turn: tokens in use and the window size. */
  context?: { used: number; size?: number }
}

/** How generation of a message ended, when it did not simply complete. */
export type MessageOutcome =
  /** Stopped by the user or host; partial content is kept. */
  | { kind: 'stopped' }
  /** Failed; `message` is human-readable, `retryable` a hint for a retry affordance. */
  | { kind: 'error'; message: string; retryable?: boolean }

/**
 * A normalized chat message: a stable `id`, a `role`, and an ordered list of
 * content `blocks`, plus optional metadata. JSON-serializable: no functions,
 * class instances, or React nodes.
 */
export interface ChatMessage {
  id: string
  role: Role
  blocks: ContentBlock[]
  /** Attachments, kept message-level and distinct from text (user messages). */
  attachments?: Attachment[]
  /** Epoch-ms creation timestamp, when known. */
  createdAt?: number
  metrics?: MessageMetrics
  /** How generation ended, when it did not simply complete. */
  outcome?: MessageOutcome
  /** Opaque host bag, carried through unchanged. */
  meta?: Record<string, unknown>
}
