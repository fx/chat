import {
  ChatController,
  type FetchLike,
  type PendingApproval,
  type QueuedMessage,
  createClient,
} from '@fx/chat-agent'
import type { ChatMessage } from '@fx/chat-core'
/**
 * The `tx chat` session, shared by the fullscreen and inline views: settings,
 * slash commands and notices over one `ChatController` conversation, which
 * owns the transcript, the running turn, tool approvals and the queue of
 * messages typed while an answer streams.
 */
import { React, ink, stripControls } from '@fx/chat-ink'
import { COMMANDS, commandProvider, modelProvider, parseCommand } from './commands'
import { type ChatSettings, DEFAULT_TOOLS } from './settings'

export type ExitReason = 'quit' | 'setup'

export interface SessionOptions {
  settings: ChatSettings
  fetch: FetchLike
  /** Persist settings changed in-session (/model, /system, /tools). */
  onSettingsChange?: ((settings: ChatSettings) => void | Promise<void>) | undefined
  /** Called once with why the app is exiting. */
  onExit?: ((reason: ExitReason) => void) | undefined
  /** Clear the terminal (used by /new and /retry in the inline view). */
  clearScreen?: (() => void) | undefined
  /** Queue messages typed while an answer streams (else they are dropped). */
  queue?: boolean
  /** Shown by /help after the commands. */
  help: string
  /** Clock and ids, injectable for tests. */
  now?: (() => number) | undefined
  newId?: ((prefix: string) => string) | undefined
}

export type Approval = PendingApproval

/** The session's one conversation (in memory; tx chat keeps no history). */
const CONVERSATION = 'tui'
/** At most one transcript update per frame while streaming. */
const FRAME_MS = 33
const NO_MESSAGES: ChatMessage[] = []
const NO_QUEUE: QueuedMessage[] = []

let counter = 0
const defaultId = (prefix: string) =>
  `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`

export function useChatSession({
  settings: initial,
  fetch,
  onSettingsChange,
  onExit,
  clearScreen,
  queue: queueing = false,
  help,
  now = Date.now,
  newId = defaultId,
}: SessionOptions) {
  const { exit } = ink.useApp()
  const [settings, setSettings] = React.useState(initial)
  const [notice, setNotice] = React.useState<string[]>([])
  const [expanded, setExpanded] = React.useState(false)
  const [epoch, setEpoch] = React.useState(0)
  const history = React.useRef<string[]>([])

  // Runs read the settings current when they start (/model, /system, /tools).
  const current = React.useRef(settings)
  current.current = settings
  const [chat] = React.useState(() => {
    const controller = new ChatController({
      fetch,
      now,
      newId,
      queue: queueing,
      updateIntervalMs: FRAME_MS,
      resolveRun: () => {
        const { baseUrl, apiKey, model, system, tools } = current.current
        return { baseUrl, apiKey, model, system, tools: tools ?? DEFAULT_TOOLS }
      },
    })
    void controller.createConversation({ id: CONVERSATION })
    return controller
  })
  React.useEffect(() => () => chat.dispose(), [chat])
  const state = React.useSyncExternalStore(chat.subscribe, chat.getState)
  const messages = state.messages[CONVERSATION] ?? NO_MESSAGES
  const run = state.runs[CONVERSATION]
  const approval = state.approvals[0]
  const queue = state.queued[CONVERSATION] ?? NO_QUEUE
  const queued = React.useMemo(() => queue.map((q) => q.text), [queue])

  const client = React.useMemo(
    () => createClient({ baseUrl: settings.baseUrl, apiKey: settings.apiKey, fetch }),
    [settings.baseUrl, settings.apiKey, fetch],
  )
  const providers = React.useMemo(
    () => [modelProvider((signal) => client.listModels(signal)), commandProvider],
    [client],
  )

  const failure = (error: unknown) =>
    stripControls(error instanceof Error ? error.message : String(error))

  /** Persisting is best effort: a failed save is a notice, never a crash. */
  const save = async (next: ChatSettings) => {
    try {
      await onSettingsChange?.(next)
    } catch (error) {
      setNotice([`Could not save settings: ${failure(error)}`])
    }
  }

  const update = (next: ChatSettings) => {
    current.current = next
    setSettings(next)
    void save(next)
  }

  const quit = (reason: ExitReason) => {
    chat.dispose()
    onExit?.(reason)
    exit()
  }

  const stop = () => void chat.stop(CONVERSATION)

  /**
   * Ctrl+C: the first press stops a running turn (a pending approval settles
   * as stopped, not declined); a press when idle, or while a stopped turn is
   * still winding down, quits.
   */
  const interrupt = () => {
    if (!chat.stop(CONVERSATION)) quit('quit')
  }

  /** A turn is running: /retry and /new would race it. */
  const busy = () => {
    if (!chat.getState().runs[CONVERSATION]) return false
    setNotice(['An answer is running. Stop it first (Esc or Ctrl+C).'])
    return true
  }

  // A run that could not start (it throws, unlike a failed answer).
  const error = state.errors[CONVERSATION]
  React.useEffect(() => {
    if (error) setNotice([`Could not start the answer: ${stripControls(error.message)}`])
  }, [error])

  const retry = () => {
    if (busy()) return
    if (!messages.some((m) => m.role === 'user')) return setNotice(['Nothing to retry.'])
    // Cuts the transcript back to the last user message synchronously.
    void chat.regenerate(CONVERSATION)
    clearScreen?.()
    setEpoch((e) => e + 1)
  }

  const command = (name: string, arg: string) => {
    switch (name) {
      case 'model':
        if (!arg)
          return setNotice([`model: ${settings.model}`, 'Type /model and a space to pick one.'])
        update({ ...settings, model: arg })
        return setNotice([`model: ${arg}`])
      case 'system': {
        const { system: _previous, ...rest } = settings
        update(arg ? { ...rest, system: arg } : rest)
        return setNotice([arg ? 'System prompt set.' : 'System prompt cleared.'])
      }
      case 'tools': {
        const tools = { ...DEFAULT_TOOLS, ...settings.tools }
        if (arg) {
          if (!(arg in tools)) return setNotice([`Unknown tool: ${arg}`])
          const key = arg as keyof typeof tools
          tools[key] = !tools[key]
          update({ ...settings, tools })
        }
        return setNotice(Object.entries(tools).map(([k, on]) => `${on ? '●' : '○'} ${k}`))
      }
      case 'expand':
        return setExpanded((e) => !e)
      case 'retry':
        return retry()
      case 'new':
        if (busy()) return
        chat.clear(CONVERSATION)
        setNotice([])
        clearScreen?.()
        return setEpoch((e) => e + 1)
      case 'setup':
        return quit('setup')
      case 'help':
        return setNotice([
          ...COMMANDS.map((c) => `/${c.name}${c.args ? ` ${c.args}` : ''} — ${c.description}`),
          help,
        ])
      case 'quit':
      case 'exit':
        return quit('quit')
      default:
        return setNotice([`Unknown command /${name}. Try /help.`])
    }
  }

  const submit = (text: string) => {
    history.current.push(text)
    const parsed = parseCommand(text)
    if (parsed) return command(parsed.name, parsed.arg)
    // While an answer streams the controller queues the message (or drops it).
    if (!chat.getState().runs[CONVERSATION]) setNotice([])
    void chat.send(CONVERSATION, text)
  }

  /** Take the newest queued message back (for editing); undefined when none. */
  const unqueue = (): string | undefined => chat.unqueue(CONVERSATION)?.text

  return {
    settings,
    messages,
    run,
    approval,
    notice,
    setNotice,
    expanded,
    setExpanded,
    epoch,
    queued,
    unqueue,
    providers,
    history: history.current,
    submit,
    stop,
    interrupt,
    retry,
    quit,
  }
}
