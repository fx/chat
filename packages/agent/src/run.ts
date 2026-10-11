/**
 * The agent loop: stream a step, execute the tools it called, send the results
 * back, and repeat until the model answers without tools.
 *
 * The run never rejects for expected failures. It resolves with an
 * {@link AgentOutcome} and the turn's final message; every intermediate
 * snapshot is delivered through `onUpdate`.
 */
import type { ChatMessage, ToolCallBlock } from '@fx/chat-core'
import {
  type TurnState,
  applyEvent,
  beginStep,
  createTurn,
  endStep,
  finalizeTurn,
  updateToolCall,
} from './accumulate'
import type { Client } from './client'
import { encodeHistory } from './encode'
import type { AgentTool, WireTool } from './types'

/** How a run ended. */
export type AgentOutcome = 'complete' | 'aborted' | 'error' | 'max_steps'

export interface RunOptions {
  client: Client
  model: string
  /** Prior conversation, ending with the user message that starts this turn. */
  history: readonly ChatMessage[]
  /** Optional system prompt sent first. */
  system?: string | undefined
  tools?: readonly AgentTool[] | undefined
  /**
   * Approval callback for tools with `requiresApproval`. Resolve `true` to run
   * the call. When absent, such calls are declined.
   */
  approve?: ((call: ToolCallBlock, signal: AbortSignal) => Promise<boolean>) | undefined
  /** Maximum completions per turn (default 10). */
  maxSteps?: number | undefined
  signal?: AbortSignal | undefined
  /** Receives an immutable snapshot after every change. */
  onUpdate?: ((message: ChatMessage) => void) | undefined
  /** Id for the assistant message (default: random). */
  messageId?: string | undefined
  /** Parse inline think tags (default true). */
  thinkTags?: boolean | undefined
  /** Extra request body fields (e.g. `temperature`). */
  body?: Record<string, unknown> | undefined
  /** Clock, injectable for tests. */
  now?: (() => number) | undefined
}

export interface RunResult {
  outcome: AgentOutcome
  message: ChatMessage
  /** Human-readable error, when `outcome` is `error`. */
  error?: string
}

function toWireTools(tools: readonly AgentTool[]): WireTool[] {
  return tools.map((tool) => ({
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }))
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name
  return String(error)
}

function randomId(): string {
  return `msg_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

const STEP_LIMIT_MESSAGE = (steps: number) => `Stopped after ${steps} tool steps.`

export async function runAgent(options: RunOptions): Promise<RunResult> {
  const now = options.now ?? Date.now
  const signal = options.signal ?? new AbortController().signal
  const tools = options.tools ?? []
  const maxSteps = options.maxSteps ?? 10
  const emit = (state: TurnState) => options.onUpdate?.(state.message)

  let state = createTurn(options.messageId ?? randomId(), now(), options.model)
  emit(state)

  const finish = (outcome: AgentOutcome, error?: string): RunResult => {
    const finalized = finalizeTurn(state, now(), outcome === 'aborted' ? 'Aborted.' : 'Not run.')
    const message: ChatMessage =
      outcome === 'complete'
        ? finalized
        : {
            ...finalized,
            outcome:
              outcome === 'aborted'
                ? { kind: 'stopped' }
                : {
                    kind: 'error',
                    message: error ?? STEP_LIMIT_MESSAGE(maxSteps),
                    retryable: true,
                  },
          }
    options.onUpdate?.(message)
    return error === undefined ? { outcome, message } : { outcome, message, error }
  }

  for (let step = 0; step < maxSteps; step++) {
    if (signal.aborted) return finish('aborted')
    state = beginStep(state)
    try {
      const stream = options.client.streamCompletion({
        model: options.model,
        messages: encodeHistory([...options.history, state.message], options.system),
        tools: toWireTools(tools),
        thinkTags: options.thinkTags,
        body: options.body,
        signal,
      })
      for await (const event of stream) {
        // A transport that ignores the abort signal still stops here.
        if (signal.aborted) break
        state = applyEvent(state, event, now())
        emit(state)
      }
    } catch (error) {
      if (signal.aborted) return finish('aborted')
      return finish('error', errorMessage(error))
    }
    if (signal.aborted) return finish('aborted')

    const ended = endStep(state, now())
    state = ended.state
    emit(state)
    if (ended.calls.length === 0) return finish('complete')

    for (const call of ended.calls) {
      if (signal.aborted) return finish('aborted')
      if (call.status === 'error') continue
      state = await runTool(state, call, tools, options, signal, now, emit)
    }
  }
  return finish('max_steps')
}

async function runTool(
  input: TurnState,
  call: ToolCallBlock,
  tools: readonly AgentTool[],
  options: RunOptions,
  signal: AbortSignal,
  now: () => number,
  emit: (state: TurnState) => void,
): Promise<TurnState> {
  let state = input
  const tool = tools.find((t) => t.name === call.name)
  if (!tool) {
    state = updateToolCall(state, call.id, {
      status: 'error',
      result: { error: `Unknown tool: ${call.name || '(unnamed)'}` },
    })
    emit(state)
    return state
  }
  if (tool.requiresApproval) {
    state = updateToolCall(state, call.id, { approval: { state: 'pending' } })
    emit(state)
    let approved = false
    try {
      approved = options.approve ? await options.approve(call, signal) : false
    } catch {
      approved = false
    }
    if (signal.aborted) return state
    if (!approved) {
      state = updateToolCall(state, call.id, {
        status: 'error',
        result: { error: 'The user declined this tool call.' },
        approval: { state: 'denied' },
      })
      emit(state)
      return state
    }
    state = updateToolCall(state, call.id, { approval: { state: 'approved' } })
  }
  const startedAt = now()
  state = updateToolCall(state, call.id, { status: 'running', startedAt })
  emit(state)
  try {
    const result = await tool.execute(call.arguments, { signal, call })
    if (signal.aborted) return state
    state = updateToolCall(state, call.id, {
      status: 'success',
      result: result === undefined ? null : result,
      durationMs: Math.max(0, now() - startedAt),
    })
  } catch (error) {
    if (signal.aborted) return state
    state = updateToolCall(state, call.id, {
      status: 'error',
      result: { error: errorMessage(error) },
      durationMs: Math.max(0, now() - startedAt),
    })
  }
  emit(state)
  return state
}
