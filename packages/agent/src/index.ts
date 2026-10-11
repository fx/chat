/**
 * `@fx/chat-agent` — a UI-free agent runtime for `@fx/chat`.
 *
 * Streams any OpenAI-compatible Chat Completions endpoint into
 * `@fx/chat-core` `ChatMessage`s (text, reasoning, tool calls, metrics), runs
 * the tool loop with optional approval, and encodes conversations back into
 * request messages. No UI, no backend: the HTTP transport is injectable.
 * `ChatController` adds the conversation mechanics apps share: transcripts,
 * runs, approvals and queued messages, persisted to a key-value store.
 */
export type { AgentMeta, ReasoningSegment, StepMeta, TurnState } from './accumulate'
export {
  AGENT_META_KEY,
  applyEvent,
  beginStep,
  createTurn,
  endStep,
  finalizeTurn,
  readAgentMeta,
  updateToolCall,
} from './accumulate'
export type { Client, ClientOptions, CompletionRequest, FetchLike, ModelInfo } from './client'
export { AgentError, createClient } from './client'
export type {
  ActiveRun,
  ControllerOptions,
  ControllerState,
  ConversationMeta,
  PendingApproval,
  QueuedMessage,
  RunConfig,
  RunError,
  RunResolution,
} from './controller'
export { ChatController, newId, titleFrom } from './controller'
export { encodeHistory, flattenToolHistory, splitSteps, toolResultContent } from './encode'
export type { AgentOutcome, RunOptions, RunResult } from './run'
export { runAgent } from './run'
export { parseSSE } from './sse'
export type { KeyValueStore } from './storage'
export { indexedDbStore, memoryStore } from './storage'
export type { BuiltinToolOptions, ToolId, ToolInfo } from './tools/builtin'
export { FETCH_TEXT_LIMIT, TOOL_INFO, buildTools, stripHtml } from './tools/builtin'
export { evaluate as evaluateArithmetic } from './tools/calculator'
export type { ThinkPiece } from './think'
export { ThinkSplitter } from './think'
export type {
  AgentTool,
  ReasoningField,
  StreamEvent,
  ToolContext,
  Usage,
  WireContentPart,
  WireMessage,
  WireTool,
  WireToolCall,
} from './types'
