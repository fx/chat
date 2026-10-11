# 0024: Plan Block

## Summary

Add the `plan` content block (an agent checklist) to the core union with its summary label and timeline behavior, render it in both renderers, and add the `checklist` icon as an optional registry icon with a headless fallback.

**Spec:** [message-model § Content Blocks](../specs/message-model/index.md#content-blocks), [message-rendering § Agent Activity](../specs/message-rendering/index.md#agent-activity), [component-registry](../specs/component-registry/)
**Status:** draft
**Depends On:** 0023

## Motivation

Plans/todo lists are reported in one shape by agent protocols and coding agents, and both renderers need the same `Plan d/t` label — shipping it as a custom block would push that into every host.

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

The specs own the block shape, label, behavior and the optional-icon rule. This change owns:

- New icons are NOT added to `IconName` (host code typed `Record<IconName, …>` keeps compiling); they get their own `OptionalIconName` union and are optional in `IconRegistry`, while the runtime merge supplies the headless glyph. Verified: the demo and mobile icon maps compiled unchanged; both now map `checklist` to show the pattern.
- Exhaustive switches over `ContentBlock` in this repo gain a `plan` case.

## Design

### Decisions

- `SummaryIconName` gains `checklist`; the DOM registry types it through `OptionalIconName` (`IconRegistry = Record<IconName, …> & Partial<Record<OptionalIconName, …>>`), resolved through the merged registry with the headless default.
- DOM `PlanBlockView`: a `CollapsibleRow` (icon `checklist`, label from the summary) whose body lists entries with `data-status`; classNames `plan`, `planEntry`.
- Ink: a plan row with per-status glyphs (`planDone`, `planActive`, `planPending`).

### Non-Goals

Producing plans from Chat Completions (no plan concept there); hosts map them.

## Tasks

- [x] Core: `PlanBlock`, union, behavior, summary, assert/codec; tests
- [x] Registry: optional `checklist` icon + headless glyph; demo/mobile untouched and compiling
- [x] `@fx/chat`: PlanBlockView + classNames; tests
- [ ] `@fx/chat-ink`: plan rows; parity
- [x] Specs/indexes

## References

- Source proposals reviewed in this session: external `chat-core-changes.md` and
  `chat-ink-changes.md` (agent-activity and fullscreen-terminal needs of another host).
