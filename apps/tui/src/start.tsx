import type { FetchLike } from '@fx/chat-agent'
/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
/**
 * Session bootstrap for `tx chat`: resolve settings (running setup dialogs
 * when needed), resolve tx's theme for stdout, and render the app. `/setup`
 * exits the app, re-runs setup, and starts a fresh session.
 */
import { React, ink } from '@fx/chat-ink'
import { InkChatProvider } from '@fx/chat-ink'
import { createKittyProvider, detectKitty } from '@fx/chat-ink/kitty'
import { createJpegDecoder } from '@fx/chat-ink/kitty-jpeg'
import type { Config } from '@fx/tx/config'
import type { Dialogs } from '@fx/tx/dialogs'
import type { Theming } from '@fx/tx/theme'
import { App, type ExitReason } from './App'
import { Fullscreen } from './Fullscreen'
import { TerminalMarkdown } from './markdown'
import {
  CONFIG_KEY,
  type ChatFlags,
  type ChatSettings,
  isChatSettings,
  isComplete,
  resolveSettings,
} from './settings'
import { runSetup } from './setup'
import { inkThemeFrom } from './theme'

export interface StartOptions {
  context: {
    stdin: NodeJS.ReadStream
    stdout: NodeJS.WriteStream
    stderr: NodeJS.WriteStream
    env: Record<string, string | undefined>
  }
  config: Config
  theming: Theming
  dialogs?: Dialogs
  flags: ChatFlags
  /** Run setup even when settings are complete. */
  setup: boolean
  /** Scrollback mode instead of fullscreen. */
  inline?: boolean
  fetch?: FetchLike
  /** Injectable for tests. */
  renderApp?: typeof ink.render
}

export const NOT_CONFIGURED =
  'No endpoint configured. Pass --base-url and --model, set OPENAI_BASE_URL and OPENAI_MODEL, or run `tx chat --setup` in a terminal.'

export async function startChat(options: StartOptions): Promise<void> {
  const { context, config, theming, dialogs, flags } = options
  const fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init))
  const renderApp = options.renderApp ?? ink.render
  config.define(CONFIG_KEY, isChatSettings)
  let stored = await config.read<ChatSettings>(CONFIG_KEY)
  let setup = options.setup

  for (;;) {
    let settings = resolveSettings(flags, context.env, stored)
    if (setup || !isComplete(settings)) {
      if (!dialogs || !context.stdin.isTTY) throw new Error(NOT_CONFIGURED)
      const configured = await runSetup(dialogs, fetch, settings)
      if (!configured) return
      await config.write(CONFIG_KEY, configured)
      stored = configured
      settings = configured
    }
    if (!isComplete(settings)) throw new Error(NOT_CONFIGURED)
    if (!context.stdin.isTTY || !context.stdout.isTTY) {
      throw new Error('tx chat needs an interactive terminal.')
    }

    const exit: { reason: ExitReason } = { reason: 'quit' }
    const theme = inkThemeFrom(theming.theme(context.stdout))
    const persist = (next: ChatSettings) => {
      // Only what the user changed in-session is written over the stored
      // profile. Without one, the session's endpoint is saved WITHOUT its key:
      // a key that came from a flag or the environment never lands on disk.
      const { system: _system, ...base } = stored ?? { baseUrl: next.baseUrl, model: next.model }
      stored = {
        ...base,
        model: next.model,
        ...(next.tools ? { tools: next.tools } : {}),
        ...(next.system ? { system: next.system } : {}),
      }
      void config.write(CONFIG_KEY, stored)
    }
    const onExit = (why: ExitReason) => {
      exit.reason = why
    }
    const write = (data: string) => context.stdout.write(data)
    let instance: ReturnType<typeof ink.render>
    if (options.inline) {
      instance = renderApp(
        <InkChatProvider components={{ theme, Markdown: TerminalMarkdown }}>
          <App
            settings={settings}
            fetch={fetch}
            onSettingsChange={persist}
            onExit={onExit}
            clearScreen={() => write('\u001b[2J\u001b[3J\u001b[H')}
          />
        </InkChatProvider>,
        {
          stdin: context.stdin,
          stdout: context.stdout,
          stderr: context.stderr,
          exitOnCtrlC: false,
          patchConsole: false,
        },
      )
    } else {
      // Images draw on kitty-protocol terminals (PNG, and JPEG decoded and
      // downscaled): data URLs at once, others on click.
      const images = detectKitty(context.env)
        ? createKittyProvider({ write, decode: createJpegDecoder() })
        : undefined
      instance = renderApp(
        <InkChatProvider components={{ theme }}>
          <Fullscreen
            settings={settings}
            fetch={fetch}
            onSettingsChange={persist}
            onExit={onExit}
            images={images}
            write={write}
          />
        </InkChatProvider>,
        {
          stdin: context.stdin,
          stdout: context.stdout,
          stderr: context.stderr,
          exitOnCtrlC: false,
          patchConsole: false,
          alternateScreen: true,
          // Rewrite only the rows that changed, not the whole screen, each frame.
          incrementalRendering: true,
        },
      )
    }
    await instance.waitUntilExit()
    if (exit.reason !== 'setup') return
    setup = true
  }
}
