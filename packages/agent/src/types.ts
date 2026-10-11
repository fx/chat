/**
 * Wire and runtime types for the agent runtime.
 *
 * The `Wire*` types are the subset of the OpenAI Chat Completions request
 * shape this package sends. `StreamEvent` is the normalized, transport-neutral
 * event stream the accumulator consumes, so a second transport can feed the
 * same accumulator later.
 */
import type { ToolCallBlock } from '@fx/chat-core'

/** Delta fields that carry reasoning on common OpenAI-compatible servers. */
export type ReasoningField = 'reasoning_content' | 'reasoning'

/** A `tool_calls[]` entry on an assistant wire message. */
export interface WireToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/** A content part of a multimodal user message. */
export type WireContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

/** A Chat Completions request message. */
export type WireMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | WireContentPart[] }
  | {
      role: 'assistant'
      content: string | null
      tool_calls?: WireToolCall[]
      reasoning_content?: string
      reasoning?: string
    }
  | { role: 'tool'; tool_call_id: string; content: string }

/** A function tool definition as sent to the endpoint. */
export interface WireTool {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

/** Token usage reported by the endpoint. */
export interface Usage {
  prompt?: number
  completion?: number
  total?: number
  /** Cost the endpoint reported for this usage (e.g. a `cost` field), when any. */
  cost?: number
}

/** One normalized event from a streaming completion. */
export type StreamEvent =
  | { type: 'model'; model: string }
  | { type: 'text'; text: string }
  /** `field` is the delta field it arrived on; absent when parsed from think tags. */
  | { type: 'reasoning'; text: string; field?: ReasoningField }
  | { type: 'tool_call'; index: number; id?: string; name?: string; arguments?: string }
  | { type: 'usage'; usage: Usage }
  | { type: 'finish'; reason: string }

/** Context handed to a tool executor. */
export interface ToolContext {
  /** The run's abort signal; long-running tools MUST honor it. */
  signal: AbortSignal
  /** The tool-call block being executed. */
  call: ToolCallBlock
}

/** A host-registered tool. */
export interface AgentTool {
  name: string
  description: string
  /** JSON Schema for the arguments object. */
  parameters: Record<string, unknown>
  /** When true, the host's approval callback is consulted before every call. */
  requiresApproval?: boolean
  /** Run the tool. The resolved value is recorded as the result and sent back to the model. */
  execute(args: unknown, context: ToolContext): Promise<unknown> | unknown
}
