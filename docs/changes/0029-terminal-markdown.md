# 0029: Terminal Markdown Layout

## Summary

Add the markdown-layout slot to the line viewport and its dependency-free default `terminalMarkdown` (blocks, inline, GFM tables with fitting and fallback, image hook).

**Spec:** [ink-renderer § markdown](../specs/ink-renderer/markdown.md)
**Status:** complete
**Depends On:** 0028

## Motivation

The viewport lays out lines; an element-based markdown cannot be sliced, wrapped with copy marks, or hit-tested.

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

- **Mission over proposal:** no markdown engine dependency (architecture § Dependency Policy); the default is hand-written, like the headless DOM markdown, and replaceable.

## Design

### Decisions

- A line-oriented block scanner (fences, tables, lists, quotes, headings, rules, paragraphs) plus an inline tokenizer with word-boundary emphasis rules.

### Non-Goals

CommonMark completeness (HTML blocks, reference links, setext headings render as text).

## Tasks

- [x] Block scanner + inline tokenizer; tests
- [x] Tables: fit, wrap, fallback; tests
- [x] Images hook + streaming fences; tests; specs/indexes

## References

- Source proposals reviewed in this session: external `chat-core-changes.md` and
  `chat-ink-changes.md` (agent-activity and fullscreen-terminal needs of another host).
