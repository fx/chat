# 0012: Per-Block Timestamp Gutter

## Summary

Replace the simplistic per-message `HH:MM` timestamp (change 0009-era chrome) with a per-block
TIMESTAMP GUTTER layout matching the reference chat. When the host enables `timestampGutter`, every
top-level rendered row (the aux group row, the answer text-block row, the user message row) renders
as a TWO-COLUMN layout: a FIXED 56px left clock cell + the row content on the right. The clock is a
constant-width 24-hour `HH:MM:SS` local time, built manually (not `toLocaleTimeString`). A log-wide
de-duper blanks consecutive rows that share the same `HH:MM:SS` (the time shows once per run; later
same-second cells render blank but still reserve their width). The prior per-message
`.chat-message-time` span and its CSS are removed.

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
  timestamp; without the prop, no gutter is rendered.
- `MessageLog` MUST be tested: `timestampGutter` threads to every `MessageItem` and wraps rows;
  same-second clocks de-dupe LOG-WIDE across messages via ONE shared deduper; absent → no gutter.
- The stylesheet contract MUST be parse-tested: the `.chat-gutter-row` / `.chat-gutter-time` /
  `.chat-gutter-content` rules exist with the 56px width, `tabular-nums`, and the muted token color;
  the prior `.chat-message-time` rule is gone.
- No `.only`/`.skip`; coverage at or above the configured threshold.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not in
the rule.

### Public Surface

- `MessageLog` and `MessageItem` MUST accept an OPTIONAL `timestampGutter?: boolean` (default
  `false`). When absent, rows render in a plain column with no gutter and no timestamps.
- `MessageItem` MUST accept an OPTIONAL `renderGutter?: (value) => string` — the log-wide clock
  de-duper threaded from `MessageLog`. When absent, `MessageItem` falls back to a per-message
  deduper (no cross-message de-dupe).
- The format module MUST export `formatClockTime(value)` and `createClockGutterDeduper()`. The prior
  `formatMessageTime` (HH:MM) is removed.

### Layout & Behavior

- Each top-level row renders as `.chat-gutter-row` (flex, `align-items: flex-start`) containing a
  `.chat-gutter-time` cell (fixed 56px, right-aligned, muted, `tabular-nums`, `user-select: none`,
  small top pad) + a `.chat-gutter-content` cell (`min-width: 0; flex: 1`).
- The clock is local 24-hour `HH:MM:SS`, zero-padded, built manually for constant width; `''` for
  missing/invalid/non-finite timestamps. The blank cell is `aria-hidden` and still reserves 56px.
- The de-duper is LOG-WIDE: `MessageLog` builds ONE `createClockGutterDeduper()` per render and
  threads it to every `MessageItem` so consecutive rows sharing the same `HH:MM:SS` across the whole
  log show the time once (first row of the run); a blank/invalid row resets the run.
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
- `render/MessageItem.tsx` — `timestampGutter` + `renderGutter` props; wrap each top-level row in a
  `.chat-gutter-row`; resolve the row timestamp (block `startedAt` → message `createdAt`); remove the
  prior `.chat-message-time` span.
- `render/MessageLog.tsx` — `timestampGutter` prop; build ONE log-wide deduper and thread it as
  `renderGutter` to every `MessageItem`.
- `styles.css` — gutter rules (replacing `.chat-message-time`); reference bubble padding.

### Decisions

- **Decision**: Build the clock manually instead of `toLocaleTimeString`.
  - **Why**: constant-width, locale-stable output that aligns in the fixed gutter and is SSR-safe.
- **Decision**: One log-wide deduper threaded as a callback, not module state.
  - **Why**: pure per render; correct top-to-bottom de-dupe in DOM order without shared global state.
- **Decision**: Prefer block `startedAt` over message `createdAt`.
  - **Why**: mirrors the reference's `block.ts ?? messageStartedAt` fallback so a tool row reflects
    when its work began.

### Non-Goals

- No change to grouping, summaries, timers, block dispatch, attachments, or minimal mode.
- No new general block-level timestamp field on the model (reuse the existing `tool_call.startedAt`).

## Tasks

- [x] `format.ts`: `formatClockTime` + `createClockGutterDeduper`; remove `formatMessageTime`
- [x] `MessageItem`: `timestampGutter` + `renderGutter` props; per-row gutter wrapping; timestamp
      fallback; remove prior timestamp span
- [x] `MessageLog`: `timestampGutter` prop + log-wide deduper threaded as `renderGutter`
- [x] `styles.css`: gutter rules (replace `.chat-message-time`); reference bubble padding
- [x] Specs: message-rendering (Timestamp Gutter subsection + scenario, changelog row)
- [x] Tests: `formatClockTime` / `createClockGutterDeduper`; MessageItem/MessageLog gutter; styles parse

## Open Questions

- [ ] Whether to surface a per-block timestamp field on more block kinds beyond `tool_call.startedAt`

## References

- Spec: [message-rendering](../specs/message-rendering/)
- Related: [0004-message-rendering](./0004-message-rendering.md),
  [0009-visual-density-parity](./0009-visual-density-parity.md)
