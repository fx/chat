/**
 * `tx chat` — an agent chat in the terminal, built on the @fx/chat libraries:
 * `@fx/chat-ink` renders, `@fx/chat-agent` talks to any OpenAI-compatible
 * endpoint, and tx supplies settings storage, the theme and setup dialogs.
 *
 * The plugin renders with the React and Ink tx injects (`api.dependencies`)
 * and ships no copy of either. `@fx/chat-ink` needs Ink 8, which tx provides
 * from 2.0; the manifest admits only tx 2, and the version check below
 * guards against a tx that loads the plugin regardless.
 */
import type { Config } from '@fx/tx/config'
import type { Dialogs } from '@fx/tx/dialogs'
import type { Plugin } from '@fx/tx/plugin'
import type { Theming } from '@fx/tx/theme'

import { createChatInk } from '@fx/chat-ink'
import { startChat } from './src/start'

/** The major version in a dependency spec such as `8.0.0` or `^8.1.0`. */
export function inkMajor(spec: string): number {
  return Number(/\d+/.exec(spec)?.[0] ?? 0)
}

const plugin: Plugin = (api) => {
  api.command((ns) =>
    ns
      .description('Agent chat with any OpenAI-compatible endpoint (fx/chat)')
      .option('--base-url <url>', 'endpoint base URL (env OPENAI_BASE_URL)')
      .option('--api-key <key>', 'API key (env OPENAI_API_KEY)')
      .option('-m, --model <id>', 'model id (env OPENAI_MODEL)')
      .option('--system <prompt>', 'system prompt for this session')
      .option('--setup', 'configure the endpoint before starting')
      .option('--inline', 'print into scrollback instead of taking the full screen')
      .action(async (options: Record<string, string | boolean | undefined>) => {
        const one = <T>(key: string): T => {
          const found = api.registrations<T>(key)
          if (found.length !== 1)
            throw new Error(`tx chat needs exactly one ${key} capability (found ${found.length})`)
          return found[0] as T
        }
        // Render with tx's own React and Ink: a tree takes one instance of each.
        const { react, ink, versions } = api.dependencies
        if (inkMajor(versions.ink) < 8)
          throw new Error(
            `tx chat needs a tx that provides Ink 8 (tx 2.0 or newer); this tx provides Ink ${versions.ink}.`,
          )
        createChatInk({ React: react, ink })
        const dialogs = api.registrations<Dialogs>('@fx/tx/dialogs')[0]
        const config = one<Config>('@fx/tx/config')
        const theming = one<Theming>('@fx/tx/theme')
        await startChat({
          context: api.context,
          config,
          theming,
          ...(dialogs ? { dialogs } : {}),
          flags: {
            ...(typeof options.baseUrl === 'string' ? { baseUrl: options.baseUrl } : {}),
            ...(typeof options.apiKey === 'string' ? { apiKey: options.apiKey } : {}),
            ...(typeof options.model === 'string' ? { model: options.model } : {}),
            ...(typeof options.system === 'string' ? { system: options.system } : {}),
          },
          setup: options.setup === true,
          inline: options.inline === true,
        })
      }),
  )
}

export default plugin
