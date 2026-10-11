# 0028: Ink Line Layout and Viewport

## Summary

Add the line model, cell-width measure, message layout with injectable frames (compact default, optional threaded), block layouts, detail levels, the layout cache, the run-splitting line renderer, the scrolling `TranscriptViewport` with scroll helpers and a layout hook, and `StatusLine`, `PendingRows`, `EmptyState`; extend roles and glyphs and export an ASCII glyph set.

**Spec:** [ink-renderer](../specs/ink-renderer/), [layout](../specs/ink-renderer/layout.md)
**Status:** complete
**Depends On:** 0023, 0024, 0025, 0026, 0027

## Motivation

Fullscreen hosts currently carry thousands of lines of their own pane, layout and markdown code that drift from core's labels and timers.

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

The specs own the behavior. This change owns:

- **Mission over proposal:** the external proposal hard-coded a `variant: 'compact' | 'threaded'` look. Here the frame is an injected layout slot; the threaded frame ships as an optional export built only from injected roles and glyphs, and hosts may supply their own.
- Fact and status glyphs (💭 📋 🔧, pulse, bars) are glyph-set entries, never literals in layout code; hint labels are host props defaulting to empty.
- The inline `Transcript` and `MessageView` stay as they are.

## Design

### Decisions

- Width: `string-width` (already an Ink dependency) as the default measure; a Bun host may pass `Bun.stringWidth`.
- Cache: `WeakMap<message, { signature, lines }>`.
- `<Lines>`: each line a `height=1` clipped `Box` of `Text` runs split ASCII / non-ASCII / repeats.

### Non-Goals

Injected React/Ink instances (deferred here; delivered by [0033-host-instances](./0033-host-instances.md)).

## Tasks

- [x] Line model, measure, truncate/split, prefix/suffix; tests
- [x] Block layouts (reasoning, tool row, output box with core JSON, plan, outcome, footer+hints), detail levels, live tail; tests
- [x] Frames: compact + threaded; accent; layoutMessage/layoutTranscript + cache; tests
- [x] `<Lines>` renderer with run splitting; tests
- [x] `TranscriptViewport`, scroll helpers, `useTranscriptLayout`, viewport keys; tests
- [x] `StatusLine`, `PendingRows`, `EmptyState`; roles/glyphs, ASCII set; tests
- [x] Specs/indexes

## References

- Source proposals reviewed in this session: external `chat-core-changes.md` and
  `chat-ink-changes.md` (agent-activity and fullscreen-terminal needs of another host).
