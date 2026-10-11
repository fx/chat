/**
 * History encoder: `ChatMessage[]` → Chat Completions request messages.
 *
 * Assistant turns span several steps (see `accumulate.ts`); each step becomes
 * an assistant message (text + `tool_calls`, plus its reasoning echoed under
 * the field it arrived on) followed by one `tool` message per call. Status and
 * custom blocks are never sent; reasoning parsed from think tags is not sent.
 */
import type { ChatMessage, ContentBlock, ToolCallBlock } from '@fx/chat-core'
import { type StepMeta, readAgentMeta } from './accumulate'
import type { ReasoningField, WireContentPart, WireMessage } from './types'

/** Serialize a tool result for the `tool` message content. */
export function toolResultContent(block: ToolCallBlock): string {
  if (block.result === undefined) {
    return JSON.stringify({ error: block.status === 'error' ? 'Tool failed.' : 'No result.' })
  }
  return typeof block.result === 'string' ? block.result : JSON.stringify(block.result)
}

function textOf(blocks: readonly ContentBlock[], type: 'text' | 'system' | 'reasoning'): string {
  return blocks
    .filter((b): b is Extract<ContentBlock, { type: typeof type }> => b.type === type)
    .map((b) => b.text)
    .join('')
}

/**
 * Split an assistant message's blocks into steps. Uses the recorded step
 * starts when present; otherwise a new step begins at the first non-tool block
 * that follows a tool call.
 */
export function splitSteps(
  message: ChatMessage,
): Array<{ blocks: ContentBlock[]; meta?: StepMeta }> {
  const recorded = readAgentMeta(message)?.steps
  if (recorded && recorded.length > 0) {
    return recorded.map((step, i) => ({
      blocks: message.blocks.slice(step.start, recorded[i + 1]?.start ?? message.blocks.length),
      meta: step,
    }))
  }
  const steps: Array<{ blocks: ContentBlock[] }> = []
  let current: ContentBlock[] = []
  let sawTool = false
  for (const block of message.blocks) {
    if (block.type !== 'tool_call' && sawTool) {
      steps.push({ blocks: current })
      current = []
      sawTool = false
    }
    if (block.type === 'tool_call') sawTool = true
    current.push(block)
  }
  if (current.length > 0) steps.push({ blocks: current })
  return steps
}

function encodeUser(message: ChatMessage): WireMessage {
  const text = textOf(message.blocks, 'text')
  const images = (message.attachments ?? []).filter((a) => a.kind === 'image')
  if (images.length === 0) return { role: 'user', content: text }
  const parts: WireContentPart[] = []
  if (text) parts.push({ type: 'text', text })
  for (const image of images) parts.push({ type: 'image_url', image_url: { url: image.url } })
  return { role: 'user', content: parts }
}

/**
 * The step's delta-field reasoning, joined per field, using the recorded
 * segments to slice the step's reasoning text. Think-tag segments (no field)
 * are dropped; without segments nothing is echoed.
 */
function fieldReasoning(
  blocks: readonly ContentBlock[],
  meta: StepMeta | undefined,
): Partial<Record<ReasoningField, string>> {
  const all = textOf(blocks, 'reasoning')
  const out: Partial<Record<ReasoningField, string>> = {}
  let offset = 0
  for (const segment of meta?.reasoning ?? []) {
    const piece = all.slice(offset, offset + segment.length)
    offset += segment.length
    if (segment.field && piece) out[segment.field] = (out[segment.field] ?? '') + piece
  }
  return out
}

function encodeAssistant(message: ChatMessage): WireMessage[] {
  const out: WireMessage[] = []
  for (const step of splitSteps(message)) {
    const text = textOf(step.blocks, 'text')
    const calls = step.blocks.filter((b): b is ToolCallBlock => b.type === 'tool_call')
    const reasoning = fieldReasoning(step.blocks, step.meta)
    const hasReasoning = Object.keys(reasoning).length > 0
    if (!text && calls.length === 0 && !hasReasoning) continue
    const assistant: Extract<WireMessage, { role: 'assistant' }> = {
      role: 'assistant',
      // A reasoning-only step still goes back; content is then empty, not null.
      content: text || (calls.length > 0 ? null : ''),
    }
    if (calls.length > 0) {
      assistant.tool_calls = calls.map((call) => ({
        id: call.id,
        type: 'function',
        function: {
          name: call.name,
          arguments:
            typeof call.arguments === 'string'
              ? call.arguments
              : JSON.stringify(call.arguments ?? {}),
        },
      }))
    }
    Object.assign(assistant, reasoning)
    out.push(assistant)
    for (const call of calls) {
      out.push({ role: 'tool', tool_call_id: call.id, content: toolResultContent(call) })
    }
  }
  return out
}

/** Encode a conversation (optionally prefixed by a system prompt). */
export function encodeHistory(history: readonly ChatMessage[], system?: string): WireMessage[] {
  const out: WireMessage[] = []
  if (system?.trim()) out.push({ role: 'system', content: system })
  for (const message of history) {
    if (message.role === 'user') out.push(encodeUser(message))
    else if (message.role === 'assistant') out.push(...encodeAssistant(message))
    else {
      const text = textOf(message.blocks, 'system') || textOf(message.blocks, 'text')
      if (text) out.push({ role: 'system', content: text })
    }
  }
  return out
}
