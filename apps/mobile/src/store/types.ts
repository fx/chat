import type { ToolId } from '@fx/chat-agent'
import type { ChatMessage, ToolCallBlock } from '@fx/chat-core'

/** An OpenAI-compatible endpoint the user configured. */
export interface Profile {
  id: string
  name: string
  /** e.g. `https://api.openai.com/v1` or `http://192.168.1.20:11434/v1`. */
  baseUrl: string
  /** Stored on-device only; sent only to `baseUrl`. */
  apiKey: string
  /** Default model for new conversations. */
  model: string
}

export interface Settings {
  profiles: Profile[]
  activeProfileId?: string | undefined
  /** Applied to every new turn when non-blank. */
  systemPrompt: string
  /** Which built-in tools are enabled. */
  tools: Record<ToolId, boolean>
  /** Per-tool approval requirement. */
  approvals: Record<ToolId, boolean>
}

export interface ConversationMeta {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  profileId?: string | undefined
  model?: string | undefined
}

export interface PendingApproval {
  id: string
  conversationId: string
  call: ToolCallBlock
  resolve: (approved: boolean) => void
}

export interface AppState {
  loaded: boolean
  settings: Settings
  /** Ordered by last activity, newest first. */
  conversations: ConversationMeta[]
  /** Loaded transcripts by conversation id. */
  messages: Record<string, ChatMessage[]>
  /** Active runs by conversation id. */
  runs: Record<string, { messageId: string }>
  /** Last run error by conversation id. */
  errors: Record<string, { message: string; at: number }>
  approvals: PendingApproval[]
}

export const DEFAULT_SETTINGS: Settings = {
  profiles: [],
  systemPrompt: '',
  tools: { current_time: true, calculator: true, fetch_url: false },
  approvals: { current_time: false, calculator: false, fetch_url: true },
}
