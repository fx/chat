/**
 * The `MessageDetails` presenter: a compact footer's details and actions in a
 * bottom sheet — the model as the title, the other facts as a labelled list,
 * the activity (the package's rows, scrolled to the item it was opened for),
 * then full-width actions (copy first). Touch-first; the registry provides it
 * with `createShadcnComponents({ touch: true })`.
 */
import type { MessageDetailsProps } from '@fx-/chat'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from './cn'
import { lucideIcons } from './icons'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from './ui/drawer'

const CopyIcon = lucideIcons.copy
const CheckIcon = lucideIcons.check

/** How long the copy action shows its check before the sheet closes, in ms. */
export const COPIED_CLOSE_MS = 600

const ACTION =
  'flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-[0.9375rem] font-medium text-foreground outline-none active:bg-muted focus-visible:bg-muted cursor-pointer'

/** Scroll the activity item `id` within `area` into view, if both exist. */
function scrollToItem(area: HTMLElement | null, id: string | undefined) {
  if (!area || id === undefined) return
  const items = area.querySelectorAll<HTMLElement>('[data-block-id]')
  const target = [...items].find((item) => item.getAttribute('data-block-id') === id)
  target?.scrollIntoView({ block: 'nearest' })
}

export function MessageDetailsSheet({
  open,
  onOpenChange,
  details,
  outcome,
  copyText,
  actions,
  activity,
  focusId,
}: MessageDetailsProps) {
  const [copied, setCopied] = useState(false)
  const scroller = useRef<HTMLDivElement | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Whether the sheet is open now: a copy that settles after the sheet closed
  // (or unmounted) must not schedule a close that would hit a reopened sheet.
  const isOpen = useRef(open)
  isOpen.current = open
  useEffect(
    () => () => {
      isOpen.current = false
      clearTimeout(timer.current)
    },
    [],
  )
  useEffect(() => {
    if (open) return
    // Closed by any means (overlay, Escape, swipe): drop a pending close.
    clearTimeout(timer.current)
    setCopied(false)
  }, [open])
  // Bring the item the sheet was opened for into view: when the sheet's
  // content mounts (the portal renders it a render after opening) and when
  // the focus changes while it is open.
  const focus = useRef(focusId)
  focus.current = focusId
  const attach = useCallback((area: HTMLDivElement | null) => {
    scroller.current = area
    scrollToItem(area, focus.current)
  }, [])
  useEffect(() => {
    if (open) scrollToItem(scroller.current, focusId)
  }, [open, focusId])

  const model = details.find((d) => d.key === 'model')?.value
  const facts = details.filter((d) => d.key !== 'model')
  const status =
    outcome?.kind === 'error'
      ? `Failed: ${outcome.message}`
      : outcome?.kind === 'stopped'
        ? 'Stopped before it finished'
        : undefined

  const copy = () => {
    const done = () => {
      if (!isOpen.current) return
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => onOpenChange(false), COPIED_CLOSE_MS)
    }
    // A click handler only runs in a browser, so `navigator` exists.
    const clip = navigator.clipboard
    if (clip?.writeText) clip.writeText(copyText).then(done, done)
    else done()
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="truncate">{model ?? 'Message'}</DrawerTitle>
          <DrawerDescription
            className={cn(!status && 'sr-only', outcome?.kind === 'error' && 'text-destructive')}
          >
            {status ?? 'Details and actions for this message'}
          </DrawerDescription>
        </DrawerHeader>
        <div ref={attach} className="min-h-0 flex-1 overflow-y-auto">
          {facts.length > 0 ? (
            <dl className="mx-4 mb-2 rounded-lg bg-muted/60 px-4 text-sm">
              {facts.map((d) => (
                <div
                  key={d.key}
                  data-detail={d.key}
                  className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2.5 last:border-0"
                >
                  <dt className="text-muted-foreground">{d.label}</dt>
                  <dd className="m-0 min-w-0 text-right tabular-nums [overflow-wrap:anywhere]">
                    {d.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
          {activity ? (
            <section className="chat-details-activity-section mx-4 mb-2" aria-label="Activity">
              <h3 className="mt-2 mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Activity
              </h3>
              {activity}
            </section>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col border-t border-border/60 px-2 pt-1 pb-3 empty:hidden">
          {copyText ? (
            <button type="button" className={ACTION} onClick={copy}>
              {copied ? <CheckIcon size={18} /> : <CopyIcon size={18} />}
              {copied ? 'Copied' : 'Copy text'}
            </button>
          ) : null}
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              data-action={action.id}
              className={ACTION}
              onClick={() => {
                onOpenChange(false)
                action.onSelect()
              }}
            >
              <action.icon size={18} />
              {action.label}
            </button>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
