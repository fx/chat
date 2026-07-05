# 0018: Timeline-Item Gutter Timestamps

## Summary

Host-supplied top-level TIMELINE ITEMS (`extensions.timelineItems`, rendered via
`TimelineItemView`) now participate in the two-column TIMESTAMP GUTTER layout. Previously
`MessageLog` wrapped MESSAGE rows in the gutter (via `MessageItem`, which owns the
`.chat-gutter-row` > `.chat-gutter-time` + `.chat-gutter-content` markup) but emitted standalone
timeline items as bare siblings — so with `timestampGutter` on, a standalone timeline item rendered
with NO clock, misaligned from the message rows. Timeline items carry `at` (epoch ms, documented as
the same axis as message `createdAt`), so the clock is derivable: when `timestampGutter` is on,
`MessageLog` wraps the `TimelineItemView` in the same gutter row with the clock from
`formatClockTime(item.at)`. There is NO cross-entry de-dupe — each item shows its OWN clock
(mirroring `MessageItem`'s "each message's first row shows its own clock" rule); a non-finite/invalid
`at` formats to `''`, yielding a blank, `aria-hidden`, width-reserving cell (same as a message row
with no time). When `timestampGutter` is OFF (default), the item renders bare exactly as before — no
behavior change.

The shared gutter-row markup is now extracted into a tiny presentational primitive, `GutterRow`
(`{ clock, children }`), so `MessageItem.wrapRow` and `MessageLog` don't duplicate it:
`MessageItem` still builds its clock via its per-render de-duper, then delegates the markup;
`MessageLog` uses `GutterRow` for timeline items with `formatClockTime(item.at)`. `MessageItem`'s
de-dupe / blank-clock behavior is byte-identical (its existing tests are unchanged). `GutterRow` is
exported from the package like the other substrate primitives (`CollapsibleRow`).

**Spec:** [message-rendering](../specs/message-rendering/)
**Status:** complete
**Depends On:** 0007, 0012

## Motivation

Same fx/ai job-status timeline integration that motivated change 0017: downstream (fx/ai) anchors
job-status events to messages, but an event with no preceding message falls back to a STANDALONE
timeline item. With the timestamp gutter enabled, those standalone items showed up with no timestamp
and misaligned from the message column — a visible gap in the gutter layout. Timeline items already
carry `at` on the same epoch-ms axis as message `createdAt` (established by change 0007), so the
clock is derivable without any new host contract; this simply extends the gutter's clock rendering to
the item entries `MessageLog` already interleaves.

## Tasks

- [x] `GutterRow.tsx`: extract the `.chat-gutter-row` / `.chat-gutter-time` /
      `.chat-gutter-content` markup into a `{ clock, children }` presentational primitive
      (`aria-hidden`-when-blank rule + `data-testid="chat-gutter-time"` preserved)
- [x] `MessageItem.tsx`: `wrapRow` builds its clock via its per-render de-duper (unchanged) then
      delegates the markup to `GutterRow` — output byte-identical
- [x] `MessageLog.tsx`: under `timestampGutter`, wrap the `TimelineItemView` in `GutterRow` with
      `formatClockTime(entry.item.at)`; bare (unchanged) when the gutter is off; no cross-entry
      de-dupe
- [x] `render/index.ts`: export `GutterRow` + `GutterRowProps` (matching `CollapsibleRow`)
- [x] `GutterRow.test.tsx`: clock shown for a non-blank label (not `aria-hidden`); blank label →
      empty, `aria-hidden`, width-reserving cell; content renders in both cases
- [x] `MessageLog.test.tsx`: gutter-on timeline item wrapped in `.chat-gutter-row` with the expected
      `HH:MM:SS`; gutter-off item bare (no gutter row); non-finite `at` → blank `aria-hidden` cell,
      item still renders; interleaved message + item each show their own clock (no cross-entry
      suppression)
- [x] Spec: message-rendering §Timestamp Gutter + §Render-Layer Extensibility — timeline items
      render the gutter clock from `at`; changelog row
- [x] Index: sync `docs/index.yml` and `docs/index.md` with change 0018

## Changelog

- **2026-07-05** — Initial change: standalone host timeline items render the timestamp-gutter clock
  from `at` (via `formatClockTime`) when `timestampGutter` is enabled; extract a shared `GutterRow`
  presentational primitive so `MessageItem` and `MessageLog` share the gutter-row markup.

## References

- Spec: [message-rendering](../specs/message-rendering/)
- Related: [0007-render-extensibility](./0007-render-extensibility.md) — introduced
  `timelineItems` / `TimelineItemView` and the `at` ordering axis
- Related: [0012-timestamp-gutter](./0012-timestamp-gutter.md) — introduced the per-block timestamp
  gutter and `createClockGutterDeduper`
- Related: [0017-custom-block-summary-label](./0017-custom-block-summary-label.md) — same fx/ai
  job-status timeline integration
