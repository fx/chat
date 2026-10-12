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
  /** Starred model ids, per profile id: listed first, and filterable. */
  favorites: Record<string, string[]>
  /** What prompts spoken to the app as the digital assistant run on. */
  assistant: AssistantSettings
}

/**
 * The assistant's endpoint and model. Unset (or bound to a deleted endpoint)
 * means the same as a new chat: the active endpoint and its model.
 */
export interface AssistantSettings {
  profileId?: string | undefined
  model?: string | undefined
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
  favorites: {},
  assistant: {},
}
