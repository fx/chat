# Chat Core

## Overview

`@fx/chat-core` is the renderer-agnostic foundation shared by every `@fx/chat` renderer (the
React-DOM package and the Ink terminal package) and by the agent runtime. It holds the
message model and codec, the pure transcript logic (grouping, timeline merge, block summaries,
formatting, mentions, URL safety), the completion-provider contract, and the React hooks that need
React but not a DOM. It MUST NOT render anything and MUST NOT touch a DOM, a terminal, or the network.

## Background

Until change 0019 all of this lived inside `@fx/chat`, intermixed with the React-DOM renderers. A
terminal renderer cannot import that package: React-DOM host elements (`<div>`, `<span>`) throw under
Ink, and the registry contract is DOM-shaped (`className`, `aria-*`, tooltips). Extracting the pure
layer lets each renderer be a thin projection of one shared behavior, so grouping, labels, timers and
metrics cannot drift between the browser and the terminal.

This spec owns the **package boundary and public surface** of the core. The behavior of the code that
lives here is still owned by the feature specs, which are not restated:

- [message-model](../message-model/) — types, codec, normalization.
- [message-rendering](../message-rendering/) — grouping policy, timeline merge, block summaries,
  duration/clock/rate formatting, live timer and tokens/sec hooks.
- [input-composer](../input-composer/) — completion-provider contract, reference provider, mentions.
- [architecture](../architecture/) — repository layout, build, testing conventions.

## Requirements

### Package Identity

- The package MUST be named `@fx/chat-core`, live at `packages/core/`, ship ESM + `.d.ts`, and be
  published alongside `@fx/chat` with the same version.
- The root entry (`.`) MUST have zero runtime dependencies and MUST NOT import `react`, `react-dom`,
  `ink`, or any DOM, Node-only, or network API — not even type-only.
- A `./react` subpath MUST expose the DOM-free React hooks. `react` MUST be an OPTIONAL peer
  dependency (needed only by consumers of `./react`); `react-dom` MUST NOT be a dependency or peer.
- Modules reachable from `./react` MUST NOT reference `document`, `window`, or any DOM type at
  runtime; environment probes (such as reduced-motion) MUST degrade to a documented default when the
  environment lacks them, so the hooks run unchanged under Ink and in tests.

#### Scenario: Root entry is React-free

- **GIVEN** the built `@fx/chat-core` root entry
- **WHEN** its module graph (including type imports) is resolved
- **THEN** no `react`, `react-dom`, or `ink` specifier appears in it.

#### Scenario: Hooks run outside a browser

- **GIVEN** a test environment with no `window`, `document`, or `matchMedia`
- **WHEN** the `./react` hooks are rendered through a non-DOM React renderer
- **THEN** they run and return their documented default values.

### Public Surface

The root entry MUST export the following groups (exact signatures owned by the feature specs listed
in Background):

- **Model:** every type and function of the message model and codec.
- **Transcript logic:** timeline-behavior lookup and the auxiliary grouping pass, minimal-density
  turn collapse, timeline merge, block summary, duration / clock / tokens-per-second formatting,
  clock-gutter de-duper, approximate token count, attachment-URL safety check, mention parsing.
- **Render planning:** the renderer-independent decisions about a message — its planned rows (bare
  blocks, folded auxiliary groups, the pending row of an active empty assistant message), the live
  block, the footer gate, a collapsed group's header (what it is about — tool counts and span,
  thoughts, or a summary block — `+N`, timer and rate gates; `toolGroupLabel`, `toolSpanMs`), the
  status-row label, the timer-pill gate, and the footer metrics line. Every renderer MUST derive these
  from core rather than re-deriving them, so labels, timers, and gates are identical across renderers.
- **Extension data types:** custom block, renderable block/message, timeline-behavior overrides,
  the renderer-independent timeline-item base, and the own-property extension lookup helper.
- **Completion:** the completion-provider contract and the reference provider.

- **Agent-activity helpers:** tool label/input/output-text helpers, footer-fact planning and its
  formatters (elapsed, token count, cost), activity counts, and the live phase (behavior owned by
  [message-rendering § Agent Activity](../message-rendering/index.md#agent-activity)).

The `./react` subpath MUST export the elapsed-timer, live tokens-per-second, flash-on-complete, and
reduced-motion hooks, and the shared clock (a provider and a hook reading it).

A `./hooks` subpath MUST export a factory that takes a React instance and returns the same hooks as
`./react`, plus the shared clock provider, bound to that instance. It MUST NOT import a `react`
value (types only), so a host that must render with an injected React instance, such as a plugin
host, can use the hooks without loading a second copy of React. `./react` MUST be that factory
applied to the `react` package. Each call MUST create a separate clock context.

A `./json` subpath MUST export the loose-JSON helpers, kept out of the root entry so hosts that do
not lay out tool output do not load them:

- **Detection:** true only for an object, or an array whose first member starts like a JSON value
  (so `[glob] 0 matches` is not JSON).
- **Parsing** never throws: an unfinished string, object or array just ends (marked unclosed),
  trailing non-JSON text is returned separately, and a string value that itself parses as an object
  or array is unwrapped in place up to a bounded depth (default 4).
- **Layout** into rows with a depth: two-space indentation per level; only object and array members
  of an array are foldable; a folded member is one row with a preview (string values cut to 24
  characters) and a size label (`3 keys`, `12 items`); members carry stable paths (`$[3]`,
  `$.items[0]`) so open state survives re-renders; an option cuts long strings with `…`; cut-off
  input shows one `…` at the innermost open level.
- **Pretty text:** the whole value, open and uncut — what a copy copies.

#### Scenario: JSON in a string

- **GIVEN** `{"content":[{"type":"text","text":"{\"ok\":true}"}]}`
- **WHEN** it is laid out
- **THEN** `text` shows as a nested object `{ "ok": true }`, not an escaped string.

Renderer-specific types (anything holding a React component or node) MUST NOT appear in the root
entry. Where a core type needs a renderer-owned slot — a completion item's icon, a timeline item's
inline render function — the core type MUST be generic over that slot (defaulting to `unknown`) and
each renderer package MUST specialize it.

#### Scenario: Renderer specializes a core slot

- **GIVEN** a completion item type in core with an icon slot of type `unknown`
- **WHEN** `@fx/chat` re-exports it
- **THEN** `@fx/chat`'s `CompletionItem` has a React-node icon, and the core reference provider
  (whose items carry no icon) is assignable to `@fx/chat`'s provider type without a cast.

### Compatibility with `@fx/chat`

- `@fx/chat` MUST depend on `@fx/chat-core` and MUST continue to export every name it exported before
  the extraction, with compatible types, so no existing host import breaks.
- `@fx/chat` MUST NOT duplicate core logic; it re-exports or specializes core.

#### Scenario: Existing host imports keep working

- **GIVEN** the list of named exports of `@fx/chat` and `@fx/chat/headless` before change 0019
- **WHEN** the same names are imported after the extraction
- **THEN** every name resolves, and the existing `@fx/chat` test suite passes unchanged apart from
  import paths of moved test files.

## Design

### Architecture

```
@fx/chat-core (packages/core)
├── .          model + codec, grouping, minimal grouping, mergeTimeline, blockSummary,
│              format, url, mentions, extension data types, completion contract + reference
├── ./react    useElapsedTimer, useLiveTokensPerSecond, useFlashComplete, usePrefersReducedMotion
├── ./hooks    createCoreHooks factory: the same hooks over an injected React instance
└── ./json     loose-JSON detection, parsing, layout
        ▲                                   ▲                          ▲
@fx/chat (DOM renderers; re-exports core)   @fx/chat-ink (terminal)    @fx/chat-agent (no UI; root entry only)
```

Layering rule: core depends on nothing in this repository. Renderers and the agent depend on core;
nothing in core depends on them.

## Constraints

- Core code MUST stay free of `node:*`, `fs`, `process.env`, and network access so it is safe in
  browser, webview, Node, and edge bundles.
- Tree-shaking MUST hold: importing the codec MUST NOT pull in the completion reference provider.

## Open Questions

- **Row view-model.** Resolved in change 0022: render planning lives in core and `@fx/chat` uses it.

## References

- [architecture](../architecture/)
- [message-model](../message-model/), [message-rendering](../message-rendering/),
  [input-composer](../input-composer/)
- [ink-renderer](../ink-renderer/)

## Changelog

| Date | Change | Document |
|------|--------|----------|
| 2026-10-10 | Initial spec created | [0019-core-extraction](../../changes/0019-core-extraction.md) |
| 2026-10-10 | Render planning (rows, group header, footer gate, labels) moved into core | [0022-ink-renderer](../../changes/0022-ink-renderer.md) |
| 2026-10-10 | Agent-activity helpers | [0023-agent-activity-model](../../changes/0023-agent-activity-model.md) |
| 2026-10-10 | Footer facts, counts, live phase, placement, live tail | [0025-activity-planning](../../changes/0025-activity-planning.md) |
| 2026-10-10 | `./json` loose-JSON subpath | [0026-loose-json](../../changes/0026-loose-json.md) |
| 2026-10-10 | Shared clock in `./react` | [0027-shared-clock](../../changes/0027-shared-clock.md) |
| 2026-10-11 | `finishedActivity` plan option; `earlier` row `tools` and `earlierLabel`; earlier row counts only older non-reasoning activity; `toolHeadline`; group headers by content (`ToolGroupCounts`, `toolGroupLabel`, `toolSpanMs`) | [0034-activity-layout](../../changes/0034-activity-layout.md) |
