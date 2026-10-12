/**
 * Slash commands, offered through the core completion-provider contract: `/`
 * at the start of the input lists commands, and `/model ` lists the
 * endpoint's models (fetched once, filtered as you type).
 */
import type { CompletionItem, CompletionProvider } from '@fx-/chat-core'

export interface SlashCommand {
  name: string
  description: string
  /** Argument hint, e.g. `<id>`. */
  args?: string
}

export const COMMANDS: readonly SlashCommand[] = [
  { name: 'model', description: 'switch model', args: '<id>' },
  { name: 'system', description: 'set the system prompt (empty clears)', args: '<text>' },
  { name: 'tools', description: 'list built-in tools and toggle one', args: '[name]' },
  { name: 'expand', description: 'show reasoning and tool details (Ctrl+O)' },
  { name: 'retry', description: 're-run the last turn' },
  { name: 'new', description: 'start a new conversation' },
  { name: 'setup', description: 'change the endpoint (restarts the session)' },
  { name: 'help', description: 'list commands and keys' },
  { name: 'quit', description: 'exit' },
]

/** A parsed command line, or undefined for ordinary text. */
export function parseCommand(text: string): { name: string; arg: string } | undefined {
  const match = /^\/(\w+)(?:\s+([\s\S]*))?$/.exec(text.trim())
  if (!match) return undefined
  return { name: (match[1] as string).toLowerCase(), arg: (match[2] ?? '').trim() }
}

type Item = CompletionItem<never>

/** `/name` at the very start of the input. */
export const commandProvider: CompletionProvider<Item> = {
  id: 'commands',
  trigger: '/',
  match(text, caret) {
    const match = /^\/(\w*)$/.exec(text.slice(0, caret))
    const next = text[caret]
    if (!match || (next !== undefined && !/\s/.test(next))) return null
    return { query: match[1] as string, range: [0, caret] }
  },
  items(query) {
    const q = query.toLowerCase()
    return COMMANDS.filter((c) => c.name.startsWith(q)).map((c) => ({
      id: c.name,
      label: `/${c.name}${c.args ? ` ${c.args}` : ''}`,
      description: c.description,
    }))
  },
  apply(item, _before, after) {
    const value = `/${item.id} ${after.trimStart()}`
    return { value, caret: item.id.length + 2 }
  },
}

/** `/model <query>`: the endpoint's models, loaded lazily and cached. */
export function modelProvider(
  listModels: (signal: AbortSignal) => Promise<string[]>,
): CompletionProvider<Item> {
  let cache: Promise<string[]> | undefined
  return {
    id: 'models',
    trigger: '/',
    match(text, caret) {
      const match = /^\/model\s+(\S*)$/.exec(text.slice(0, caret))
      if (!match) return null
      const query = match[1] as string
      return { query, range: [caret - query.length, caret] }
    },
    async items(query, signal) {
      cache ??= listModels(signal).catch((error: unknown) => {
        cache = undefined
        throw error
      })
      const models = await cache
      const q = query.toLowerCase()
      return models.filter((m) => m.toLowerCase().includes(q)).map((m) => ({ id: m, label: m }))
    },
    apply(item, before, after) {
      return { value: `${before}${item.id}${after}`, caret: before.length + item.id.length }
    },
  }
}
