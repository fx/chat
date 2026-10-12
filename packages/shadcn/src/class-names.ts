/**
 * The shadcn `classNames` theme for `@fx-/chat`.
 *
 * The library is headless — it ships no visual CSS, only the structural
 * mechanics in `@fx-/chat/structure.css`. Every visual detail (colors, spacing,
 * radius, bubbles, density, composer, lightbox) is supplied here, applied onto
 * the stable `.chat-*` hooks. Classes resolve against the shadcn design tokens
 * (`--background`, `--primary`, `--muted`, `--border`, `--radius`, …) defined
 * by `@fx-/chat-shadcn/theme.css`, so the transcript follows its light/dark
 * theme. Hosts may override any key by spreading their own on top.
 *
 * State-variant styling (minimal density, compact footer, role bubbles) is
 * carried with Tailwind data-variants keyed on the data-attributes the package
 * emits — `data-[minimal=true]`/`data-[compact=true]` directly on the element,
 * and the `group/msg` + `group/aff` markers for descendant state.
 */
import type { ChatClassNames } from '@fx-/chat'
import { cn } from './cn'
import { TILE, TILE_ICON } from './tile'

/** Options for {@link createShadcnClassNames}. */
export interface ShadcnClassNamesOptions {
  /**
   * Touch-first sizing: disclosure rows are 40px tall with 14px text, the size
   * of the answer text (the row header is the tap target), instead of 28px with 12px text. Pair it with
   * `createShadcnComponents({ touch: true })`. Default false.
   */
  touch?: boolean
}

/**
 * Build the shadcn `classNames` theme, tuned by `options`.
 *
 * Every disclosure row — static (the pending "Starting…"), collapsible
 * (reasoning, tool) and a group's summary — has the same header height, and a
 * static row reserves the caret's width, so a live row changing kind keeps its
 * label in place. Row bodies indent to the label.
 */
export function createShadcnClassNames({
  touch = false,
}: ShadcnClassNamesOptions = {}): ChatClassNames {
  const rowText = touch ? 'text-sm' : 'text-xs'
  // Timers and rates stay a step below the row text.
  const metricText = touch ? 'text-[0.8125rem]' : 'text-xs'
  return {
    // ── Transcript: root + message containers ────────────────────────────────
    log: 'flex flex-col gap-3 data-[minimal=true]:gap-[0.625rem] text-foreground',
    message: 'group/msg flex flex-col gap-1.5 data-[minimal=true]:gap-[3px] text-foreground',
    messageBlocks: 'flex flex-col gap-1.5 group-data-[minimal=true]/msg:gap-px',

    // ── Per-block timestamp gutter ────────────────────────────────────────────
    gutterRow: 'flex items-start gap-2',
    gutterTime:
      'w-16 shrink-0 text-right text-xs leading-[1.4] text-muted-foreground tabular-nums select-none',
    gutterContent: 'min-w-0 flex-1',

    // ── Auxiliary collapsible rows (tool / reasoning / system / status) ───────
    // A static row's header is its direct child (a collapsible's sits in the
    // trigger, after the 14px caret and a 6px gap): pad it to the same start.
    row: cn(rowText, 'font-medium text-muted-foreground [&>.chat-row-header]:pl-5'),
    rowError: 'border-destructive text-destructive',
    rowHeader: cn(
      'flex min-w-0 items-center gap-1.5 font-medium leading-[1.4] text-muted-foreground',
      rowText,
      touch ? 'min-h-10' : 'min-h-7',
    ),
    // A live row's spinner (or completion check) takes the kind icon's place,
    // so the label does not shift as the row starts and settles.
    rowIcon: 'size-[1em] shrink-0 [.chat-row-affordance+&]:hidden',
    // Affordance spinner/check box. The spin animation itself comes from
    // structure.css (which the host imports), so only layout + the success tone
    // are set here.
    rowAffordance:
      'inline-flex size-[1em] items-center justify-center text-muted-foreground data-[affordance=success]:text-green-600',
    rowLabel: 'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap',
    rowTimer: cn('shrink-0 text-muted-foreground tabular-nums', metricText),
    rowTps: cn('shrink-0 text-muted-foreground tabular-nums', metricText),

    // ── Grouped-run disclosure (minimal mode) ─────────────────────────────────
    group: '!p-0 !m-0',
    groupBody: 'ml-[6px] flex flex-col gap-0 border-l-2 border-border/60 pl-3',
    groupSummary: 'inline-flex min-w-0 items-center gap-1.5',
    groupSummaryLabel: 'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap',
    groupMore: 'shrink-0 text-xs text-muted-foreground tabular-nums',

    // ── Role bubbles (the answer / user TEXT block only) ──────────────────────
    text: 'w-fit max-w-[85%] rounded-md px-[0.9375rem] py-[0.625rem]',
    textUser: 'bg-primary text-primary-foreground',
    textAssistant: 'bg-muted text-foreground',
    textPlain:
      'text-sm leading-5 whitespace-pre-wrap [overflow-wrap:anywhere] [word-break:break-word]',
    mention: 'font-medium text-primary group-data-[role=user]/msg:text-primary-foreground',

    // ── Tool / reasoning / system / raw bodies ────────────────────────────────
    // Row bodies start under the label (caret 14px + gap 6px) and close with a
    // little air before the next row.
    toolBody: 'flex flex-col gap-2 pl-5 pb-2',
    toolSection: 'flex flex-col gap-1',
    toolSectionLabel: 'text-xs text-muted-foreground uppercase tracking-wider',
    toolMedia: 'flex flex-wrap gap-1.5',
    toolMediaImage: 'max-w-full h-auto rounded-md',
    reasoningBody: 'pl-5 pb-2 text-sm text-muted-foreground',
    systemBody: 'pl-5 pb-2 text-sm text-muted-foreground',
    plan: 'm-0 flex list-none flex-col gap-1 pl-5 pb-2 text-sm',
    rawJson: 'text-xs',
    inertBlock: 'text-sm text-muted-foreground',

    // ── Markdown prose ────────────────────────────────────────────────────────
    md: 'text-sm leading-relaxed [&_p]:my-1 [&_pre]:my-2 [&_ul]:my-1 [&_ol]:my-1',
    mdPre: 'overflow-x-auto rounded-md bg-muted p-3 text-xs',
    mdLink: 'text-primary underline underline-offset-2',
    mdCodeInline: 'rounded bg-muted px-1 py-0.5 text-[0.85em]',

    // ── Footer (metrics + action buttons) ─────────────────────────────────────
    // On touch every footer control is a tile, and the footer wraps them.
    footer: cn(
      'mt-1 flex flex-wrap items-center gap-1.5 min-w-0 text-muted-foreground',
      touch ? 'text-xs' : 'data-[compact=true]:gap-[3px] text-[0.625rem]',
    ),
    // On touch the metrics take their own line under the actions.
    footerMetrics: cn('min-w-0 [overflow-wrap:anywhere]', touch && 'basis-full'),
    footerIcon: touch ? TILE_ICON : 'size-2.5',
    ...(touch
      ? {
          footerReveal: TILE,
          footerCopy: TILE,
          footerRegenerate: TILE,
          footerFork: TILE,
          footerReset: TILE,
        }
      : {}),
    // A finished message's activity facts: on touch each is its own tile with
    // the count or time inside (the wrappers step aside so the tiles wrap), a
    // failure in the destructive tone, highlighted while the activity shows.
    footerActivity: touch ? 'contents' : 'inline-flex items-center gap-1.5',
    footerFact: touch ? 'contents' : 'inline-flex',
    footerFactBody: touch
      ? cn(
          TILE,
          '[[data-failed]>&]:text-destructive',
          '[[data-expanded=true]_&]:bg-primary/15 [[data-expanded=true]_&]:text-foreground',
        )
      : 'inline-flex items-center gap-1 tabular-nums [[data-failed]>&]:text-destructive',
    footerFactIcon: touch ? TILE_ICON : 'size-3',
    // Activity shown from the footer: its tiles join the footer's own wrap.
    footerActivityItems: touch ? 'contents [&>.chat-tiles]:contents' : 'inline-flex',
    detailsActivity: 'flex flex-col gap-0.5',
    // The item the details were opened for (from its tile) stands out.
    detailsActivityItem:
      'rounded-lg px-2 -mx-2 transition-colors data-[focused=true]:bg-primary/10 data-[focused=true]:ring-1 data-[focused=true]:ring-primary/25',

    // ── User attachments ──────────────────────────────────────────────────────
    attachments: 'mt-2 flex flex-col gap-2',
    attachmentGrid: 'grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2 list-none p-0 m-0',
    attachmentGridItem: 'm-0 min-w-0',
    attachmentThumb:
      'relative block w-full aspect-square p-0 overflow-hidden rounded-md border border-border bg-muted text-foreground cursor-pointer',
    attachmentThumbImage: 'block w-full h-full object-cover',
    attachmentThumbExpand:
      'absolute top-0.5 right-0.5 inline-flex items-center justify-center p-0.5 rounded bg-background/70 text-foreground',
    attachmentChips: 'flex flex-wrap gap-1.5 list-none p-0 m-0',
    attachmentChip:
      'inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md border border-border text-foreground text-[0.8125rem]',
    attachmentChipIcon: 'inline-flex items-center text-muted-foreground',
    attachmentChipName: 'min-w-0 max-w-[14rem] overflow-hidden text-ellipsis whitespace-nowrap',
    attachmentChipDownload:
      'inline-flex items-center justify-center min-w-11 min-h-11 text-primary',

    // ── Composer (mention overlay alignment comes from structure.css) ─────────
    input: 'flex flex-col gap-1.5',
    inputAttachments: 'flex flex-wrap gap-1.5 list-none p-0 m-0',
    inputAttachment:
      'inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-1 text-[0.8125rem]',
    inputAttachmentName: 'max-w-48 overflow-hidden text-ellipsis whitespace-nowrap',
    // Both overlay + textarea inherit the shared box from structure.css; the
    // textarea adds the visible border + surface, the overlay's mention chip its
    // accent tint.
    inputTextarea:
      'rounded-md !border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-0',
    inputMention: 'rounded-sm bg-primary/20 text-primary',
    inputActions: 'flex items-center justify-end gap-1.5',

    // ── Completion popup (positioning/scroll come from structure.css) ─────────
    completionPopup:
      'min-w-48 max-w-96 rounded-md border border-border bg-background text-foreground shadow-md overflow-hidden',
    completionList: 'list-none m-0 p-1',
    completionOption:
      'flex items-baseline gap-1.5 px-2 py-1 rounded cursor-pointer data-[active=true]:bg-primary/15',
    completionDescription: 'text-muted-foreground text-[0.8125rem]',
    completionLoading: 'flex items-center justify-center p-3 text-muted-foreground',

    // ── Lightbox (fixed-overlay positioning comes from structure.css) ─────────
    lightbox: 'p-3 bg-black/70',
    lightboxDialog: 'rounded-md bg-background',
    lightboxImage: 'rounded-md',
    lightboxClose:
      'inline-flex items-center justify-center min-w-11 min-h-11 p-1.5 rounded-md border border-border bg-background text-foreground cursor-pointer',
  }
}

/** The desktop (pointer-first) theme. */
export const shadcnClassNames: ChatClassNames = createShadcnClassNames()
