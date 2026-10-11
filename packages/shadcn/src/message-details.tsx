/**
 * The `MessageDetails` presenter: a compact footer's details and actions in a
 * bottom sheet — the model as the title, the other facts as a labelled list,
 * then full-width actions (copy first). Touch-first; the registry provides it
 * with `createShadcnComponents({ touch: true })`.
 */
import type { MessageDetailsProps } from '@fx/chat'
import { useEffect, useRef, useState } from 'react'
import { cn } from './cn'
import { lucideIcons } from './icons'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from './ui/drawer'

const CopyIcon = lucideIcons.copy
const CheckIcon = lucideIcons.check

/** How long the copy action shows its check before the sheet closes, in ms. */
export const COPIED_CLOSE_MS = 600

const ACTION =
  'flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-[0.9375rem] font-medium text-foreground outline-none active:bg-muted focus-visible:bg-muted cursor-pointer'

export function MessageDetailsSheet({
  open,
  onOpenChange,
  details,
  outcome,
  copyText,
  actions,
}: MessageDetailsProps) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    if (!open) setCopied(false)
  }, [open])

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
          <DrawerDescription className={cn(!status && 'sr-only', outcome && 'text-destructive')}>
            {status ?? 'Details and actions for this message'}
          </DrawerDescription>
        </DrawerHeader>
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
        <div className="flex flex-col px-2 pb-3">
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
