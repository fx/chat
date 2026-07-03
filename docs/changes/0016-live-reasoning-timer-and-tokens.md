# 0016: Live Reasoning Timer & Tokens/Sec

## Summary

While a message is actively reasoning, the collapsed group header and the bare reasoning row
show a LIVE ticking elapsed-timer pill, and `MessageItem` feeds a live tokens/sec estimate into
the render context. `summarizeBlock` now sets `showTimer: true` for an ACTIVE reasoning block —
the "Thinking…" label carries no duration, so the pill surfaces the elapsed time via
`CollapsibleRow`'s `useElapsedTimer` (the block's `durationMs` is undefined while active, so
the live ticker runs). A known `durationMs` means FINISHED regardless of the caller's active
flag — that gate lives in `summarizeBlock` itself (the single source of truth), so a public
caller passing a stale `isActive` with a finalized block gets "Thought for <dur>" and no
frozen pill. A finished reasoning block keeps `showTimer: false`: its label already embeds the
duration, so a pill would duplicate it. The bare `ReasoningBlockView` passes the same
`summary.showTimer` through, so the bare row and the group header cannot drift. All other
summary kinds (tool_call, system, status, text, custom) are unchanged.

The timer ANCHOR is model-deep: `ReasoningBlock` gains an optional epoch-ms `startedAt`
(mirroring `tool_call`), mapped by the codec from a new optional host field
`reasoningStartedAt` and validated by `assertChatMessage`. Both the bare row and the group
summary prefer the block's own `startedAt` over the message-level `context.startedAt`, so a
turn shaped `[tools 40s → reasoning]` ticks from when the THINKING began instead of starting
at ~40s and snapping down at finalize. Absent a block anchor, the message-level fallback is
unchanged. `CollapsibleRow` additionally requires a FINITE anchor for the live half of its
pill condition — an active `showTimer` row with no usable clock renders no pill rather than a
permanently frozen "0.0s".

On the tokens/sec side, `MessageItem` replaces its static `deriveTokensPerSecond(...)` call
with the previously-unwired `useLiveTokensPerSecond` hook, fed by a new pure
`approxTokenCount(blocks)` helper (summed `text` + `reasoning` character counts ÷ 4, rounded;
`undefined` when 0; a malformed block without a string `text` counts as zero characters
instead of throwing). While active, an explicit positive provider `metrics.tokensPerSecond`
wins outright (a host streaming accurate mid-turn rates beats the chars/4 heuristic;
`usage`/`durationMs` are finalized-only inputs, never consulted while streaming); otherwise
the context rate is a live estimate over elapsed time since `createdAt`, behind a min-elapsed
guard (`MIN_LIVE_ELAPSED_MS = 300`) that sits BEFORE the estimate computation, so a sub-300ms
window returns `undefined` and never populates the cached last-live fallback. Once complete,
the hook's finalized precedence (provider `metrics.tokensPerSecond` → `usage.completion` over
`durationMs` → cached last-live snapshot) reproduces the removed static derivation, so
finalized rendering is byte-identical to before. `deriveTokensPerSecond` had no remaining
non-test consumers and is removed. `MessageFooter` keeps reading `message.metrics` directly,
so no live value can leak into footer metrics.

Live-churn containment: a collapsed FINISHED group inside a still-streaming message no longer
shows the jittering live rate — `BlockGroup` passes the context tokens/sec to a non-status
summary only when the group is itself active OR the whole message has settled.
`formatTokensPerSecond` also suppresses tiny positive rates that would round to `0.0 tok/s`
(e.g. one token over a long stall on the live path).

**Published-hook behavior notes (accepted):** the 300ms min-elapsed guard and the
active-provider precedence are deliberate behavior changes to the published
`useLiveTokensPerSecond` hook. The finalized-with-no-metrics fallback to the CACHED last-live
estimate is intended (it covers the brief active → settled transition before host metrics
arrive, matching the pre-adoption UI) and remains history-dependent by design.

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
- [x] Review fix (model): `ReasoningBlock.startedAt` + host `reasoningStartedAt` codec mapping
      + `assertChatMessage` validation; codec tests (mapped, omitted, malformed)
- [x] Review fix (render): bare row + group summary prefer the block-level `startedAt` timer
      anchor over `context.startedAt` (fallback pinned); anchor tests in both surfaces
- [x] Review fix: `BlockGroup` shows tok/s on a non-status summary only when the group is
      active or the message settled (no live churn on finished headers); test
- [x] Review fix: `formatTokensPerSecond` returns `undefined` for rates that would round to
      `0.0`; boundary tests (0.049 → none, 0.05 → `0.1 tok/s`)
- [x] Review fix: `CollapsibleRow` live pill requires a finite `startedAt` (no frozen `0.0s`
      for an anchorless active row); test
- [x] Review fix: `summarizeBlock` owns the durationMs finished-gate (`isActive` +
      `durationMs` → "Thought for <dur>", `showTimer: false`); omitted-context default pinned
- [x] Review fix: `approxTokenCount` guards non-string `text` (malformed block test)
- [x] Review fix: `useLiveTokensPerSecond` prefers a positive provider rate while ACTIVE;
      usage/durationMs stay finalized-only; MessageItem precedence tests flipped + usage-only
      active shape pinned

## Changelog

- **2026-07-03** — Initial change: live ticking timer pill on active reasoning (group header +
  bare row via `summary.showTimer`); `MessageItem` wires `useLiveTokensPerSecond` +
  `approxTokenCount` into the render context with a 300ms min-elapsed guard;
  `deriveTokensPerSecond` removed; finalized rendering unchanged.
- **2026-07-03** — Correctness review fixes: block-level reasoning `startedAt` timer anchor
  (model + codec + both render surfaces); finished-group tok/s gated off while the message
  streams; no `0.0 tok/s`; no frozen anchorless timer pill; `summarizeBlock` owns the
  durationMs finished-gate; `approxTokenCount` tolerates malformed blocks; provider rate wins
  over the live estimate while active (usage/durationMs finalized-only). Accepted: the 300ms
  guard and active-provider precedence are behavior changes to the published hook; the
  cached last-live finalized fallback is intended and history-dependent by design.
- **2026-07-03** — CodeRabbit follow-up: the active branch caches the provider rate as the
  last-live snapshot before returning it, so a provider-rate-only stream that finalizes with
  metrics carrying no rate/usage/duration keeps the last known rate instead of dropping the
  pill at finalize — the documented brief-transition cover now holds for provider-fed streams
  too.
- **2026-07-03** — Final review fixes: the last-live cache also resets on every inactive →
  active transition, so a reused hook instance whose streams all omit `startedAt` no longer
  carries stream A's rate into stream B's finalized fallback; the block-level reasoning timer
  anchor applies only when it is a finite, positive timestamp (shared `positiveTimestamp`
  helper at both render call sites — NaN/Infinity/0/negative fall back to the message-level
  anchor), and the codec silently drops a non-finite/non-positive `reasoningStartedAt` so
  garbage never enters the model.

## References

- Spec: [message-rendering](../specs/message-rendering/)
- Related: [0004-message-rendering](./0004-message-rendering.md),
  [0015-timer-tenths](./0015-timer-tenths.md)
