# Message Rendering

## Overview

This spec defines how `@fx/chat` renders a conversation: the `MessageLog` container, the
per-block renderers, the shared collapsible primitive, the streaming/timing state machine, the
auxiliary-block grouping (collapsing a turn's reasoning/tool/status metadata under one
disclosure), and the user-facing affordances (copy, regenerate, fork, reset). All renderers
consume the [message-model](../message-model/) and draw every visual atom and icon from the
[component-registry](../component-registry/). No renderer may depend on a UI kit, a router, a
data store, or a host server.

## Background

Extracted from a working chat UI. The source used a shared `StatusRow` substrate for every
collapsible (header trigger, live timer, flash-on-complete, affordance-icon precedence,
auto-hide), derived live tokens/sec and elapsed timers purely from message timestamps so they
survive remounts, and used a registry-driven grouping policy (`auxEligible` /
`eligibleForHeaderSummary` per block kind) to fold consecutive metadata blocks — across
multiple internal assistant steps — into a single collapsed line. Application-specific block
kinds present in the source (job/wake timeline markers) and generative-UI blocks are **out of
scope** and MUST NOT appear in this package.

## Requirements

### Message Log

- The package MUST export a `MessageLog` that renders an ordered `ChatMessage[]`.
- `MessageLog` MUST render each message wrapper with a stable `data-message-id` attribute
  equal to the message `id`, establishing the documented anchor contract used for
  scroll-to-message.
- `MessageLog` MUST accept an `isStreaming` signal and a `streamingMessageId` so the active
  message can drive live status/timers.
- `MessageLog` MUST be agnostic to data fetching and virtualization: it renders what it is
  given. It MAY expose a render-prop or slot for a host-provided virtualizer but MUST NOT
  bundle one.

#### Scenario: Scroll anchor contract

- **GIVEN** a rendered log
- **WHEN** a consumer queries `[data-message-id="<id>"]`
- **THEN** exactly one element matches per message and it wraps that message's blocks.

### Block Renderers

- The package MUST render each `ContentBlock` variant with a dedicated renderer:
  - `text` (assistant) → markdown bubble via the registry `Markdown`.
  - `text` (user, on a user message) → plain text with mention highlighting (see
    [input-composer](../input-composer/)), never markdown.
  - `reasoning` → a collapsible "thinking" block labeled with its duration when known.
  - `tool_call` → a collapsible block showing tool name, input (arguments), and, when
    present, output (result) plus any extracted media; error styling driven by
    `status === 'error'`.
  - `status` → a non-collapsible lifecycle row (e.g. "Generating…" → "Generated") with live
    timer and tokens/sec while active.
  - `system` → a collapsible "system prompt" block.
- A `raw`/debug mode MUST be available that renders the entire message as a JSON view via the
  registry `JsonView`.
- Renderers MUST dispatch on `block.type` exhaustively and MUST NOT parse content strings to
  discover structure (the codec already normalized it).

#### Scenario: Tool error styling from status

- **GIVEN** a `tool_call` block with `status: 'error'`
- **WHEN** it renders
- **THEN** it is styled as an error and defaults to expanded, without inspecting `result`.

#### Scenario: Generated media in tool output

- **GIVEN** a `tool_call` block whose normalized `media` is `[{ kind:'image', url }]` (the codec
  populates `ToolCallBlock.media`; the renderer MUST NOT parse `result` for media)
- **WHEN** it renders
- **THEN** the image is shown in the output area (audio likewise via an audio affordance).

### Collapsible Substrate

- All collapsible blocks (reasoning, tool_call, system, grouped runs) MUST share one
  substrate built on the registry `Collapsible`, providing: a clickable header, an affordance
  icon, the block label, an OPTIONAL live timer pill, an OPTIONAL tokens/sec pill, and the
  body.
- The substrate MUST support controlled (`open`/`onOpenChange`) and uncontrolled
  (`defaultOpen`) use.
- The affordance icon precedence MUST be: active → spinner; just-completed → success check
  (flash); has-body → caret (open/closed); otherwise → muted filler.
- The substrate MUST auto-hide when it has no active state, no flash, no timer, and no body
  (so empty lifecycle rows do not clutter the log), unless explicitly told to always show.

#### Scenario: Verbose toggle resets manual collapse

- **GIVEN** a user has manually collapsed a block
- **WHEN** the host flips a global "verbose/expand-all" default
- **THEN** the block adopts the new default-open state (manual override is reset).

### Streaming & Timing State Machine

- The package MUST derive the live elapsed timer purely from `startedAt`/`isActive` and a
  finalized `durationMs`, ticking on an interval while active, so values survive component
  remounts. A finalized `durationMs` MUST take precedence over the live ticker.
- The package MUST provide a flash-on-complete behavior: when a block transitions
  active → inactive, it MUST briefly (a bounded duration) show a success indicator.
- The package MUST provide a live tokens/sec estimate while streaming and MUST prefer a
  provider-reported `tokensPerSecond` (or `usage`/`durationMs`-derived value) once the message
  is complete.
- Reasoning duration MUST be formatted human-readably (`<1s`, `X.Xs`, `Xm Ys`).
- These behaviors MUST be exposed as reusable hooks (e.g. `useElapsedTimer`,
  `useFlashComplete`, `useLiveTokensPerSecond`) so hosts can reuse them and tests can drive
  them with fake timers.
- All animations/transitions MUST honor `prefers-reduced-motion`.

#### Scenario: Timer survives remount

- **GIVEN** an active message with `startedAt` set
- **WHEN** its block unmounts and remounts mid-stream
- **THEN** the displayed elapsed time continues from real elapsed since `startedAt`, not from
  zero.

#### Scenario: Finalized duration wins

- **GIVEN** a completed message with `metrics.durationMs`
- **WHEN** it renders
- **THEN** the block shows the finalized duration, not a live ticker.

### Auxiliary-Block Grouping

- The package MUST provide a grouping policy registry keyed by block kind with two flags:
  `auxEligible` (folds into an adjacent run of metadata blocks) and `eligibleForHeaderSummary`
  (can become the collapsed header's visible chip / counted in a `+N` badge).
- Reasoning, tool_call, and status MUST be `auxEligible`. Reasoning and tool_call MUST be
  `eligibleForHeaderSummary`; status MUST be `auxEligible` but NOT header-eligible.
- The grouping renderer MUST collapse any maximal run of consecutive `auxEligible` items into
  a single disclosure, **across consecutive internal assistant steps**, while non-aux items
  (user text, assistant answer text, system) render bare and break runs.
- A single-item run MUST render bare (no pointless one-item disclosure).
- The collapsed header MUST select its summary chip as: the trailing active-but-header-
  ineligible item (the live status row, to keep the timer visible) if present; otherwise the
  latest header-eligible item; otherwise the trailing item. A `+N` badge MUST count hidden
  items.
- The grouping policy MUST be the single source of truth; the renderer MUST NOT branch on
  block kind with ad-hoc conditionals.

#### Scenario: Reasoning + tools collapse to one line

- **GIVEN** an assistant turn whose blocks are `[reasoning, tool_call, tool_call, status]`
  followed by the answer `text`
- **WHEN** the log renders in grouped mode
- **THEN** the four metadata blocks collapse under one disclosure with a header summary chip
  and a `+N` badge, and the answer text renders bare beneath it.

### Affordances

- The package MUST expose, as OPTIONAL callbacks on the message/log, at least: `onRegenerate`,
  `onFork`, `onReset`. When a callback is provided, its affordance MUST render in the message
  footer; when absent, the affordance MUST NOT render.
- The package MUST provide a copy affordance (copy message text) with a copied-state flash,
  using the registry `CopyButton`, requiring no host callback.
- A compact footer mode MUST be supported (icon-only with a reveal toggle).
- Footer metrics (model, duration, tokens/sec) MUST render only when present and MUST degrade
  gracefully when absent.

#### Scenario: Affordance visibility follows callbacks

- **GIVEN** a message rendered with `onRegenerate` but without `onFork`
- **WHEN** the footer renders
- **THEN** a regenerate control is shown and no fork control is shown.

### Scroll-to-Message Utility

- The package MUST provide a utility to scroll to a message by `id` using the
  `data-message-id` contract, honoring `prefers-reduced-motion`, and SSR-safe (guarded for
  `document`).

## Design

### Architecture

```
<MessageLog messages isStreaming streamingMessageId onRegenerate? onFork? onReset?>
  for each message → <MessageItem data-message-id=id>
     grouped renderer applies timeline-behavior registry:
        run of auxEligible blocks → <BlockGroup> (collapsed disclosure)
        non-aux block             → bare renderer
  block renderers ← registry primitives/icons/Markdown
  streaming hooks ← message timestamps/metrics (model)
```

### UI Components

- `MessageLog`, `MessageItem`, `BlockGroup`, and per-block renderers (`TextBlock`,
  `ReasoningBlock`, `ToolCallBlock`, `StatusBlock`, `SystemBlock`, `RawJsonBlock`,
  `MessageFooter`).
- A shared `CollapsibleRow` substrate over the registry `Collapsible`.

### Business Logic

- **timeline-behavior registry** — `getTimelineBehavior(kind) → { auxEligible,
  eligibleForHeaderSummary }`; pure and exported.
- **grouping pass** — single linear walk producing bare items and grouped runs; deterministic
  and unit-testable without the DOM.
- **timing hooks** — pure-input hooks driven by epoch timestamps; tested with fake timers.

## Constraints

- Renderers MUST be SSR-safe; DOM access (scroll, clipboard) MUST be in effects/handlers.
- No router, store, server, or UI-kit imports anywhere in this layer.
- The `data-message-id` attribute and the timeline-behavior flags are a **public contract**;
  changing them is a breaking change.

## Open Questions

- **Grouped vs flat default** — whether `MessageLog` groups by default or requires opt-in.
  - Current default: expose both; default to grouped, with a prop to render flat.
- **Virtualization** — whether to provide a built-in windowing integration.
  - Current default: none bundled; expose a slot for a host virtualizer.
- **Test-id surface** — whether to ship stable `data-testid`s as public API.
  - Current default: ship a documented, minimal set for the grouped disclosure and footer
    controls.

## References

- [message-model](../message-model/)
- [component-registry](../component-registry/)
- [input-composer](../input-composer/)

## Changelog

| Date | Change | Document |
|------|--------|----------|
| 2026-06-25 | Initial spec created | [0004-message-rendering](../../changes/0004-message-rendering.md) |
