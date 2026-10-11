# 0027: Shared Clock

## Summary

Add `ClockProvider` / `useClock` to `@fx/chat-core/react`; timers, live rates, spinners and pulses read it when present; `useFlashComplete` gains `enabled`; the ink registry gains a flash switch.

**Spec:** [message-rendering § Streaming & Timing State Machine](../specs/message-rendering/index.md#streaming--timing-state-machine)
**Status:** draft
**Depends On:** —

## Motivation

Every live row runs its own interval (100 ms timers, an 80 ms spinner). On slow terminals each frame costs tens of milliseconds, so a long turn keeps a core busy.

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

The spec owns the behavior. This change owns: no behavior change without a provider (existing tests unchanged).

## Design

### Decisions

- The provider (`createSharedClock`) keeps one interval, started on the first subscriber and stopped on the last. `useTicks(active, fallbackMs)` subscribes from a `useEffect` while `active` and bumps a `useState` counter on each tick; without a provider it runs its own `fallbackMs` interval (none when non-positive or non-finite). `useClock(active, fallbackMs = 1000)` wraps it and returns `Date.now()`; `useSharedClock()` exposes the clock in scope.

### Non-Goals

Changing default tick rates.

## Tasks

- [x] `ClockProvider`, `useClock`; hooks read it; flash `enabled`; tests
- [ ] Ink spinner/pulse on the clock; registry flash switch; tests
- [x] Specs/indexes

## References

- Source proposals reviewed in this session: external `chat-core-changes.md` and
  `chat-ink-changes.md` (agent-activity and fullscreen-terminal needs of another host).
