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

### Render-Layer Extensibility

> Status: **not yet implemented** (proposed in
> [0007-render-extensibility](../../changes/0007-render-extensibility.md)). The core
> `ContentBlock` union and the default rendering behavior MUST remain unchanged for hosts that
> do not use these extension points.

A host application carries surfaces this package intentionally excludes — host-defined block
kinds (e.g. timeline markers), bespoke rendering for specific tools, and custom top-level
timeline items. These MUST be expressible **without** mutating the closed core `ContentBlock`
union and **without** forking the renderers. Extension is registry/prop-driven and additive.

- `MessageLog` and `BlockView` MUST accept an OPTIONAL renderer-extension API, supplied as a
  single OPTIONAL `extensions` prop (a plain object; SSR-safe; identity-stable by the host).
  When `extensions` is absent, behavior MUST be byte-for-byte the default behavior specified
  above.
- The `extensions` object MUST support three independent capabilities, each OPTIONAL:
  1. **Custom block renderers** — a `blockRenderers` map keyed by a custom block `type` string
     (any value outside the core union). When the renderer encounters a block whose `type` is
     not a core variant, it MUST look the `type` up in `blockRenderers` and render the
     host-supplied component, passing at least `{ block, message, isStreaming }`.
  2. **Tool-call renderer overrides** — a `toolRenderers` map keyed by tool `name`. When a
     `tool_call` block's `name` matches a key, the renderer MUST render the host-supplied
     component **instead of** the default tool block, passing at least
     `{ block, message, isStreaming }`. Tool names that are not present in the map MUST render
     with the default tool block.
  3. **Custom timeline items** — an OPTIONAL `timelineItems` array of host-defined items, each
     with a stable `id`, an `at` ordering key (epoch ms, the same axis as message `createdAt`),
     and a `render` function (or a `kind` resolved through `blockRenderers`). `MessageLog` MUST
     interleave these items into the rendered timeline ordered by `at` relative to messages,
     and MUST wrap each with a stable `data-timeline-item-id` attribute (mirroring the
     `data-message-id` anchor contract).
- **Unknown block types MUST NOT crash.** When a block's `type` is neither a core variant nor
  present in `blockRenderers`, the renderer MUST fall back to a safe, inert placeholder (the
  registry `JsonView` of the block in raw/debug mode, an empty render otherwise) and MUST NOT
  throw. This fallback MUST hold even when no `extensions` prop is supplied.
- Custom block renderers and tool overrides MUST receive their visual atoms from the registry
  via `useChatComponents()` like every other renderer; the package MUST NOT require the host to
  import a UI kit to participate.
- **Grouping interaction.** Custom blocks MUST default to **non-aux** (they render bare and
  break auxiliary runs), so an unknown block never silently disappears into a collapsed
  disclosure. A host MAY opt a custom block kind into the timeline-behavior policy by supplying
  per-kind `{ auxEligible, eligibleForHeaderSummary }` flags alongside its renderer; absent
  flags, the kind is treated as non-aux and not header-eligible. Tool-call overrides MUST
  inherit the existing `tool_call` grouping behavior (aux-eligible, header-eligible) unless the
  host overrides those flags for that tool.
- All extension points MUST be SSR-safe and MUST NOT introduce a runtime dependency. The core
  union, the default renderers, and the grouping policy MUST be unchanged for non-extended use.

#### Scenario: Unknown block type renders inert, not a crash

- **GIVEN** a message containing a block whose `type` is `'host_marker'` and no `extensions`
  prop is supplied
- **WHEN** the log renders
- **THEN** the block renders a safe placeholder (or nothing) and no error is thrown; all other
  blocks render normally.

#### Scenario: Host-supplied custom block renderer

- **GIVEN** `extensions.blockRenderers = { host_marker: HostMarker }` and a message containing a
  `host_marker` block
- **WHEN** the log renders
- **THEN** `HostMarker` is invoked with `{ block, message, isStreaming }`, draws its atoms from
  the registry, and renders bare (non-aux) unless the host opted it into the grouping policy.

#### Scenario: Tool-call override by name

- **GIVEN** `extensions.toolRenderers = { render_ui: HostToolUI }` and an assistant turn with a
  `tool_call` block whose `name` is `render_ui`
- **WHEN** the log renders
- **THEN** `HostToolUI` renders in place of the default tool block, while a sibling `tool_call`
  with a different `name` still renders with the default tool block.

#### Scenario: Custom top-level timeline item interleaves by order

- **GIVEN** messages at `createdAt` 100 and 300 and `extensions.timelineItems = [{ id:'m1',
  at:200, render }]`
- **WHEN** the log renders
- **THEN** the custom item renders between the two messages, wrapped with
  `data-timeline-item-id="m1"`, ordered by `at`.

### User Attachments

> Status: **not yet implemented** (proposed in
> [0008-attachment-rendering](../../changes/0008-attachment-rendering.md)). The model already
> defines message-level `attachments`; the render layer does not yet display them.

The [message-model](../message-model/) carries message-level `attachments`
(`{ url, mediaType, kind: 'image'|'video'|'audio'|'file', name? }`) on `user` messages, but the
render layer does not currently render them. The package MUST render a user message's
attachments through the registry, accessibly, responsively, and theme-aware.

- `MessageLog`/`MessageItem` MUST render a `user` message's `attachments` (when present) in a
  dedicated attachment region distinct from the message's text blocks. Messages without
  attachments MUST render exactly as today.
- Attachments of `kind: 'image'` MUST render as a responsive thumbnail **grid**: each thumbnail
  MUST use the attachment `url`, MUST carry accessible alternative text (the attachment `name`
  when present, otherwise a generic localized fallback such as "image attachment"), and MUST be
  lazy-loaded. The grid MUST be responsive (reflow by available width) and theme-aware (driven
  by the package CSS custom properties, no hard-coded colors).
- The image grid MUST provide an **expand/lightbox affordance**: activating a thumbnail (click
  or keyboard) MUST open a larger view of that image via a registry-supplied overlay slot. The
  overlay MUST be keyboard-operable (focusable, dismissable via `Escape` and a close control),
  MUST trap focus while open, MUST restore focus to the originating thumbnail on close, and MUST
  honor `prefers-reduced-motion`.
- Attachments of `kind: 'video'`, `'audio'`, and `'file'` MUST render as **chips** showing the
  attachment `name` (or a derived label from the `url`/`mediaType` when `name` is absent) with a
  kind-appropriate registry icon (`video`, `audio`, `file`), and MUST offer a **download/open**
  affordance.
- All attachment URLs MUST be **scheme-safe**: the renderer MUST only honor `http(s):`, `data:`,
  and `blob:` URLs and MUST refuse to render or link other schemes (e.g. `javascript:`),
  degrading to an inert, non-interactive chip. The renderer MUST NOT execute or interpret
  attachment content.
- Attachment rendering MUST draw every visual atom (thumbnail frame, chip, overlay, icons) from
  the registry via `useChatComponents()`; the package MUST NOT hard-code a UI kit. Any new
  visual primitive required (e.g. an image/lightbox overlay) MUST be added as a registry slot
  (see [component-registry](../component-registry/)).
- Attachment rendering MUST be SSR-safe: DOM/clipboard/overlay portal access MUST live in
  effects/handlers, and the markup MUST render server-side without `window`/`document`.

#### Scenario: Image attachments render as an accessible grid

- **GIVEN** a `user` message with three `kind:'image'` attachments
- **WHEN** the message renders
- **THEN** three lazy-loaded thumbnails render in a responsive grid, each with accessible alt
  text (the attachment `name` when present), driven by the package theme tokens.

#### Scenario: Lightbox open/close is keyboard-operable

- **GIVEN** a rendered image thumbnail
- **WHEN** the user activates it via keyboard and then presses `Escape`
- **THEN** the registry overlay opens with the enlarged image, focus is trapped while open, and
  on `Escape` the overlay closes and focus returns to the originating thumbnail.

#### Scenario: Non-image attachment chips with safe download

- **GIVEN** a `user` message with a `kind:'file'` attachment named `report.pdf` at an `https:`
  URL
- **WHEN** the message renders
- **THEN** a chip shows `report.pdf` with the `file` icon and a download/open affordance pointing
  at the safe URL.

#### Scenario: Unsafe scheme is refused

- **GIVEN** an attachment whose `url` uses a `javascript:` scheme
- **WHEN** the message renders
- **THEN** the attachment renders as an inert, non-interactive chip and the unsafe URL is not
  linked or executed.

## Design

### Architecture

```
<MessageLog messages isStreaming streamingMessageId onRegenerate? onFork? onReset? extensions?>
  merge messages + extensions.timelineItems → ordered timeline (by createdAt / at)
  for each timeline entry:
     message     → <MessageItem data-message-id=id>
        grouped renderer applies timeline-behavior registry (+ host custom-kind flags):
           run of auxEligible blocks → <BlockGroup> (collapsed disclosure)
           non-aux block             → bare renderer
        block dispatch (in precedence order):
           tool_call w/ override name → extensions.toolRenderers[name]
           core type                 → default renderer
           custom/unknown type        → extensions.blockRenderers[type]
           else                       → inert fallback
        user attachments region      → image grid (+ lightbox slot) | media/file chips
     custom item → <div data-timeline-item-id=id> item.render()
  block renderers ← registry primitives/icons/Markdown
  streaming hooks ← message timestamps/metrics (model)
```

### UI Components

- `MessageLog`, `MessageItem`, `BlockGroup`, and per-block renderers (`TextBlock`,
  `ReasoningBlock`, `ToolCallBlock`, `StatusBlock`, `SystemBlock`, `RawJsonBlock`,
  `MessageFooter`).
- A shared `CollapsibleRow` substrate over the registry `Collapsible`.
- An `extensions` prop carrying `blockRenderers`, `toolRenderers`, optional per-custom-kind
  grouping flags, and `timelineItems`; an inert fallback renderer for unknown block types.
- An attachment region (`MessageAttachments`) composing an image grid, a registry-backed
  lightbox/overlay slot, and media/file chips.

### Business Logic

- **timeline-behavior registry** — `getTimelineBehavior(kind) → { auxEligible,
  eligibleForHeaderSummary }`; pure and exported.
- **grouping pass** — single linear walk producing bare items and grouped runs; deterministic
  and unit-testable without the DOM.
- **timing hooks** — pure-input hooks driven by epoch timestamps; tested with fake timers.
- **block dispatch with extensions** — a single dispatch resolves, in order: tool-name override
  (for `tool_call`), core renderer (for core `type`s), host `blockRenderers[type]` (for custom
  `type`s), then the inert fallback. The grouping pass consults host per-kind flags so custom
  kinds participate in (or stay out of) auxiliary runs deterministically.
- **timeline merge** — `MessageLog` merges `messages` and `extensions.timelineItems` into one
  ordered stream by `createdAt`/`at`; pure and unit-testable without the DOM.
- **scheme-safe URL guard** — a small pure helper validates attachment `url` schemes before any
  thumbnail `src`, chip link, or download is rendered; shared by the attachment renderers.

## Constraints

- Renderers MUST be SSR-safe; DOM access (scroll, clipboard, lightbox portal) MUST be in
  effects/handlers.
- No router, store, server, or UI-kit imports anywhere in this layer; custom block/tool
  renderers and attachment views MUST draw their atoms from the registry.
- The `data-message-id` attribute, the `data-timeline-item-id` attribute, the timeline-behavior
  flags, and the `extensions` prop shape are a **public contract**; changing them is a breaking
  change.
- Extension points MUST be additive: with no `extensions` prop and no attachments, output MUST
  be identical to the pre-extension behavior.

## Open Questions

- **Grouped vs flat default** — whether `MessageLog` groups by default or requires opt-in.
  - Current default: expose both; default to grouped, with a prop to render flat.
- **Virtualization** — whether to provide a built-in windowing integration.
  - Current default: none bundled; expose a slot for a host virtualizer.
- **Test-id surface** — whether to ship stable `data-testid`s as public API.
  - Current default: ship a documented, minimal set for the grouped disclosure and footer
    controls.
- **Custom-kind grouping flags location** — whether per-custom-kind `{ auxEligible,
  eligibleForHeaderSummary }` flags ride on each `blockRenderers` entry or live in a separate
  `timelineBehavior` map on `extensions`.
  - Current default: co-locate the flags with the renderer entry; absent flags ⇒ non-aux.
- **Lightbox: registry slot vs headless built-in** — whether the enlarged-image overlay is a
  required registry slot or a headless-default component hosts MAY override.
  - Current default: add an OPTIONAL `Lightbox`/`ImageOverlay` registry slot with a headless
    default, so zero-config rendering still works.

## References

- [message-model](../message-model/)
- [component-registry](../component-registry/)
- [input-composer](../input-composer/)

## Changelog

| Date | Change | Document |
|------|--------|----------|
| 2026-06-25 | Initial spec created | [0004-message-rendering](../../changes/0004-message-rendering.md) |
| 2026-06-26 | Added render-layer extensibility (custom block/tool renderers, custom timeline items, inert unknown-type fallback) — not yet implemented | [0007-render-extensibility](../../changes/0007-render-extensibility.md) |
| 2026-06-26 | Added user-attachment rendering (image grid + lightbox, media/file chips, scheme-safe download) — not yet implemented | [0008-attachment-rendering](../../changes/0008-attachment-rendering.md) |
