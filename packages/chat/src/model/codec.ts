/**
 * Pure, synchronous codec for the `@fx/chat` message model.
 *
 * The codec maps a generic host message shape into the normalized model
 * ({@link ChatMessage}): it orders content into discriminated blocks, unwraps
 * multiply-encoded tool JSON into parsed values, assigns explicit tool status
 * via a host-provided mapping, derives attachment `kind` from `mediaType`, and
 * folds standalone host tool-role messages into the originating assistant
 * message at the transcript level.
 *
 * This module MUST stay pure and synchronous and MUST NOT touch the DOM.
 */
import type {
  Attachment,
  ChatMessage,
  ContentBlock,
  Role,
  ToolCallBlock,
  ToolMedia,
  ToolStatus,
} from './types'

/**
 * A host tool call as it appears on a host message, before normalization.
 * `arguments`/`result` may be parsed values or (multiply-encoded) JSON strings.
 */
export interface HostToolCall {
  /** Stable id, used as the back-reference target for tool-role messages. */
  id?: string
  /** Some hosts nest the name/arguments under a `function` field. */
  function?: { name?: string; arguments?: unknown }
  /** Flat name (used when not nested under `function`). */
  name?: string
  /** Flat arguments (used when not nested under `function`). */
  arguments?: unknown
  /** Inlined result, when the host stores it on the call itself. */
  result?: unknown
  status?: string
  startedAt?: number
  durationMs?: number
  media?: ToolMedia[]
}

/** A host attachment, before `kind` derivation. */
export interface HostAttachment {
  url: string
  mediaType: string
  name?: string
}

/**
 * A generic host message. The codec reads only the fields it understands;
 * anything else is ignored (or carried through `meta`). A host message may be:
 *
 * - an assistant/user/system message with flat `content` + sibling fields, or
 * - a standalone tool-role message carrying a `toolCallId` back-reference and a
 *   `result` (folded by {@link normalizeTranscript}).
 */
export interface HostMessage {
  id?: string
  role: string
  content?: unknown
  reasoning?: string
  /** Epoch-ms timestamp the reasoning began (mapped to the block `startedAt`). */
  reasoningStartedAt?: number
  reasoningDurationMs?: number
  toolCalls?: HostToolCall[]
  /** Back-reference to the originating tool call (tool-role messages). */
  toolCallId?: string
  /** Tool-role result payload (folded into the matching tool_call block). */
  result?: unknown
  status?: string
  attachments?: HostAttachment[]
  createdAt?: number
  metrics?: ChatMessage['metrics']
  meta?: Record<string, unknown>
}

/**
 * Host-provided mapping callbacks. The host decides what an error is and how to
 * derive ids, so these concerns live outside the codec engine.
 */
export interface NormalizeMapping {
  /**
   * Map a host tool call (and its parsed result) to an explicit
   * {@link ToolStatus}. Defaults to {@link defaultToolStatus}.
   */
  toolStatus?: (call: HostToolCall, parsedResult: unknown) => ToolStatus
  /**
   * Generate a stable id when the host omits one. Defaults to a deterministic
   * positional id (`fallback-<context>`).
   */
  generateId?: (context: string) => string
}

const MAX_JSON_PARSE_ITERATIONS = 5

/**
 * Unwrap a multiply-encoded JSON string into a parsed value. Repeatedly
 * `JSON.parse`s a string result up to {@link MAX_JSON_PARSE_ITERATIONS} times,
 * stopping as soon as a non-string value is produced or parsing fails (the last
 * successfully decoded value — or the original input — is returned). Bounded so
 * a pathological input can never loop unbounded.
 */
export function deepParseJson(value: unknown): unknown {
  let current = value
  for (let i = 0; i < MAX_JSON_PARSE_ITERATIONS; i++) {
    if (typeof current !== 'string') return current
    try {
      current = JSON.parse(current) as unknown
    } catch {
      return current
    }
  }
  return current
}

/**
 * Coerce a value into a JSON-safe form. Round-tripping through
 * `JSON.stringify`/`JSON.parse` drops `undefined`/function properties and
 * canonicalizes the value so the model's JSON-serializable contract holds after
 * transport. A value that cannot be serialized at all (e.g. a BigInt or a
 * circular structure) yields `null` rather than throwing — the codec never
 * rejects host data.
 */
export function toJsonSafe(value: unknown): unknown {
  if (value === undefined) return undefined
  try {
    return JSON.parse(JSON.stringify(value)) as unknown
  } catch {
    return null
  }
}

/**
 * Unwrap a (possibly multiply-encoded) tool payload string into a parsed value
 * and then coerce it into a JSON-safe shape, so emitted `arguments`/`result`
 * always satisfy the model's JSON-serializable contract.
 */
function parseToolPayload(value: unknown): unknown {
  return toJsonSafe(deepParseJson(value))
}

/**
 * The default tool-status mapping: a parsed result with a truthy top-level
 * `error` key is `'error'`; any other present result is `'success'`; no result
 * yet is `'pending'`. Hosts override via {@link NormalizeMapping.toolStatus}.
 */
export function defaultToolStatus(_call: HostToolCall, parsedResult: unknown): ToolStatus {
  if (parsedResult === undefined) return 'pending'
  if (
    typeof parsedResult === 'object' &&
    parsedResult !== null &&
    'error' in parsedResult &&
    (parsedResult as { error?: unknown }).error
  ) {
    return 'error'
  }
  return 'success'
}

/**
 * Derive an {@link Attachment.kind} from a MIME `mediaType`. The major type
 * (`image`/`video`/`audio`) maps directly; anything else is `'file'`.
 */
export function attachmentKind(mediaType: string): Attachment['kind'] {
  const major = mediaType.split('/', 1)[0]?.toLowerCase()
  if (major === 'image' || major === 'video' || major === 'audio') return major
  return 'file'
}

function defaultGenerateId(context: string): string {
  return `fallback-${context}`
}

function toAttachment(host: HostAttachment): Attachment {
  const attachment: Attachment = {
    url: host.url,
    mediaType: host.mediaType,
    kind: attachmentKind(host.mediaType),
  }
  if (host.name !== undefined) attachment.name = host.name
  return attachment
}

function normalizeRole(role: string): Role {
  return role === 'system' || role === 'user' ? role : 'assistant'
}

/**
 * Build a {@link ToolCallBlock} from a host tool call, parsing
 * arguments/result and resolving status via the mapping.
 */
function toToolCallBlock(
  call: HostToolCall,
  index: number,
  mapping: Required<NormalizeMapping>,
): ToolCallBlock {
  const rawArguments = call.function?.arguments ?? call.arguments
  const rawResult = call.result
  const parsedResult = rawResult === undefined ? undefined : parseToolPayload(rawResult)
  const status: ToolStatus = isToolStatus(call.status)
    ? call.status
    : mapping.toolStatus(call, parsedResult)

  const block: ToolCallBlock = {
    type: 'tool_call',
    id: call.id ?? mapping.generateId(`tool-${index}`),
    name: call.function?.name ?? call.name ?? '',
    // `arguments` is required and the model is JSON-serializable, so default a
    // missing value to the JSON-safe sentinel `null` (not `undefined`, which
    // `JSON.stringify` would drop, breaking round-trips and `assertChatMessage`).
    arguments: rawArguments === undefined ? null : parseToolPayload(rawArguments),
    status,
  }
  if (parsedResult !== undefined) block.result = parsedResult
  if (call.startedAt !== undefined) block.startedAt = call.startedAt
  if (call.durationMs !== undefined) block.durationMs = call.durationMs
  if (call.media !== undefined) block.media = call.media
  return block
}

function isToolStatus(value: unknown): value is ToolStatus {
  return value === 'pending' || value === 'running' || value === 'success' || value === 'error'
}

function resolveMapping(mapping?: NormalizeMapping): Required<NormalizeMapping> {
  return {
    toolStatus: mapping?.toolStatus ?? defaultToolStatus,
    generateId: mapping?.generateId ?? defaultGenerateId,
  }
}

/**
 * Normalize a single host message into a {@link ChatMessage}.
 *
 * Blocks are emitted in the order `[reasoning?, text?, tool_call…]`. Tool
 * arguments/results are parsed (multiply-encoded strings unwrapped) and each
 * tool call carries an explicit status. This single-message normalizer cannot
 * fold a tool-role message into a *separate* assistant message — use
 * {@link normalizeTranscript} for that — but a lone `role:'tool'` message is
 * never dropped: its `result`/`status` are preserved on a synthesized
 * `tool_call` block (the single-message analog of the transcript normalizer's
 * unmatched-result preservation).
 */
export function normalizeMessage(input: HostMessage, mapping?: NormalizeMapping): ChatMessage {
  const resolved = resolveMapping(mapping)
  if (isToolRoleMessage(input)) {
    return synthesizeUnmatchedToolCall(input, resolved).message
  }
  const role = normalizeRole(input.role)
  const blocks: ContentBlock[] = []
  const messageId = input.id ?? resolved.generateId('message')

  // Mirror the content guard: only emit a reasoning block for non-empty text,
  // so an empty `reasoning` string never produces a stray empty block.
  if (typeof input.reasoning === 'string' && input.reasoning.length > 0) {
    const block: ContentBlock = {
      type: 'reasoning',
      id: `${messageId}:reasoning`,
      text: input.reasoning,
    }
    if (input.reasoningStartedAt !== undefined) block.startedAt = input.reasoningStartedAt
    if (input.reasoningDurationMs !== undefined) block.durationMs = input.reasoningDurationMs
    blocks.push(block)
  }

  if (typeof input.content === 'string' && input.content.length > 0) {
    if (role === 'system') {
      blocks.push({ type: 'system', id: `${messageId}:system`, text: input.content })
    } else {
      blocks.push({
        type: 'text',
        id: `${messageId}:text`,
        text: input.content,
        markdown: role === 'assistant',
      })
    }
  }

  if (input.toolCalls) {
    for (const [index, call] of input.toolCalls.entries()) {
      blocks.push(toToolCallBlock(call, index, resolved))
    }
  }

  const message: ChatMessage = { id: messageId, role, blocks }
  if (input.attachments !== undefined) message.attachments = input.attachments.map(toAttachment)
  if (input.createdAt !== undefined) message.createdAt = input.createdAt
  if (input.metrics !== undefined) message.metrics = input.metrics
  if (input.meta !== undefined) {
    const safeMeta = jsonSafeMeta(input.meta)
    if (safeMeta !== undefined) message.meta = safeMeta
  }
  return message
}

/**
 * Coerce an opaque host `meta` bag into a JSON-safe plain object so the returned
 * message satisfies the model's JSON-serializable contract. A value that does
 * not survive as a plain object (circular, BigInt, array, primitive) is dropped
 * (`undefined`) rather than emitted in a contract-violating shape.
 */
function jsonSafeMeta(meta: Record<string, unknown>): Record<string, unknown> | undefined {
  const safe = toJsonSafe(meta)
  if (typeof safe === 'object' && safe !== null && !Array.isArray(safe)) {
    return safe as Record<string, unknown>
  }
  return undefined
}

/** True when a host message is a standalone tool-role message to be folded. */
function isToolRoleMessage(input: HostMessage): boolean {
  return input.role === 'tool'
}

/**
 * Apply a folded tool result onto a tool_call block, parsing the payload and
 * recomputing status via the mapping.
 */
function applyToolResult(
  block: ToolCallBlock,
  hostMsg: HostMessage,
  mapping: Required<NormalizeMapping>,
): void {
  const parsedResult = hostMsg.result === undefined ? undefined : parseToolPayload(hostMsg.result)
  if (parsedResult !== undefined) block.result = parsedResult
  block.status = isToolStatus(hostMsg.status)
    ? hostMsg.status
    : mapping.toolStatus({ id: block.id, name: block.name, result: parsedResult }, parsedResult)
}

/**
 * Normalize an ordered array of host messages into `ChatMessage[]`.
 *
 * Standalone tool-role host messages (those carrying a `toolCallId`
 * back-reference and a `result`) are folded into the originating assistant
 * message's matching `tool_call` block — setting its `result`/`status` — and
 * are NOT emitted as their own `ChatMessage`. A tool result with no matching
 * prior tool call is preserved by synthesizing a tool_call block on a new
 * assistant message rather than being dropped.
 *
 * Folding is **proximity-scoped**, not keyed by a global id map: each tool-role
 * result is matched to the NEAREST PRECEDING tool_call with the same id that
 * does NOT yet carry a result. Because `ToolCallBlock.id` is only unique within
 * its owning message (not across the transcript), a global id map could
 * mis-fold a result into a duplicate-id call in an unrelated earlier message.
 * Scanning the most-recent unfilled call backwards removes that
 * cross-transcript-uniqueness assumption.
 */
export function normalizeTranscript(
  inputs: HostMessage[],
  mapping?: NormalizeMapping,
): ChatMessage[] {
  const resolved = resolveMapping(mapping)
  const output: ChatMessage[] = []
  // Ordered list of every emitted tool_call block that has not yet had a result
  // folded into it, in emission order. A tool-role result is matched against the
  // nearest preceding (most-recent) unfilled entry with the same id.
  const unfilled: ToolCallBlock[] = []

  for (const [position, input] of inputs.entries()) {
    // Scope fallback ids by transcript position so multiple id-less messages
    // never collide on `fallback-message` (and neither do their block ids).
    const positioned = positionScopedMapping(resolved, position)

    if (isToolRoleMessage(input)) {
      const target = takeNearestUnfilled(unfilled, input.toolCallId)
      if (target) {
        applyToolResult(target, input, resolved)
      } else {
        // Unmatched result: preserve it on a synthesized tool_call block rather
        // than dropping it. Only a synthesized block still awaiting a result
        // stays eligible (so a later tool-role message can complete it); one that
        // already carries a result is complete and must NOT be overwritten — a
        // later same-id orphan is preserved at its own position instead.
        const synthesized = synthesizeUnmatchedToolCall(input, positioned)
        output.push(synthesized.message)
        if (synthesized.block.result === undefined) unfilled.push(synthesized.block)
      }
      continue
    }

    const message = normalizeMessage(input, positioned)
    for (const block of message.blocks) {
      // Only calls still awaiting a result are foldable; one whose result was
      // already inlined on the host call is complete and must not be overwritten.
      if (block.type === 'tool_call' && block.result === undefined) unfilled.push(block)
    }
    output.push(message)
  }

  return output
}

/**
 * Remove and return the nearest preceding (most-recent) unfilled tool_call
 * block whose id matches `id`, or `undefined` when none matches (including when
 * `id` itself is absent). Searching from the end implements most-recent-unfilled
 * proximity scoping; removing the match prevents a later result from re-folding
 * into an already-filled call.
 */
function takeNearestUnfilled(
  unfilled: ToolCallBlock[],
  id: string | undefined,
): ToolCallBlock | undefined {
  if (id === undefined) return undefined
  for (let i = unfilled.length - 1; i >= 0; i--) {
    if (unfilled[i]?.id === id) return unfilled.splice(i, 1)[0]
  }
  return undefined
}

/**
 * Wrap a resolved mapping so its `generateId` fallbacks are scoped to a
 * transcript position, keeping ids unique across id-less messages.
 */
function positionScopedMapping(
  resolved: Required<NormalizeMapping>,
  position: number,
): Required<NormalizeMapping> {
  return {
    toolStatus: resolved.toolStatus,
    generateId: (context) => resolved.generateId(`${position}-${context}`),
  }
}

/**
 * Build a synthetic assistant message wrapping a single tool_call block for a
 * tool result that has no matching prior tool call.
 */
function synthesizeUnmatchedToolCall(
  hostMsg: HostMessage,
  mapping: Required<NormalizeMapping>,
): { message: ChatMessage; block: ToolCallBlock } {
  const id = hostMsg.toolCallId ?? hostMsg.id ?? mapping.generateId('unmatched-tool')
  const parsedResult = hostMsg.result === undefined ? undefined : parseToolPayload(hostMsg.result)
  const block: ToolCallBlock = {
    type: 'tool_call',
    id,
    name: '',
    // JSON-safe sentinel for the required `arguments` field (see toToolCallBlock).
    arguments: null,
    status: isToolStatus(hostMsg.status)
      ? hostMsg.status
      : mapping.toolStatus({ id, result: parsedResult }, parsedResult),
  }
  if (parsedResult !== undefined) block.result = parsedResult
  const message: ChatMessage = {
    id: hostMsg.id ?? `${id}:message`,
    role: 'assistant',
    blocks: [block],
  }
  return { message, block }
}

/** Error thrown by {@link assertChatMessage} when validation fails. */
export class ChatMessageAssertionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ChatMessageAssertionError'
  }
}

const VALID_ROLES: ReadonlySet<string> = new Set<Role>(['system', 'user', 'assistant'])
const VALID_BLOCK_TYPES: ReadonlySet<string> = new Set<ContentBlock['type']>([
  'text',
  'reasoning',
  'status',
  'system',
  'tool_call',
])

/**
 * Dev-mode guard asserting `value` conforms to {@link ChatMessage}. Throws a
 * {@link ChatMessageAssertionError} describing the first violation; narrows the
 * type on success.
 */
export function assertChatMessage(value: unknown): asserts value is ChatMessage {
  if (typeof value !== 'object' || value === null) {
    throw new ChatMessageAssertionError('expected a ChatMessage object')
  }
  const msg = value as Record<string, unknown>
  if (typeof msg.id !== 'string') {
    throw new ChatMessageAssertionError('ChatMessage.id must be a string')
  }
  if (typeof msg.role !== 'string' || !VALID_ROLES.has(msg.role)) {
    throw new ChatMessageAssertionError('ChatMessage.role must be one of system|user|assistant')
  }
  if (!Array.isArray(msg.blocks)) {
    throw new ChatMessageAssertionError('ChatMessage.blocks must be an array')
  }
  for (const block of msg.blocks as unknown[]) {
    if (typeof block !== 'object' || block === null) {
      throw new ChatMessageAssertionError('each block must be an object')
    }
    const candidate = block as Record<string, unknown>
    if (typeof candidate.type !== 'string' || !VALID_BLOCK_TYPES.has(candidate.type)) {
      throw new ChatMessageAssertionError(`unknown block type: ${String(candidate.type)}`)
    }
    if (typeof candidate.id !== 'string') {
      throw new ChatMessageAssertionError('each block must have a string id')
    }
    assertBlockPayload(candidate)
  }
  assertOptionalMessageFields(msg)
}

const ATTACHMENT_KINDS: ReadonlySet<string> = new Set<Attachment['kind']>([
  'image',
  'video',
  'audio',
  'file',
])

/**
 * Validate the OPTIONAL `ChatMessage` fields when present, so a successful
 * {@link assertChatMessage} narrow never exposes a malformed `attachments`,
 * `createdAt`, `metrics`, or `meta`.
 */
function assertOptionalMessageFields(msg: Record<string, unknown>): void {
  if (msg.attachments !== undefined) {
    if (!Array.isArray(msg.attachments)) {
      throw new ChatMessageAssertionError('ChatMessage.attachments must be an array')
    }
    for (const attachment of msg.attachments as unknown[]) {
      assertAttachment(attachment)
    }
  }
  if (msg.createdAt !== undefined && typeof msg.createdAt !== 'number') {
    throw new ChatMessageAssertionError('ChatMessage.createdAt must be a number')
  }
  if (msg.metrics !== undefined) {
    assertMetrics(msg.metrics)
  }
  if (
    msg.meta !== undefined &&
    (typeof msg.meta !== 'object' || msg.meta === null || Array.isArray(msg.meta))
  ) {
    throw new ChatMessageAssertionError('ChatMessage.meta must be an object')
  }
}

/** Validate one attachment entry. */
function assertAttachment(attachment: unknown): void {
  if (typeof attachment !== 'object' || attachment === null) {
    throw new ChatMessageAssertionError('each attachment must be an object')
  }
  const a = attachment as Record<string, unknown>
  if (typeof a.url !== 'string') {
    throw new ChatMessageAssertionError('attachment.url must be a string')
  }
  if (typeof a.mediaType !== 'string') {
    throw new ChatMessageAssertionError('attachment.mediaType must be a string')
  }
  if (typeof a.kind !== 'string' || !ATTACHMENT_KINDS.has(a.kind)) {
    throw new ChatMessageAssertionError('attachment.kind must be one of image|video|audio|file')
  }
  if (a.name !== undefined && typeof a.name !== 'string') {
    throw new ChatMessageAssertionError('attachment.name must be a string when present')
  }
}

/** Validate the OPTIONAL {@link MessageMetrics} bag when present. */
function assertMetrics(metrics: unknown): void {
  if (typeof metrics !== 'object' || metrics === null || Array.isArray(metrics)) {
    throw new ChatMessageAssertionError('ChatMessage.metrics must be an object')
  }
  const m = metrics as Record<string, unknown>
  assertOptionalNumber(m, 'durationMs', 'metrics.durationMs must be a number')
  assertOptionalNumber(m, 'tokensPerSecond', 'metrics.tokensPerSecond must be a number')
  assertOptionalString(m, 'model', 'metrics.model must be a string')
  assertOptionalString(m, 'requestModel', 'metrics.requestModel must be a string')
  if (m.usage !== undefined) {
    if (typeof m.usage !== 'object' || m.usage === null || Array.isArray(m.usage)) {
      throw new ChatMessageAssertionError('metrics.usage must be an object')
    }
    const usage = m.usage as Record<string, unknown>
    assertOptionalNumber(usage, 'prompt', 'metrics.usage.prompt must be a number')
    assertOptionalNumber(usage, 'completion', 'metrics.usage.completion must be a number')
    assertOptionalNumber(usage, 'total', 'metrics.usage.total must be a number')
  }
}

function assertOptionalNumber(obj: Record<string, unknown>, field: string, message: string): void {
  if (obj[field] !== undefined && typeof obj[field] !== 'number') {
    throw new ChatMessageAssertionError(message)
  }
}

function assertOptionalString(obj: Record<string, unknown>, field: string, message: string): void {
  if (obj[field] !== undefined && typeof obj[field] !== 'string') {
    throw new ChatMessageAssertionError(message)
  }
}

/**
 * Validate the type-specific required payload of a content block whose `type`
 * and `id` have already been checked. Throws on the first violation so a
 * successful {@link assertChatMessage} narrow never exposes a block with a
 * missing required field.
 */
function assertBlockPayload(block: Record<string, unknown>): void {
  switch (block.type) {
    case 'text':
      assertText(block)
      assertOptionalBoolean(block, 'markdown', 'text block markdown must be a boolean')
      return
    case 'reasoning':
      assertText(block)
      assertOptionalNumber(block, 'startedAt', 'reasoning block startedAt must be a number')
      assertOptionalNumber(block, 'durationMs', 'reasoning block durationMs must be a number')
      return
    case 'system':
      assertText(block)
      return
    case 'tool_call':
      assertToolCallBlockPayload(block)
      return
    default:
      // 'status' blocks carry only the OPTIONAL `phase` enum beyond type/id.
      if (
        block.phase !== undefined &&
        block.phase !== 'pre-stream' &&
        block.phase !== 'streaming' &&
        block.phase !== 'complete'
      ) {
        throw new ChatMessageAssertionError(
          'status block phase must be one of pre-stream|streaming|complete',
        )
      }
      return
  }
}

function assertText(block: Record<string, unknown>): void {
  if (typeof block.text !== 'string') {
    throw new ChatMessageAssertionError(`${String(block.type)} block must have a string text`)
  }
}

/** Throw when an OPTIONAL field is present but not a boolean. */
function assertOptionalBoolean(obj: Record<string, unknown>, field: string, message: string): void {
  if (obj[field] !== undefined && typeof obj[field] !== 'boolean') {
    throw new ChatMessageAssertionError(message)
  }
}

/** Validate the required + optional payload of a `tool_call` block. */
function assertToolCallBlockPayload(block: Record<string, unknown>): void {
  if (typeof block.name !== 'string') {
    throw new ChatMessageAssertionError('tool_call block must have a string name')
  }
  if (!('arguments' in block) || block.arguments === undefined) {
    // `arguments` is required and JSON-serializable; `undefined` is dropped by a
    // JSON round trip, so it must be a present, non-undefined value (use `null`).
    throw new ChatMessageAssertionError('tool_call block must have a non-undefined arguments field')
  }
  if (typeof block.status !== 'string' || !isToolStatus(block.status)) {
    throw new ChatMessageAssertionError(
      'tool_call block status must be one of pending|running|success|error',
    )
  }
  assertOptionalNumber(block, 'startedAt', 'tool_call block startedAt must be a number')
  assertOptionalNumber(block, 'durationMs', 'tool_call block durationMs must be a number')
  if (block.media !== undefined) {
    if (!Array.isArray(block.media)) {
      throw new ChatMessageAssertionError('tool_call block media must be an array')
    }
    for (const entry of block.media as unknown[]) {
      assertToolMedia(entry)
    }
  }
}

/** Validate one tool-result media entry. */
function assertToolMedia(entry: unknown): void {
  if (typeof entry !== 'object' || entry === null) {
    throw new ChatMessageAssertionError('each media entry must be an object')
  }
  const media = entry as Record<string, unknown>
  if (media.kind !== 'image' && media.kind !== 'audio') {
    throw new ChatMessageAssertionError('media.kind must be one of image|audio')
  }
  if (typeof media.url !== 'string') {
    throw new ChatMessageAssertionError('media.url must be a string')
  }
}
