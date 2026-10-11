# 0026: Loose JSON

## Summary

Add `@fx/chat-core/json`: tolerant detection, parsing (unfinished input, trailing text, JSON-in-strings unwrapping) and row layout with folding paths, plus pretty text for copying.

**Spec:** [chat-core § Public Surface](../specs/chat-core/index.md#public-surface)
**Status:** complete
**Depends On:** —

## Motivation

Tool output is often JSON, often JSON inside a string, and often a capped preview cut mid-value. A shared, renderer-independent layout lets the terminal viewport and any host JsonView show it well.

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

The spec owns the behavior. This change owns:

- **Decision (review fix):** a subpath, not the root entry — hosts that do not lay out tool output never load it.
- The subpath is added to `packages/core/package.json` exports and the tsdown entries.

## Design

### Decisions

- Hand-written tolerant parser (no dependency): a recursive descent over the text tracking open containers; on EOF it closes what is open with `closed: false`.
- Paths: `$` root, `.key` for identifier keys else `["key"]`, `[i]` for indices.

### Non-Goals

Syntax highlighting, editing.

## Tasks

- [x] Parser + detection; tests
- [x] Layout + folding + pretty text; tests
- [x] Subpath wiring; specs/indexes

## References

- Source proposals reviewed in this session: external `chat-core-changes.md` and
  `chat-ink-changes.md` (agent-activity and fullscreen-terminal needs of another host).
