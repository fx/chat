# 0019: Core Extraction

## Summary

Extract the renderer-agnostic layer of `@fx/chat` into a new `@fx/chat-core` package (root entry
plus a `./react` hooks subpath) so a terminal renderer and the agent runtime can share it. `@fx/chat`
keeps its full public surface by re-exporting and specializing core.

**Spec:** [chat-core](../specs/chat-core/)
**Status:** complete
**Depends On:** —

## Motivation

The Ink renderer ([ink-renderer](../specs/ink-renderer/)) and the agent runtime
([chat-agent](../specs/chat-agent/)) both need the model, codec, grouping, summaries and timers, but
cannot import `@fx/chat`, which is React-DOM. Moving that layer out first keeps a single source of
truth for behavior across every renderer.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[Architecture § Testing](../specs/architecture/index.md#testing)). CI enforces these as merge gates:

- Vitest + `@testing-library/react`; every exported function and hook keeps its unit tests (moved
  with the code).
- Streaming/timing logic uses fake timers only — no real-clock sleeps.
- No `.only` / `.skip` in committed tests.
- Coverage stays at the configured 100% lines/branches/functions/statements threshold, now measured
  over `packages/core/src/**` as well as `packages/chat/src/**`.
- The agnostic-rendering test and the no-internal-references check keep passing.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not in the
rule.

### Functional requirements

The [chat-core spec](../specs/chat-core/) owns the package identity, the public surface, the
React-free root entry, and the compatibility guarantee; its scenarios are this change's acceptance
criteria. What implementing them requires of this change:

- Files move with `git mv` so history follows them; behavior is not changed in the same commit.
- An automated test MUST fail if any module under `packages/core/src` (excluding `react/`) imports
  `react`, `react-dom`, or `ink`.
- An automated test MUST pin `@fx/chat`'s pre-extraction named-export list so the compatibility
  guarantee is enforced, not just asserted.
- The library build script builds core before chat; demo and CI builds keep working with one command.

#### Scenario: Export list is pinned

- **GIVEN** the recorded list of `@fx/chat` runtime export names taken before the move
- **WHEN** the test suite runs after the move
- **THEN** every recorded name is still exported from `@fx/chat`.

## Design

### Approach

- New workspace `packages/core` mirroring `packages/chat` config (tsdown, composite tsconfig,
  publishConfig, version lockstep).
- Move: `model/`, `mentions.ts`, `render/{format,grouping,minimalGrouping,mergeTimeline,blockSummary,url}.ts`,
  the data half of `render/extensions.ts`, `input/completion/{types,reference}.ts`, `render/hooks/*`.
- `@fx/chat` keeps the renderer half of `extensions.ts` (`CustomBlockRenderer`, `ToolRenderer`,
  the full `TimelineItem` with its inline `render`, `ChatExtensions`) and specializes
  `CompletionItem`/`CompletionProvider` with a React-node icon.
- `mergeTimeline` becomes generic over the timeline-item type so `@fx/chat` keeps returning its own
  `TimelineItem` in merged entries.

### Decisions

- **Hooks go to `@fx/chat-core/react`, not to each renderer.**
  - **Why**: the timers and live tokens/sec are part of the shared behavior; Ink must tick them
    identically. They are DOM-free already (reduced-motion probes `globalThis.matchMedia` and
    defaults to `false`).
  - **Alternatives considered**: a separate `@fx/chat-react` package — one more package to version
    for four hooks.
- **Generic slots default to `unknown` instead of a type-only React import in core.**
  - **Why**: keeps the root entry usable from non-React consumers (the agent runtime, a future
    non-React renderer) with no `@types/react` requirement.
- **`@fx/chat` keeps exporting core names** rather than asking hosts to import from core.
  - **Why**: zero breaking change for existing hosts.

### Non-Goals

- No behavior changes, no new view-model layer (deferred to the Ink change).
- No change to the `@fx/chat/headless` registry or the DOM renderers beyond import paths.

## Tasks

- [x] Scaffold `packages/core` (package.json, tsconfig, tsdown, root + `./react` entries), add to
      root tsconfig references, build script and coverage include
- [x] Move model, mentions, pure render helpers, completion contract + reference, hooks; split
      `extensions.ts`; make `mergeTimeline` and completion types generic
- [x] Re-point `@fx/chat` imports at `@fx/chat-core`; re-export the public names
- [x] Tests: move unit tests with their code; add React-free-root import test and pinned export-list
      test; full suite at 100% coverage
- [x] Spec/index updates: chat-core spec, architecture layout, index rows

## Open Questions

- [x] Publish `@fx/chat-core` publicly from day one, or keep it internal until the Ink renderer
      ships? Current default: publish with `@fx/chat` (same restricted registry).

## References

- Spec: [chat-core](../specs/chat-core/)
- Related changes: [0020-agent-runtime](./0020-agent-runtime.md),
  [0022-ink-renderer](./0022-ink-renderer.md)
