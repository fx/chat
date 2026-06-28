# 0012: Per-Block Timestamp Gutter

## Summary

Replace the simplistic per-message `HH:MM` timestamp (change 0009-era chrome) with a per-block
TIMESTAMP GUTTER layout matching the reference chat. When the host enables `timestampGutter`, every
top-level rendered row (the aux group row, the answer text-block row, the user message row) renders
as a TWO-COLUMN layout: a FIXED 56px left clock cell + the row content on the right. The clock is a
constant-width 24-hour `HH:MM:SS` local time, built manually (not `toLocaleTimeString`). A
PER-MESSAGE de-duper (each `MessageItem` owns its own per-render instance, for render purity) blanks
consecutive same-second rows WITHIN a message (the time shows once per run; later same-second cells
render blank but still reserve their width); each message's first row shows its own clock. The prior
per-message `.chat-message-time` span and its CSS are removed.

**Spec:** [message-rendering](../specs/message-rendering/)
**Status:** complete
**Depends On:** 0004, 0009

## Motivation

The reference chat renders each top-level row in a fixed-width timestamp gutter, not as a single
`HH:MM` label above the bubble. The gutter keeps timestamps in a stable left column so the eye scans
a turn's chronology, while de-duping consecutive same-second rows avoids a wall of identical clocks.
The earlier per-message timestamp (one `HH:MM` above the bubble) did not match this layout and is
superseded.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[architecture › Testing](../specs/architecture/index.md#testing)). CI enforces these as merge gates:

- `formatClockTime` MUST be unit-tested (pure, DOM-free, SSR-safe): zero-padded local `HH:MM:SS`;
  accepts epoch-ms and ISO/date strings; returns `''` for `null` / `undefined` / `''` /
  non-finite / invalid input.
- `createClockGutterDeduper` MUST be unit-tested: prints the first occurrence and blanks consecutive
  same-second rows; resets the run on a blank/invalid input so the next identical time re-prints;
  independent per instance (no shared module state).
- `MessageItem` MUST be tested with `timestampGutter`: each top-level row wraps in `.chat-gutter-row`
  with a `.chat-gutter-time` cell + a `.chat-gutter-content` cell; the first row of a same-second run
  shows the clock and the next blanks (with the blank cell `aria-hidden`); a missing/invalid
  timestamp blanks the cell while reserving width; a block-level `startedAt` is preferred over the
  message `createdAt`; flat-mode blocks are wrapped too; a grouped row uses its FIRST block's
  timestamp; without the prop, no gutter is rendered. De-dupe is PER-MESSAGE: re-rendering the same
  message yields identical committed clock cells (render purity), and two same-second messages each
  print their own first-row clock (no cross-message suppression).
- `MessageLog` MUST be tested: `timestampGutter` threads to every `MessageItem` and wraps rows; it
  does NOT thread a shared deduper, so two same-second messages each print their own first-row clock;
  absent → no gutter.
- The stylesheet contract MUST be parse-tested: the `.chat-gutter-row` / `.chat-gutter-time` /
  `.chat-gutter-content` rules exist with the 56px width, `tabular-nums`, and the muted token color;
  the prior `.chat-message-time` rule is gone.
- No `.only`/`.skip`; coverage at or above the configured threshold.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not in
the rule.

### Public Surface

- `MessageLog` and `MessageItem` MUST accept an OPTIONAL `timestampGutter?: boolean` (default
  `false`). When absent, rows render in a plain column with no gutter and no timestamps.
- `MessageItem` MUST NOT accept a `renderGutter` prop. Each `MessageItem` creates its OWN per-render
  `createClockGutterDeduper()` instance and feeds it that message's rows; de-dupe is per-message (no
  shared cross-component mutable state) for render purity.
- The format module MUST export `formatClockTime(value)` and `createClockGutterDeduper()`. The prior
  `formatMessageTime` (HH:MM) is removed.

### Layout & Behavior

- Each top-level row renders as `.chat-gutter-row` (flex, `align-items: flex-start`) containing a
  `.chat-gutter-time` cell (fixed 56px, right-aligned, muted, `tabular-nums`, `user-select: none`,
  small top pad) + a `.chat-gutter-content` cell (`min-width: 0; flex: 1`).
- The clock is local 24-hour `HH:MM:SS`, zero-padded, built manually for constant width; `''` for
  missing/invalid/non-finite timestamps. The blank cell is `aria-hidden` and still reserves 56px.
- The de-duper is PER-MESSAGE: each `MessageItem` builds its OWN `createClockGutterDeduper()` per
  render and feeds it that message's rows, so consecutive rows sharing the same `HH:MM:SS` WITHIN a
  message show the time once (first row of the run) and later same-second rows blank; each message's
  first row shows its own clock (no cross-message de-dupe). A blank/invalid row resets the run. The
  de-duper is created INSIDE render (never shared across components) so render stays pure — every
  re-invocation (StrictMode/concurrent) yields identical committed output.
- TIMESTAMP SOURCE per row: prefer a block-level timestamp (`startedAt`, currently on `tool_call`)
  when finite and positive; else fall back to the message `createdAt`.

### Styling

- `styles.css` MUST add the `.chat-gutter-row` / `.chat-gutter-time` / `.chat-gutter-content` rules
  (token-driven; the 56px gutter width and 0.25rem top-pad are the only fixed layout constants), and
  REMOVE the prior `.chat-message-time` rule.
- The answer/user `.chat-text` bubble padding is tuned to the reference `px-4 py-2.5`
  (`0.625rem 1rem`), keeping `max-width: var(--chat-bubble-max-width)` and
  `border-radius: var(--chat-radius)`.

#### Scenario: Gutter de-dupes a same-second run

- **GIVEN** a log whose consecutive rows resolve to the same `HH:MM:SS` and `timestampGutter` is set
- **WHEN** the log renders
- **THEN** the first row of the run shows the clock and each later same-second row renders a blank
  (but width-reserved, `aria-hidden`) gutter cell; an invalid/blank row resets the run.

## Design

### Approach

- `render/format.ts` — add `formatClockTime` + `createClockGutterDeduper`; remove `formatMessageTime`.
- `render/MessageItem.tsx` — `timestampGutter` prop; create a fresh per-render
  `createClockGutterDeduper()` inside the component; wrap each top-level row in a `.chat-gutter-row`;
  resolve the row timestamp (block `startedAt` → message `createdAt`); remove the prior
  `.chat-message-time` span.
- `render/MessageLog.tsx` — `timestampGutter` prop; thread it to every `MessageItem` (no shared
  deduper).
- `styles.css` — gutter rules (replacing `.chat-message-time`); reference bubble padding.

### Decisions

- **Decision**: Build the clock manually instead of `toLocaleTimeString`.
  - **Why**: constant-width, locale-stable output that aligns in the fixed gutter and is SSR-safe.
- **Decision**: A per-message deduper created inside each `MessageItem` render, not a shared log-wide
  one threaded as a callback.
  - **Why**: render purity. A shared mutable de-duper threaded across components desyncs under
    React's multi-invoke render (StrictMode double-invoke, concurrent re-render), which blanked EVERY
    committed gutter cell in production. A fresh per-render instance yields identical output on every
    (re-)invocation. The cost — no cross-message de-dupe — is desirable: each message shows its own
    first-row clock.
- **Decision**: Prefer block `startedAt` over message `createdAt`.
  - **Why**: mirrors the reference's `block.ts ?? messageStartedAt` fallback so a tool row reflects
    when its work began.

### Non-Goals

- No change to grouping, summaries, timers, block dispatch, attachments, or minimal mode.
- No new general block-level timestamp field on the model (reuse the existing `tool_call.startedAt`).

## Tasks

- [x] `format.ts`: `formatClockTime` + `createClockGutterDeduper`; remove `formatMessageTime`
- [x] `MessageItem`: `timestampGutter` prop; own per-render deduper; per-row gutter wrapping;
      timestamp fallback; remove prior timestamp span
- [x] `MessageLog`: `timestampGutter` prop threaded to each `MessageItem` (no shared deduper)
- [x] Render-purity fix: drop the shared log-wide deduper / `renderGutter` prop; each `MessageItem`
      owns its own per-render deduper (2026-06-28)
- [x] `styles.css`: gutter rules (replace `.chat-message-time`); reference bubble padding
- [x] Specs: message-rendering (Timestamp Gutter subsection + scenario, changelog row)
- [x] Tests: `formatClockTime` / `createClockGutterDeduper`; MessageItem/MessageLog gutter; styles parse

## Changelog

- **2026-06-28** — Render-purity fix: the timestamp-gutter de-duper was a shared, log-wide mutable
  closure (`MessageLog` created one and threaded it as `renderGutter` to every `MessageItem`). Shared
  mutable state across component renders is render-impure — React's multi-invoke render (StrictMode
  double-invoke, concurrent re-render) desynced the closure so the committed DOM blanked EVERY
  `.chat-gutter-time` cell. Fix: removed the log-wide deduper and the `renderGutter` prop; each
  `MessageItem` now creates its OWN per-render `createClockGutterDeduper()`. De-dupe is now
  PER-MESSAGE (first same-second row shows the clock, later same-second rows within the message
  blank); each message's first row shows its own clock (cross-message de-dupe intentionally dropped).

## Open Questions

- [ ] Whether to surface a per-block timestamp field on more block kinds beyond `tool_call.startedAt`

## References

- Spec: [message-rendering](../specs/message-rendering/)
- Related: [0004-message-rendering](./0004-message-rendering.md),
  [0009-visual-density-parity](./0009-visual-density-parity.md)
