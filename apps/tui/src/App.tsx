import type { FetchLike } from '@fx-/chat-agent'
/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
/**
 * The `tx chat` session: an agent conversation rendered by `@fx-/chat-ink`,
 * driven by `@fx-/chat-agent`, with tool approvals, slash commands and
 * keyboard control. Conversations live for the session only.
 */
import { React, ink } from '@fx-/chat-ink'
import { Composer, Styled, Transcript } from '@fx-/chat-ink'
import { approvalArguments } from './approval'
import { type ExitReason, useChatSession } from './session'
import { type ChatSettings, hostOf } from './settings'

export type { ExitReason } from './session'

export interface AppProps {
  settings: ChatSettings
  fetch: FetchLike
  /** Persist settings changed in-session (/model, /system, /tools). */
  onSettingsChange?: (settings: ChatSettings) => void
  /** Called once with why the app is exiting. */
  onExit?: (reason: ExitReason) => void
  /** Clear the terminal (used by /new). */
  clearScreen?: () => void
  /** Clock and ids, injectable for tests. */
  now?: () => number
  newId?: (prefix: string) => string
}

const HINT = 'Enter send · Alt+Enter newline · Esc stop · Ctrl+O details · /help · Ctrl+C quit'

/** The inline (scrollback) view: finished messages print into scrollback, the live turn redraws. */
export function App(props: AppProps) {
  const session = useChatSession({ ...props, help: HINT })
  const { settings, messages, run, approval, notice, setNotice, expanded, setExpanded, epoch } =
    session

  ink.useInput((input, key) => {
    // Ctrl+C and Ctrl+O come before the approval keys: an approval is part of
    // a running turn, which Ctrl+C stops (settling the approval as stopped).
    if (key.ctrl && input === 'c') return session.interrupt()
    if (key.ctrl && input === 'o') return setExpanded((e) => !e)
    if (!approval) return
    if (input === 'y' || input === 'Y' || key.return) approval.resolve(true)
    else if (input === 'n' || input === 'N' || key.escape) approval.resolve(false)
  })

  return (
    <ink.Box flexDirection="column">
      <Transcript
        key={epoch}
        messages={messages}
        isStreaming={Boolean(run)}
        streamingMessageId={run?.messageId}
        expanded={expanded}
        retryHint="/retry"
      />
      {notice.length > 0 ? (
        <ink.Box flexDirection="column" marginBottom={1}>
          {notice.map((line, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: notice lines have no identity beyond position
            <Styled key={i} tone="muted">
              {line}
            </Styled>
          ))}
        </ink.Box>
      ) : null}
      {approval ? (
        <ink.Box flexDirection="column" borderStyle="round" paddingX={1}>
          <Styled tone="strong">Allow {approval.call.name}?</Styled>
          <ink.Text>{approvalArguments(approval.call.arguments)}</ink.Text>
          <Styled tone="muted">y / Enter allow · n / Esc deny</Styled>
        </ink.Box>
      ) : (
        <Composer
          onSubmit={session.submit}
          onEscape={() => (run ? session.stop() : setNotice([]))}
          providers={session.providers}
          history={session.history}
          placeholder={run ? 'Replying… (Esc to stop)' : 'Message'}
          hint={`${settings.model} · ${hostOf(settings.baseUrl)} · ${HINT}`}
        />
      )}
    </ink.Box>
  )
}
