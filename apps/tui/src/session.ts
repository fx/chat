import { type AgentTool, type FetchLike, buildTools, createClient, runAgent } from '@fx/chat-agent'
import type { ChatMessage, ToolCallBlock } from '@fx/chat-core'
/**
 * The `tx chat` session, shared by the fullscreen and inline views: settings,
 * the conversation, the running turn, tool approvals, slash commands and the
 * queue of messages typed while an answer streams.
 */
import { React, ink } from '@fx/chat-ink'
import { COMMANDS, commandProvider, modelProvider, parseCommand } from './commands'
import { type ChatSettings, DEFAULT_TOOLS } from './settings'

export type ExitReason = 'quit' | 'setup'

export interface SessionOptions {
  settings: ChatSettings
  fetch: FetchLike
  /** Persist settings changed in-session (/model, /system, /tools). */
  onSettingsChange?: ((settings: ChatSettings) => void) | undefined
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

export interface Approval {
  call: ToolCallBlock
  resolve: (approved: boolean) => void
}

/** At most one transcript update per frame while streaming. */
const FRAME_MS = 33

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
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [run, setRun] = React.useState<{ messageId: string; startedAt: number }>()
  const [approval, setApproval] = React.useState<Approval>()
  const [notice, setNotice] = React.useState<string[]>([])
  const [expanded, setExpanded] = React.useState(false)
  const [epoch, setEpoch] = React.useState(0)
  const [queued, setQueued] = React.useState<string[]>([])
  const controller = React.useRef<AbortController | null>(null)
  const history = React.useRef<string[]>([])

  // Stream updates arrive far faster than a terminal can show them; apply
  // them at most once a frame (the latest state of each message wins).
  const pending = React.useRef(new Map<string, ChatMessage>())
  const flushTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const lastFlush = React.useRef(0)
  const flush = React.useCallback(() => {
    clearTimeout(flushTimer.current)
    flushTimer.current = undefined
    if (pending.current.size === 0) return
    const updates = [...pending.current.values()]
    pending.current.clear()
    lastFlush.current = performance.now()
    setMessages((current) => {
      let next = current
      for (const message of updates) {
        const index = next.findIndex((m) => m.id === message.id)
        next = index === -1 ? [...next, message] : next.map((m, i) => (i === index ? message : m))
      }
      return next
    })
  }, [])
  const queueUpdate = React.useCallback(
    (message: ChatMessage) => {
      pending.current.set(message.id, message)
      if (flushTimer.current !== undefined) return
      const wait = FRAME_MS - (performance.now() - lastFlush.current)
      if (wait <= 0) flush()
      else flushTimer.current = setTimeout(flush, wait)
    },
    [flush],
  )
  React.useEffect(() => () => clearTimeout(flushTimer.current), [])

  const client = React.useMemo(
    () => createClient({ baseUrl: settings.baseUrl, apiKey: settings.apiKey, fetch }),
    [settings.baseUrl, settings.apiKey, fetch],
  )
  const providers = React.useMemo(
    () => [modelProvider((signal) => client.listModels(signal)), commandProvider],
    [client],
  )

  const update = (next: ChatSettings) => {
    setSettings(next)
    onSettingsChange?.(next)
  }

  const quit = (reason: ExitReason) => {
    controller.current?.abort()
    onExit?.(reason)
    exit()
  }

  const stop = () => controller.current?.abort()

  const startRun = React.useCallback(
    async (turnHistory: ChatMessage[]) => {
      const abort = new AbortController()
      controller.current = abort
      const messageId = newId('a')
      setRun({ messageId, startedAt: now() })
      const tools: AgentTool[] = buildTools(settings.tools ?? DEFAULT_TOOLS, {}, { fetch })
      await runAgent({
        client,
        model: settings.model,
        history: turnHistory,
        system: settings.system,
        tools,
        signal: abort.signal,
        messageId,
        now,
        approve: (call, signal) =>
          new Promise<boolean>((resolve) => {
            flush()
            const settle = (approved: boolean) => {
              setApproval(undefined)
              resolve(approved)
            }
            signal.addEventListener('abort', () => settle(false), { once: true })
            setApproval({ call, resolve: settle })
          }),
        onUpdate: queueUpdate,
      })
      flush()
      controller.current = null
      setRun(undefined)
    },
    [
      client,
      fetch,
      flush,
      queueUpdate,
      newId,
      now,
      settings.model,
      settings.system,
      settings.tools,
    ],
  )

  const send = (text: string, base = messages) => {
    const user: ChatMessage = {
      id: newId('u'),
      role: 'user',
      blocks: [{ type: 'text', id: newId('t'), text }],
      createdAt: now(),
    }
    const next = [...base, user]
    setMessages(next)
    setNotice([])
    void startRun(next)
  }

  // Send the oldest queued message once the answer before it finishes.
  const sendRef = React.useRef(send)
  sendRef.current = send
  React.useEffect(() => {
    if (run || queued.length === 0) return
    const [next, ...rest] = queued as [string, ...string[]]
    setQueued(rest)
    sendRef.current(next)
  }, [run, queued])

  const retry = () => {
    let cut = messages.length
    while (cut > 0 && messages[cut - 1]?.role !== 'user') cut--
    if (cut === 0) return setNotice(['Nothing to retry.'])
    const turn = messages.slice(0, cut)
    setMessages(turn)
    clearScreen?.()
    setEpoch((e) => e + 1)
    void startRun(turn)
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
        setMessages([])
        setNotice([])
        setQueued([])
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
    if (parsed) command(parsed.name, parsed.arg)
    else if (!run) send(text)
    else if (queueing) setQueued((q) => [...q, text])
  }

  /** Take the newest queued message back (for editing); undefined when none. */
  const unqueue = (): string | undefined => {
    const last = queued.at(-1)
    if (last !== undefined) setQueued(queued.slice(0, -1))
    return last
  }

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
    retry,
    quit,
  }
}
