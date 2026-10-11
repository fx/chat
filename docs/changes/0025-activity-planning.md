# 0025: Activity Planning

## Summary

Plan footers as structured facts (`planFooter`) with the elapsed/token/cost formatters, an opt-in live footer, activity counts and the live phase, and two planner options: activity after content (reusing the `group` row) and a live tail (`earlier` row).

**Spec:** [message-rendering § Agent Activity](../specs/message-rendering/index.md#agent-activity)
**Status:** draft
**Depends On:** 0023, 0024

## Motivation

Footers, status lines and list rows all need the same counts and facts; computing them per renderer is the drift change 0022 removed.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[Architecture § Testing](../specs/architecture/index.md#testing)). CI enforces these as merge gates:

- Vitest (+ `@testing-library/react` for DOM, `ink-testing-library` for terminal views); every
  exported function, hook and component has tests covering its spec scenarios.
- Timing logic uses fake timers only; no real-clock sleeps; no `.only` / `.skip`.
- 100% lines/branches/functions/statements over `packages/*/src/**`; apps have their own tests.
- The cross-renderer parity test covers every label or fact both renderers show.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not in the
rule.

### Functional requirements

The spec owns the facts, formats, the live-footer opt-in, counts, phase, placement and tail. This change owns:

- `formatFooterMetrics` stays and keeps its output (it becomes a thin wrapper), so existing hosts are unaffected.
- `MessagePlanOptions` gains `activityPlacement` and `liveTail`; `PlannedRow` gains `{ kind: 'earlier'; key; count }` only (after-content reuses `group`).

## Design

### Decisions

- **Decision (review fix):** after-content placement folds activity into one `group` row placed after the content rows — the same row kind minimal mode uses — rather than a new `activity` row.
- **Decision (review fix):** the live footer is a `planFooter` option (`live: true`) and a renderer prop; `MessagePlan.showFooter` keeps change 0014's gate.
- **Decision (review fix):** durations — finished values via `formatDuration` (tenths), live whole seconds via `formatElapsed(ms, { live: true })`; sub-second finished footer values in ms.

### Non-Goals

DOM footer redesign: `@fx/chat`'s footer keeps its metrics line (now with the cost appended); the terminal renderer draws the planned facts.

## Tasks

- [x] `planFooter` + `formatElapsed`/`formatTokenCount`/`formatCost`; `formatFooterMetrics` wrapper; tests
- [x] `countActivity`, `livePhase`; tests
- [x] Planner `activityPlacement` + `liveTail`; tests
- [ ] `@fx/chat`: footer facts (cost) and `activityPlacement`/`liveTail` props; ink adoption; parity
- [x] Specs/indexes

## References

- Source proposals reviewed in this session: external `chat-core-changes.md` and
  `chat-ink-changes.md` (agent-activity and fullscreen-terminal needs of another host).
