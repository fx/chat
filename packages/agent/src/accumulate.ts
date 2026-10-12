/**
 * The turn accumulator: pure functions that fold normalized stream events into
 * ONE assistant `ChatMessage` spanning every step of an agent turn.
 *
 * Every function returns a new state; the `message` inside is a fresh,
 * immutable snapshot the host can render or persist directly. Step boundaries
 * and the reasoning field each step used are recorded in the message's opaque
 * `meta` bag under {@link AGENT_META_KEY} so the history encoder can split the
 * turn back into Chat Completions messages exactly.
 */
import {
  type ChatMessage,
  type ContentBlock,
  type MessageMetrics,
  type ReasoningBlock,
  type ToolCallBlock,
  approxTokenCount,
} from '@fx-/chat-core'
import type { ReasoningField, StreamEvent, Usage } from './types'

/** `meta` key holding the runtime's per-turn bookkeeping. */
export const AGENT_META_KEY = 'fx.agent'

/**
 * A run of a step's reasoning text from one source. `length` counts UTF-16
 * code units of the step's reasoning text (its reasoning blocks joined in
 * order); `field` is the delta field it arrived on, absent for think tags.
 */
export interface ReasoningSegment {
  field?: ReasoningField
  length: number
}

/** One step's record in {@link AgentMeta}. */
export interface StepMeta {
  /** Index into `blocks` where the step's first block sits. */
  start: number
  /**
   * Provenance of the step's reasoning, in arrival order, covering all of it.
   * Rendering keeps one reasoning block; only the encoder reads this.
   */
  reasoning?: ReasoningSegment[]
}

/** The bookkeeping stored at `message.meta[AGENT_META_KEY]`. */
export interface AgentMeta {
  steps: StepMeta[]
}

/** Accumulator state for an in-progress turn. */
export interface TurnState {
  message: ChatMessage
  /** Raw argument text per tool-call block id (arguments arrive as fragments). */
  args: Record<string, string>
  /** Tool-call block id per stream `index`, for the current step. */
  indexToId: Record<number, string>
  /** Epoch ms of the current step's first event, once one arrived. */
  stepFirstEventAt: number | undefined
  /** Summed generation time (first event → step end) across finished steps. */
  generationMs: number
  usage?: Usage
  /** The latest usage report of the current turn (context use is the last step's). */
  lastUsage?: Usage
  blockCounter: number
}

/** Read the runtime's bookkeeping from a message, if present and well-formed. */
export function readAgentMeta(message: ChatMessage): AgentMeta | undefined {
  const value = message.meta?.[AGENT_META_KEY] as AgentMeta | undefined
  return value && Array.isArray(value.steps) ? value : undefined
}

function meta(state: TurnState): AgentMeta {
  return readAgentMeta(state.message) ?? { steps: [] }
}

function withMeta(message: ChatMessage, agentMeta: AgentMeta): ChatMessage {
  return { ...message, meta: { ...message.meta, [AGENT_META_KEY]: agentMeta } }
}

/** Start a new turn. */
export function createTurn(id: string, now: number, requestModel: string): TurnState {
  return {
    message: withMeta(
      { id, role: 'assistant', blocks: [], createdAt: now, metrics: { requestModel } },
      { steps: [] },
    ),
    args: {},
    indexToId: {},
    stepFirstEventAt: undefined,
    generationMs: 0,
    blockCounter: 0,
  }
}

/** Mark the start of a step (one streamed completion). */
export function beginStep(state: TurnState): TurnState {
  const agentMeta = meta(state)
  return {
    ...state,
    message: withMeta(state.message, {
      steps: [...agentMeta.steps, { start: state.message.blocks.length }],
    }),
    indexToId: {},
    stepFirstEventAt: undefined,
  }
}

function replaceBlock(blocks: ContentBlock[], index: number, block: ContentBlock): ContentBlock[] {
  const next = blocks.slice()
  next[index] = block
  return next
}

/** Close the trailing reasoning block (if open) by stamping its duration. */
function closeReasoning(blocks: ContentBlock[], now: number): ContentBlock[] {
  const last = blocks[blocks.length - 1]
  if (last?.type !== 'reasoning' || last.durationMs !== undefined) return blocks
  return replaceBlock(blocks, blocks.length - 1, {
    ...last,
    durationMs: Math.max(0, now - (last.startedAt ?? now)),
  })
}

function nextId(state: TurnState): [string, TurnState] {
  const n = state.blockCounter + 1
  return [`${state.message.id}-b${n}`, { ...state, blockCounter: n }]
}

/** Fold one stream event into the turn. */
export function applyEvent(input: TurnState, event: StreamEvent, now: number): TurnState {
  let state: TurnState =
    input.stepFirstEventAt === undefined ? { ...input, stepFirstEventAt: now } : input
  let blocks = state.message.blocks
  const last = blocks[blocks.length - 1]

  switch (event.type) {
    case 'model': {
      const metrics: MessageMetrics = { ...state.message.metrics, model: event.model }
      return { ...state, message: { ...state.message, metrics } }
    }
    case 'reasoning': {
      if (last?.type === 'reasoning' && last.durationMs === undefined) {
        blocks = replaceBlock(blocks, blocks.length - 1, { ...last, text: last.text + event.text })
      } else {
        let id: string
        ;[id, state] = nextId(state)
        const block: ReasoningBlock = { type: 'reasoning', id, text: event.text, startedAt: now }
        blocks = [...blocks, block]
      }
      let message: ChatMessage = { ...state.message, blocks }
      const steps = meta(state).steps.slice()
      const current = steps[steps.length - 1]
      if (current) {
        const segments = (current.reasoning ?? []).slice()
        const tail = segments[segments.length - 1]
        if (tail && tail.field === event.field) {
          segments[segments.length - 1] = { ...tail, length: tail.length + event.text.length }
        } else {
          segments.push({
            ...(event.field ? { field: event.field } : {}),
            length: event.text.length,
          })
        }
        steps[steps.length - 1] = { ...current, reasoning: segments }
        message = withMeta(message, { steps })
      }
      return { ...state, message }
    }
    case 'text': {
      blocks = closeReasoning(blocks, now)
      const tail = blocks[blocks.length - 1]
      if (tail?.type === 'text') {
        blocks = replaceBlock(blocks, blocks.length - 1, { ...tail, text: tail.text + event.text })
      } else {
        let id: string
        ;[id, state] = nextId(state)
        blocks = [...blocks, { type: 'text', id, text: event.text, markdown: true }]
      }
      return { ...state, message: { ...state.message, blocks } }
    }
    case 'tool_call': {
      blocks = closeReasoning(blocks, now)
      const existingId = state.indexToId[event.index]
      if (existingId === undefined) {
        const [blockId, next] = nextId(state)
        state = next
        const id = event.id ?? `call_${blockId}`
        const block: ToolCallBlock = {
          type: 'tool_call',
          id,
          name: event.name ?? '',
          arguments: event.arguments ?? '',
          status: 'pending',
        }
        return {
          ...state,
          indexToId: { ...state.indexToId, [event.index]: id },
          args: { ...state.args, [id]: event.arguments ?? '' },
          message: { ...state.message, blocks: [...blocks, block] },
        }
      }
      const index = blocks.findIndex((b) => b.type === 'tool_call' && b.id === existingId)
      const block = blocks[index] as ToolCallBlock
      const raw = (state.args[existingId] as string) + (event.arguments ?? '')
      blocks = replaceBlock(blocks, index, {
        ...block,
        name: block.name + (event.name && event.name !== block.name ? event.name : ''),
        arguments: raw,
      })
      return {
        ...state,
        args: { ...state.args, [existingId]: raw },
        message: { ...state.message, blocks },
      }
    }
    case 'usage': {
      const prev = state.usage ?? {}
      const usage: Usage = {
        ...sum('prompt', prev, event.usage),
        ...sum('completion', prev, event.usage),
        ...sum('total', prev, event.usage),
        ...sum('cost', prev, event.usage),
      }
      return { ...state, usage, lastUsage: event.usage }
    }
    case 'finish':
      return state
  }
}

function sum(key: keyof Usage, a: Usage, b: Usage): Usage {
  const x = a[key]
  const y = b[key]
  if (x === undefined && y === undefined) return {}
  return { [key]: (x ?? 0) + (y ?? 0) }
}

/** Parse accumulated tool arguments; empty text means "no arguments". */
function parseArgs(raw: string): { ok: true; value: unknown } | { ok: false } {
  if (raw.trim() === '') return { ok: true, value: {} }
  try {
    return { ok: true, value: JSON.parse(raw) }
  } catch {
    return { ok: false }
  }
}

/**
 * End the current step: close open reasoning, parse every tool call started in
 * this step, and return the calls the loop should execute. A call whose
 * arguments are not valid JSON is marked `error` immediately.
 */
export function endStep(
  input: TurnState,
  now: number,
): { state: TurnState; calls: ToolCallBlock[] } {
  let blocks = closeReasoning(input.message.blocks, now)
  const stepIds = new Set(Object.values(input.indexToId))
  const calls: ToolCallBlock[] = []
  blocks = blocks.map((block) => {
    if (block.type !== 'tool_call' || !stepIds.has(block.id)) return block
    const parsed = parseArgs(input.args[block.id] as string)
    const next: ToolCallBlock = parsed.ok
      ? { ...block, arguments: parsed.value }
      : {
          ...block,
          status: 'error',
          result: { error: 'The tool arguments were not valid JSON.' },
        }
    calls.push(next)
    return next
  })
  const generationMs =
    input.generationMs +
    (input.stepFirstEventAt === undefined ? 0 : Math.max(0, now - input.stepFirstEventAt))
  return {
    state: {
      ...input,
      generationMs,
      stepFirstEventAt: undefined,
      message: { ...input.message, blocks },
    },
    calls,
  }
}

/** Update a tool-call block in place (status, result, timing). */
export function updateToolCall(
  state: TurnState,
  id: string,
  patch: Partial<
    Pick<ToolCallBlock, 'status' | 'result' | 'startedAt' | 'durationMs' | 'approval'>
  >,
): TurnState {
  const blocks = state.message.blocks.map((block) =>
    block.type === 'tool_call' && block.id === id ? { ...block, ...patch } : block,
  )
  return { ...state, message: { ...state.message, blocks } }
}

/**
 * Finalize the turn: close open reasoning, fail any tool call that never
 * settled (with `reason` as its result), and stamp duration, usage, and
 * tokens per second.
 */
export function finalizeTurn(input: TurnState, now: number, reason = 'aborted'): ChatMessage {
  let state = input
  if (state.stepFirstEventAt !== undefined) state = endStep(state, now).state
  const blocks = closeReasoning(state.message.blocks, now).map((block) =>
    block.type === 'tool_call' && (block.status === 'pending' || block.status === 'running')
      ? { ...block, status: 'error' as const, result: block.result ?? { error: reason } }
      : block,
  )
  const completion = state.usage?.completion ?? approxTokenCount(blocks)
  const seconds = state.generationMs / 1000
  const { cost, ...usage } = state.usage ?? {}
  const last = state.lastUsage
  const metrics: MessageMetrics = {
    ...state.message.metrics,
    durationMs: Math.max(0, now - (state.message.createdAt ?? now)),
    ...(state.usage ? { usage } : {}),
    ...(cost !== undefined ? { cost: { amount: cost } } : {}),
    ...(last?.prompt !== undefined && last.completion !== undefined
      ? { context: { used: last.prompt + last.completion } }
      : {}),
    ...(completion !== undefined && seconds > 0 ? { tokensPerSecond: completion / seconds } : {}),
  }
  return { ...state.message, blocks, metrics }
}
