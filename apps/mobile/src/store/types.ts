import type {
  ConversationMeta as BaseConversationMeta,
  ControllerState,
  PendingApproval,
  ToolId,
} from '@fx/chat-agent'

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

/** A conversation, bound to the profile (endpoint) it was started on. */
export interface ConversationMeta extends BaseConversationMeta {
  profileId?: string | undefined
  model?: string | undefined
}

export type { PendingApproval }

export interface AppState extends ControllerState<ConversationMeta> {
  settings: Settings
}

export const DEFAULT_SETTINGS: Settings = {
  profiles: [],
  systemPrompt: '',
  tools: { current_time: true, calculator: true, fetch_url: false },
  approvals: { current_time: false, calculator: false, fetch_url: true },
}
