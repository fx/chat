# 0023: Agent Activity Model

## Summary

Give the model a place for what agent hosts show: tool title, kind, input summary and approval; a message outcome (stopped / error); cost and context metrics; attachment description and size. Add the shared tool label/input/output helpers, gate tool liveness on the message, render outcome rows in both renderers, and have `@fx/chat-agent` produce the new fields.

**Spec:** [message-model](../specs/message-model/), [message-rendering § Agent Activity](../specs/message-rendering/index.md#agent-activity), [chat-agent](../specs/chat-agent/)
**Status:** complete
**Depends On:** 0022

## Motivation

A host rendering agent turns (another app's fullscreen terminal UI) keeps a parallel message shape because `ChatMessage` cannot hold these. Our own apps keep run errors outside the message (a mobile timeline item, a TUI error line); an outcome on the message puts them where every renderer can draw them.

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

The specs above own the fields, helper behavior, the liveness rule and the outcome display, and their scenarios are this change's acceptance criteria. What implementing them requires of this change:

- `assertChatMessage` and the codec accept/carry the new fields; host shapes (`HostToolCall`, `HostAttachment`, `HostMessage`) gain them.
- The exports snapshot of `@fx/chat` is extended deliberately for the new names.
- Both reference apps switch their error display to the message outcome (mobile drops its error timeline item; the TUI drops its error line) and keep their retry actions.

## Design

### Decisions

- `isBlockActive` takes the message's activity and outcome into account for tool calls; the DOM `BlockGroup` / `ToolCallBlockView` and the ink rows read it, so neither renderer spins on a stopped message.
- `summarizeBlock` prefers a non-blank `title` for tool calls.
- Outcome row: `planMessage` appends `{ kind: 'outcome', outcome }` for an assistant `error` outcome; the footer gate also opens for a settled message with any outcome. DOM renders `.chat-outcome` (classNames `outcome`); ink renders a `danger` row.
- `@fx/chat-agent`: approval state recorded on tool blocks; `finalizeTurn` stamps `outcome`; usage `cost` (when the endpoint reports one) summed; `context.used` = last step prompt + completion.
- **Decision:** no `cancelled` tool status — a stopped message explains unfinished calls.

### Non-Goals

Plan blocks (0024), footer facts (0025), any change to existing footer gating beyond outcomes.

## Tasks

- [x] Model types, codec mapping, `assertChatMessage`; tests
- [x] Helpers `summarizeToolInput`, `toolDisplayInput`, `toolResultText`; title in `summarizeBlock`; tests
- [x] Liveness gating in `isBlockActive`; outcome planned row + footer gate; tests
- [x] `@fx/chat`: tool label/input/approval qualifier, outcome row, classNames hooks; tests
- [x] `@fx/chat-ink`: same in rows and message view; parity test
- [x] `@fx/chat-agent`: approval, outcome, cost/context; tests
- [x] Apps: mobile and TUI use the outcome; tests
- [x] Specs/indexes

## References

- Source proposals reviewed in this session: external `chat-core-changes.md` and
  `chat-ink-changes.md` (agent-activity and fullscreen-terminal needs of another host).
