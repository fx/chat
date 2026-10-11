/**
 * Endpoint settings for `tx chat`: resolved from flags, then environment
 * variables, then the profile stored in tx's per-user config document.
 */
import type { ToolId } from '@fx/chat-agent'

/** The key this plugin owns in tx's config document. */
export const CONFIG_KEY = 'chat'

export interface ChatSettings {
  baseUrl: string
  apiKey?: string
  model: string
  /** System prompt applied to every turn. */
  system?: string
  /** Enabled built-in tools (default: time and calculator). */
  tools?: Partial<Record<ToolId, boolean>>
}

export interface ChatFlags {
  baseUrl?: string
  apiKey?: string
  model?: string
  system?: string
}

const isOptionalString = (v: unknown) => v === undefined || typeof v === 'string'

/** Validator for the stored value (tx config reads are only as safe as this). */
export function isChatSettings(value: unknown): value is ChatSettings {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.baseUrl === 'string' &&
    typeof v.model === 'string' &&
    isOptionalString(v.apiKey) &&
    isOptionalString(v.system) &&
    (v.tools === undefined ||
      (typeof v.tools === 'object' &&
        v.tools !== null &&
        Object.values(v.tools).every((t) => typeof t === 'boolean')))
  )
}

export const DEFAULT_TOOLS: Partial<Record<ToolId, boolean>> = {
  current_time: true,
  calculator: true,
  fetch_url: false,
}

/** Merge flags over environment over the stored profile. */
export function resolveSettings(
  flags: ChatFlags,
  env: Record<string, string | undefined>,
  stored: ChatSettings | undefined,
): Partial<ChatSettings> {
  const pick = (...values: Array<string | undefined>) =>
    values.find((v) => v !== undefined && v !== '')
  const baseUrl = pick(flags.baseUrl, env.OPENAI_BASE_URL, stored?.baseUrl)
  const apiKey = pick(flags.apiKey, env.OPENAI_API_KEY, stored?.apiKey)
  const model = pick(flags.model, env.OPENAI_MODEL, stored?.model)
  const system = pick(flags.system, stored?.system)
  return {
    ...(baseUrl ? { baseUrl } : {}),
    ...(apiKey ? { apiKey } : {}),
    ...(model ? { model } : {}),
    ...(system ? { system } : {}),
    tools: { ...DEFAULT_TOOLS, ...stored?.tools },
  }
}

/** Whether a resolved profile can start a chat. */
export function isComplete(settings: Partial<ChatSettings>): settings is ChatSettings {
  return Boolean(settings.baseUrl && settings.model)
}

/** The host part of a base URL, for the status line. */
export function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host
  } catch {
    return baseUrl
  }
}
