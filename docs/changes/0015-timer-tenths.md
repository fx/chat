# 0015: Tenth-Second Timers

## Summary

Live timers tick and format in tenths of a second. `formatDuration` drops its `<1s` floor —
sub-second durations now fall into the existing one-decimal `X.Xs` path and render as tenths
(`0.0s`, `0.1s`, … `0.9s`; e.g. `80ms → '0.1s'`, `450ms → '0.5s'`). Invalid inputs (negative,
`NaN`, non-finite) still clamp to `0` and now render `0.0s`. Complementing the display change,
`useElapsedTimer`'s default `intervalMs` drops from 1000ms to 100ms so a live timer pill counts
up in tenths (`0.1s`, `0.2s`, … `1.0s`, `1.1s`) — matching the display precision instead of
sitting frozen on `<1s` for a full second and then jumping whole seconds. The interval is
per-row and armed only while a row is active AND its timer pill actually renders —
`CollapsibleRow` gates the hook's `isActive` input on `showTimer`, so an active row without
a timer pill arms no interval. The cost is one 100ms interval per actively-streaming row
that shows a timer. The ≥60s `Xm Ys` minutes path is untouched.

**Spec:** [message-rendering](../specs/message-rendering/)
**Status:** complete
**Depends On:** 0004

## Motivation

The `<1s` floor made every fresh timer pill render a static, non-numeric `<1s` for its first
second, and the 1s default tick meant the pill only updated once a second — coarser than the
one-decimal `X.Xs` precision the formatter already displays. Sub-second tool calls and
reasoning bursts all collapsed into the same `<1s` label. Ticking at 100ms and formatting
sub-second durations as tenths makes the live pill count up smoothly at exactly the precision
it displays, and gives short-lived rows a real duration instead of a floor label.

## Tasks

- [x] `format.ts`: remove the `safe < 1000 → '<1s'` branch from `formatDuration` so sub-second
      durations fall into the `toFixed(1)` path; doc comment updated
- [x] `useElapsedTimer.ts`: default `intervalMs` 1000 → 100; doc comments note the per-row,
      only-armed-while-active interval cost
- [x] `format.test.ts`: sub-second tenths cases (`0 → '0.0s'`, `40 → '0.0s'`, `80 → '0.1s'`,
      `450 → '0.5s'`, `999 → '1.0s'`); invalid-input clamp assertions updated to `'0.0s'`;
      minutes path untouched
- [x] `useElapsedTimer.test.tsx`: pin the 100ms default tick (value updates after a single
      100ms advance); custom-interval test retained
- [x] `CollapsibleRow.test.tsx` / `BlockGroup.test.tsx`: live-timer text assertions `<1s` →
      `0.0s`
- [x] Spec: message-rendering §Streaming & Timing State Machine — 100ms default tick MUST;
      duration formatting MUST reworded without the `<1s` floor; changelog row
- [x] Index: sync `docs/index.yml` and `docs/index.md` with change 0015

## Changelog

- **2026-07-02** — Initial change: `formatDuration` sub-second tenths (no `<1s` floor);
  `useElapsedTimer` default tick 1000ms → 100ms.
- **2026-07-02** — Review fixes: `formatDuration` gates the sub-minute path on the ROUNDED
  value ([59.95s, 60s) renders `1m 0s`, never `60.0s`); `CollapsibleRow` arms the elapsed
  tick only when the timer pill actually renders (`isActive && showTimer`).

## References

- Spec: [message-rendering](../specs/message-rendering/)
- Related: [0004-message-rendering](./0004-message-rendering.md)
