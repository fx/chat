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

/**
 * The discriminated union of content blocks, tagged by `type`. The core union
 * MUST NOT include application-specific kinds; extension happens via registry
 * renderer slots.
 */
export type ContentBlock = TextBlock | ReasoningBlock | StatusBlock | SystemBlock | ToolCallBlock

/**
 * A message-level attachment, kept separate from text blocks. The `kind` is
 * derived from `mediaType` by the codec.
 */
export interface Attachment {
  url: string
  mediaType: string
  kind: 'image' | 'video' | 'audio' | 'file'
  name?: string
}

/** Optional per-message timing/usage metrics. Renderers degrade gracefully. */
export interface MessageMetrics {
  durationMs?: number
  tokensPerSecond?: number
  usage?: { prompt?: number; completion?: number; total?: number }
  model?: string
  requestModel?: string
}

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
  /** Opaque host bag, carried through unchanged. */
  meta?: Record<string, unknown>
}
