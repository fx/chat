# 0016: Live Reasoning Timer & Tokens/Sec

## Summary

While a message is actively reasoning, the collapsed group header and the bare reasoning row
show a LIVE ticking elapsed-timer pill, and `MessageItem` feeds a live tokens/sec estimate into
the render context. `summarizeBlock` now sets `showTimer: true` for an ACTIVE reasoning block —
the "Thinking…" label carries no duration, so the pill surfaces the elapsed time, ticking from
`context.startedAt` via `CollapsibleRow`'s `useElapsedTimer` (the block's `durationMs` is
undefined while active, so the live ticker runs). A finished reasoning block keeps
`showTimer: false`: its "Thought for <dur>" label already embeds the duration, so a pill would
duplicate it. The bare `ReasoningBlockView` passes the same `summary.showTimer` through, so the
bare row and the group header cannot drift. All other summary kinds (tool_call, system, status,
text, custom) are unchanged.

On the tokens/sec side, `MessageItem` replaces its static `deriveTokensPerSecond(...)` call
with the previously-unwired `useLiveTokensPerSecond` hook, fed by a new pure
`approxTokenCount(blocks)` helper (summed `text` + `reasoning` character counts ÷ 4, rounded;
`undefined` when 0). While active, the context rate is a live estimate over elapsed time since
`createdAt`; the hook gains a min-elapsed guard (`MIN_LIVE_ELAPSED_MS = 300`) that sits BEFORE
the estimate computation, so a sub-300ms window returns `undefined` and never populates the
cached last-live fallback — a handful of tokens over a tiny window would otherwise extrapolate
to an absurd rate. Once complete, the hook's finalized precedence (provider
`metrics.tokensPerSecond` → `usage.completion` over `durationMs` → cached last-live snapshot)
reproduces the removed static derivation, so finalized rendering is byte-identical to before.
`deriveTokensPerSecond` had no remaining non-test consumers and is removed. `MessageFooter`
keeps reading `message.metrics` directly, so no live value can leak into footer metrics.

**Spec:** [message-rendering](../specs/message-rendering/)
**Status:** complete
**Depends On:** 0004, 0015

## Motivation

A long-running reasoning turn rendered a static "Thinking…" with no sense of progress — the
elapsed-timer machinery (`useElapsedTimer`, the `CollapsibleRow` timer pill) and the live
tokens/sec hook (`useLiveTokensPerSecond`) both existed but were not wired to the reasoning
surfaces: `summarizeBlock` hard-coded `showTimer: false` for reasoning, and `MessageItem`
computed only the finalized metrics rate. The reference chat ticks a live timer while thinking.
Wiring the existing pieces gives active reasoning a counting pill and a live rate without
touching finalized output.

## Tasks

- [x] `useLiveTokensPerSecond.ts`: `MIN_LIVE_ELAPSED_MS = 300` guard before the estimate
      computation — active + sub-300ms elapsed → `undefined`, nothing cached; finalized
      precedence unchanged; doc comment updated
- [x] `useLiveTokensPerSecond.test.tsx`: active + <300ms → `none` even with tokens; crossing
      300ms starts estimating; sub-300ms values never leak into the cached fallback
- [x] `blockSummary.ts`: reasoning `showTimer: context.isActive === true` (finished stays
      `false`); doc-block + inline comments updated to the new rule
- [x] `blockSummary.test.ts`: active reasoning → `showTimer: true` + "Thinking…"; finished with
      `durationMs` → `false` + "Thought for <dur>"; finished without → `false` + "Reasoning";
      tool_call/system stay `false`
- [x] `BlockGroup.tsx`: comment refresh only — `summaryIsStatus || summary.showTimer` now
      activates for active reasoning summaries (live tick from `context.startedAt`)
- [x] `BlockGroup.test.tsx`: active reasoning summary renders "Thinking…" with a TICKING
      `.chat-row-timer` (asserted across 100ms fake-timer advances) + tok/s pill from
      `context.tokensPerSecond`; timer independent of tok/s; finalized/status pins unchanged
- [x] `ReasoningBlock.tsx`: pass `showTimer={summary.showTimer}` from the existing
      `summarizeBlock` call into `CollapsibleRow`; header doc comment updated
- [x] `blocks.test.tsx`: active bare reasoning row shows a ticking timer pill; finished shows
      none with "Thought for <dur>"
- [x] `format.ts`: pure `approxTokenCount(blocks)` (text+reasoning chars ÷ 4, rounded;
      `undefined` when 0); `deriveTokensPerSecond` removed (no non-test consumers)
- [x] `format.test.ts`: `approxTokenCount` unit cases (empty → `undefined`, text+reasoning
      mixed ÷4 math, non-prose blocks ignored, rounds-to-0 → `undefined`);
      `deriveTokensPerSecond` cases removed with the helper
- [x] `MessageItem.tsx`: context `tokensPerSecond` from `useLiveTokensPerSecond({ startedAt:
      createdAt, isActive, tokenCount: approxTokenCount(blocks), metrics })`
- [x] `MessageItem.test.tsx`: live estimate in an active status row after >300ms; none before
      300ms; provider metrics ignored while active; finalized provider/usage values on the
      group header identical to before; no footer tok/s while active
- [x] Spec: message-rendering — streaming/timing tok/s bullet (min-elapsed guard + MessageItem
      wiring), grouping collapsed-header timer/tok-s rule, reasoning renderer bullet, changelog
      rows
- [x] Index: sync `docs/index.yml` and `docs/index.md` with change 0016

## Changelog

- **2026-07-03** — Initial change: live ticking timer pill on active reasoning (group header +
  bare row via `summary.showTimer`); `MessageItem` wires `useLiveTokensPerSecond` +
  `approxTokenCount` into the render context with a 300ms min-elapsed guard;
  `deriveTokensPerSecond` removed; finalized rendering unchanged.

## References

- Spec: [message-rendering](../specs/message-rendering/)
- Related: [0004-message-rendering](./0004-message-rendering.md),
  [0015-timer-tenths](./0015-timer-tenths.md)
