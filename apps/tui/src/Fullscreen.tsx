import type { FetchLike } from '@fx-/chat-agent'
import type { DetailLevel } from '@fx-/chat-core'
/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
/**
 * The fullscreen `tx chat` view: a scrolling transcript in the threaded
 * frame, a status line, queued messages and a borderless composer, laid out
 * to fill the terminal (the app runs it on the alternate screen).
 *
 * Keys: PgUp/PgDn and Shift+↑/↓ scroll (the wheel too); Ctrl+T cycles detail;
 * Ctrl+R retries after a failed or stopped answer; Esc closes details, clears
 * the input, takes back the last queued message, or stops a running turn, in
 * that order; Ctrl+C stops, or quits when idle (or when a stopped turn is
 * still winding down). Mouse drag copies. While an approval is shown, y/Enter
 * allow, n/Esc deny, and scrolling, ^T, ^O and Ctrl+C keep working.
 */
import { React, ink } from '@fx-/chat-ink'
import {
  Composer,
  type ComposerValue,
  EmptyState,
  type ImageProvider,
  PendingRows,
  type Scroll,
  StatusLine,
  Styled,
  TranscriptViewport,
  composerRows,
  emptyComposerValue,
  scrollEnd,
  threadedFrame,
} from '@fx-/chat-ink'
import { approvalArguments } from './approval'
import { type ExitReason, useChatSession } from './session'
import { type ChatSettings, hostOf } from './settings'

export interface FullscreenProps {
  settings: ChatSettings
  fetch: FetchLike
  onSettingsChange?: (settings: ChatSettings) => void
  onExit?: (reason: ExitReason) => void
  /** Draws images (kitty terminals); the viewport sends its query and routes the reply. */
  images?: ImageProvider | undefined
  /** Terminal escapes (mouse reporting, copies, the image query) go through this; default stdout. */
  write?: (data: string) => void
  /** Terminal size override (tests); default the window size. */
  size?: { columns: number; rows: number }
  now?: () => number
  newId?: (prefix: string) => string
}

const HELP =
  'Enter send · Alt+Enter newline · Esc close/clear/unqueue/stop · PgUp/PgDn scroll · ^T details · ^R retry · drag to copy (Shift+drag: terminal) · ^C quit'
const COMPOSER_ROWS = 6

export function Fullscreen({ images, write, size, ...props }: FullscreenProps) {
  const session = useChatSession({ ...props, queue: true, help: HELP })
  const { settings, messages, run, approval, notice, setNotice } = session
  const window = ink.useWindowSize()
  const columns = size?.columns ?? window.columns
  const rows = size?.rows ?? window.rows
  const [draft, setDraft] = React.useState<ComposerValue>(emptyComposerValue)
  const [scroll, setScroll] = React.useState<Scroll>(scrollEnd)
  const [detail, setDetail] = React.useState<DetailLevel>('collapsed')
  const [below, setBelow] = React.useState(0)
  const [status, setStatus] = React.useState<{ text: string; tone: 'positive' | 'danger' }>()

  // A new turn brings the view back to the bottom.
  const turns = messages.filter((m) => m.role === 'user').length
  React.useEffect(() => {
    if (turns > 0) setScroll(scrollEnd)
  }, [turns])

  const last = messages.at(-1)
  const failed = !run && last?.role === 'assistant' && last.outcome !== undefined

  ink.useInput((input, key) => {
    // Ctrl+C comes before the approval keys: an approval is part of a running
    // turn, which Ctrl+C stops (settling the approval as stopped).
    if (key.ctrl && input === 'c') return session.interrupt()
    if (!approval) return
    // The composer (which owns Ctrl+O) is hidden while an approval is shown.
    if (key.ctrl && input === 'o') setDetail((d) => (d === 'collapsed' ? 'details' : 'collapsed'))
    else if (input === 'y' || input === 'Y' || key.return) approval.resolve(true)
    else if (input === 'n' || input === 'N' || key.escape) approval.resolve(false)
  })

  const onKey = (
    input: string,
    key: { ctrl: boolean; escape: boolean; shift: boolean; upArrow: boolean; downArrow: boolean },
  ) => {
    setStatus(undefined)
    // Shift+↑/↓ scroll the transcript (the viewport's keys), not the input.
    if (key.shift && (key.upArrow || key.downArrow)) return true
    if (key.ctrl && input === 'r') {
      if (failed) session.retry()
      return true
    }
    if (key.ctrl && input === 'o') {
      setDetail((d) => (d === 'collapsed' ? 'details' : 'collapsed'))
      return true
    }
    if (!key.escape) return false
    if (detail !== 'collapsed') setDetail('collapsed')
    else if (draft.text || draft.attachments.length) setDraft(emptyComposerValue)
    else {
      const taken = session.unqueue()
      if (taken !== undefined) setDraft({ text: taken, caret: taken.length, attachments: [] })
      else if (run) session.stop()
      else setNotice([])
    }
    return true
  }

  const inputRows = approval
    ? 0
    : composerRows(draft, columns, { variant: 'plain', maxRows: COMPOSER_ROWS })
  // Border, title and hint around the arguments.
  const approvalRows = approval
    ? 4 + approvalArguments(approval.call.arguments).split('\n').length
    : 0
  const pendingRows = Math.min(3, session.queued.length)
  const height = Math.max(1, rows - 1 - inputRows - approvalRows - pendingRows - notice.length)
  const live =
    run && last?.id === run.messageId ? { message: last, startedAt: run.startedAt } : undefined

  return (
    <ink.Box flexDirection="column" width={columns} height={rows} overflow="hidden">
      {/* Completion items under the composer take rows from the transcript while open. */}
      <ink.Box flexShrink={1} overflow="hidden" flexDirection="column">
        <TranscriptViewport
          messages={messages}
          width={columns}
          height={height}
          streamingMessageId={run?.messageId}
          scroll={scroll}
          onScroll={setScroll}
          onGeometry={(g) => setBelow(g.below)}
          detail={detail}
          onDetailChange={setDetail}
          frame={threadedFrame}
          hints={{ retry: '^R again', details: '^T details', close: 'Esc close' }}
          keys={{ homeEnd: draft.text === '' }}
          {...(images ? { images } : {})}
          {...(write ? { write } : {})}
          mouse={{
            onCopy: (_text, description) =>
              setStatus({ text: `Copied ${description}`, tone: 'positive' }),
          }}
          empty={
            <EmptyState
              title="tx chat"
              subtitle={`${settings.model} · ${hostOf(settings.baseUrl)}`}
              notes={['Enter send · /help commands · ^C quit']}
            />
          }
        />
      </ink.Box>
      <StatusLine width={columns} live={live} notice={status} below={below} />
      <PendingRows items={session.queued.map((text) => ({ text }))} width={columns} />
      {notice.map((line, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: notice lines have no identity beyond position
        <Styled key={i} tone="muted" wrap="truncate-end">
          {line}
        </Styled>
      ))}
      {approval ? (
        <ink.Box flexDirection="column" borderStyle="round" paddingX={1} flexShrink={0}>
          <Styled tone="strong">Allow {approval.call.name}?</Styled>
          <ink.Text>{approvalArguments(approval.call.arguments)}</ink.Text>
          <Styled tone="muted">y / Enter allow · n / Esc deny</Styled>
        </ink.Box>
      ) : (
        <Composer
          variant="plain"
          width={columns}
          maxRows={COMPOSER_ROWS}
          value={draft}
          onChange={setDraft}
          onSubmit={(text) => {
            setStatus(undefined)
            session.submit(text)
          }}
          onKey={onKey}
          providers={session.providers}
          history={session.history}
          placeholder={run ? 'Replying… (Enter queues, Esc stops)' : 'Message'}
          kittyKeyboard
        />
      )}
    </ink.Box>
  )
}
