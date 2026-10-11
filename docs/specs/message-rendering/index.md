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
  - `reasoning` → a collapsible "thinking" block labeled with its duration when known; while
    ACTIVELY streaming it MUST show a live ticking elapsed-timer pill (the "Thinking…" label
    carries no duration), and once finished it MUST show no pill (the "Thought for <dur>"
    label embeds the duration). A block carrying a known `durationMs` is FINISHED regardless
    of the caller's active flag — the gate is owned by the shared `summarizeBlock` helper
    (single source of truth), so a stale `isActive` can never yield "Thinking…" with a frozen
    pill. The live timer MUST anchor at the reasoning block's own `startedAt` when present
    (reasoning that follows earlier tool activity ticks from when the THINKING began), falling
    back to the message-level start when absent.
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

### Role Styling

- The message wrapper MUST always expose the message `role` as a `data-role` attribute, and the
  answer-text and user-text elements MUST each carry the single stable `.chat-text` hook (there are
  NO per-role `.chat-text-user` / `.chat-text-assistant` hooks). A host styles a role by combining
  the stable `.chat-text` hook with the `data-role="user|assistant|system"` ancestor on
  `.chat-message`, and/or via the role-keyed `classNames.textUser` / `classNames.textAssistant`
  entries the renderer appends BY ROLE onto the answer text (user → `textUser`, assistant →
  `textAssistant`, any other role → neither). The package is HEADLESS (change 0013): the
  TRANSCRIPT VISUAL STYLING — role bubbles, colors, alignment, radius, padding, max-width — is
  HOST-SUPPLIED via the `classNames` injection map (see
  [component-registry › classNames Injection](../component-registry/)). The package ships NO
  bubble CSS.
- The `data-role` attribute and the stable `.chat-text` hook MUST be exposed for `user`,
  `assistant`, and `system` so the host can style (or deliberately not style) each role via the
  `data-role` ancestor; the role-keyed `textUser` / `textAssistant` classNames are applied only
  for `user` / `assistant` (a `system` text block gets neither role key). The package MUST NOT
  bake in which roles get a bubble.
- Role styling MUST be host-supplied and additive: the package MUST add no component override and
  MUST NOT ship a default look. A host applies its bubbles entirely through `classNames` onto the
  stable hooks.

#### Scenario: A turn exposes role hooks for host bubble styling

- **GIVEN** a user message followed by an assistant message
- **WHEN** the log renders
- **THEN** the user wrapper carries `data-role="user"`, the assistant wrapper carries
  `data-role="assistant"`, and each answer/user text element carries the stable `.chat-text` hook
  (plus the role-keyed `classNames.textUser` / `classNames.textAssistant` value applied by role)
  so the host can paint the user/assistant bubbles via that hook + the `data-role` ancestor — the
  package itself ships no bubble CSS.

### Collapsible Substrate

- All collapsible blocks (reasoning, tool_call, system, grouped runs) MUST share one
  substrate built on the registry `Collapsible`, providing: a clickable header, an affordance
  icon, the block label, an OPTIONAL live timer pill, an OPTIONAL tokens/sec pill, and the
  body.
- The substrate MUST support controlled (`open`/`onOpenChange`) and uncontrolled
  (`defaultOpen`) use.
- The affordance icon precedence MUST be: active → spinner; just-completed → success check
  (flash); otherwise → NO affordance icon. In the no-affordance case the `CollapsibleRow`
  substrate OMITS the `.chat-row-affordance` span entirely (an idle/bodied row renders no such
  span — there is no empty filler span). The
  disclosure caret MUST NOT be rendered by the substrate — caret rendering is OWNED by the
  registry `Collapsible` slot (see [component-registry › Primitive Contract](../component-registry/)).
  The headless default `Collapsible` renders a caret; a host override renders its own caret or
  none (it MAY legally omit one). Because the substrate never adds a caret of its own, it can
  never produce a second one. An idle bodied row therefore renders no affordance icon while the
  headless Collapsible shows the open/closed caret; a running expandable row MAY show both the
  spinner (affordance) and the Collapsible caret, which is acceptable.
- The substrate MUST auto-hide when it has no active state, no flash, no timer, and no body
  (so empty lifecycle rows do not clutter the log), unless explicitly told to always show.

#### Scenario: Verbose toggle resets manual collapse

- **GIVEN** a user has manually collapsed a block
- **WHEN** the host flips a global "verbose/expand-all" default
- **THEN** the block adopts the new default-open state (manual override is reset).

#### Scenario: Caret ownership belongs to the Collapsible slot

- **GIVEN** an idle bodied collapsible row rendered through any registry (headless or a host
  override)
- **WHEN** it renders
- **THEN** any disclosure caret comes from the `Collapsible` slot — the substrate adds no
  caret of its own. With the headless default `Collapsible` exactly one caret shows; a host
  override that omits its caret legally shows none.

### Streaming & Timing State Machine

- The package MUST derive the live elapsed timer purely from `startedAt`/`isActive` and a
  finalized `durationMs`, ticking on an interval while active, so values survive component
  remounts. The default tick interval MUST be 100ms so live timer pills count up in tenths
  of a second, matching the `X.Xs` display precision. The interval is per-row and MUST be
  armed only while the row is active AND its timer pill actually renders (`CollapsibleRow`
  gates the hook's `isActive` input on `showTimer`) — an active row without a timer pill
  ticks nothing. A finalized `durationMs` MUST take precedence over the live ticker.
- The package MUST provide a flash-on-complete behavior: when a block transitions
  active → inactive, it MUST briefly (a bounded duration) show a success indicator.
- The package MUST provide a live tokens/sec estimate while streaming and MUST prefer a
  provider-reported `tokensPerSecond` (or `usage`/`durationMs`-derived value) once the message
  is complete. `MessageItem` MUST feed this into the render context via
  `useLiveTokensPerSecond`, estimating the in-flight token count from the message's `text` +
  `reasoning` content (`approxTokenCount`: summed character length ÷ 4, rounded; `undefined`
  when 0; a malformed block without a string `text` counts as zero characters, never a throw)
  over elapsed time since the message `createdAt`. While ACTIVE, an explicit positive provider
  `metrics.tokensPerSecond` MUST win over the estimate (a host streaming accurate mid-turn
  rates beats the heuristic; it needs neither a clock anchor nor the min-elapsed window), and
  `usage`/`durationMs` are finalized-only inputs that MUST NOT be consulted while streaming. A
  live estimate MUST NOT be produced — nor cached as the finalized last-live fallback — before
  300ms has elapsed (`MIN_LIVE_ELAPSED_MS`): a handful of tokens over a tiny window
  extrapolates to an absurd rate. Once the message is inactive, the finalized precedence
  (provider rate → `usage.completion` over `durationMs` → cached last-live snapshot) applies,
  so completed rendering is identical to a static metrics derivation; the cached last-live
  fallback is deliberately history-dependent (it covers the brief active → settled transition
  before host metrics arrive). Rates that would round to `0.0` MUST render nothing
  (`formatTokensPerSecond` suppresses them). The message FOOTER metrics MUST keep reading
  `message.metrics` directly — a live estimate never appears in the footer.
- Reasoning duration MUST be formatted human-readably: `X.Xs` (one decimal) below one minute
  — sub-second values render as tenths (`0.0s`–`0.9s`; there is NO `<1s` floor) — and `Xm Ys`
  at one minute and above.
- These behaviors MUST be exposed as reusable hooks (e.g. `useElapsedTimer`,
  `useFlashComplete`, `useLiveTokensPerSecond`) so hosts can reuse them and tests can drive
  them with fake timers.
- **Shared clock.** A host MAY provide one clock with a chosen tick for a subtree. Inside it, every
  timer, live rate, spinner and pulse MUST re-render from that one clock and MUST NOT arm intervals
  of its own; one clock runs one interval, and only while something live subscribes. Without a
  clock, the per-hook defaults above apply unchanged.
- The flash-on-complete behavior MUST be disableable by the host (it costs extra frames on slow
  terminals); it is on by default.
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
- Collapsed-header timer/tok-s pills: a STATUS summary MUST surface the message-level timer
  pill (its label embeds no duration) plus the live tokens/sec while active. An ACTIVE
  REASONING summary MUST likewise surface a LIVE ticking timer pill (the "Thinking…" label
  carries no duration; the block's `durationMs` is undefined while active, so the pill ticks
  live) alongside the context tokens/sec pill; the pill MUST anchor at the reasoning block's
  own `startedAt` when present, else the message `startedAt` — mirroring the bare row. A
  FINISHED reasoning or tool summary MUST show NO timer pill — the reasoning "Thought for
  <dur>" label already embeds the duration, and their bare renderers show none. This timer
  rule is the shared `summarizeBlock` helper's `showTimer` (single source of truth, including
  the durationMs finished-gate), so the bare reasoning row and the group header cannot drift.
- Collapsed-header tokens/sec MUST NOT churn on settled groups: a non-status summary shows the
  context rate only when the group is itself ACTIVE or the whole message has SETTLED
  (`!context.isActive`). A finished group inside a still-streaming message shows no tok/s pill
  (the live estimate would jitter, decay during stalls, and snap at finalize); the finalized
  pill returns once the message settles.
- The grouping policy MUST be the single source of truth; the renderer MUST NOT branch on
  block kind with ad-hoc conditionals.

#### Scenario: Active reasoning shows a live ticking timer

- **GIVEN** an active assistant message whose trailing block is a durationless `reasoning`
  block (bare, or the summary of a collapsed group)
- **WHEN** it renders and the fake/real clock advances
- **THEN** the "Thinking…" header shows a timer pill counting up from the reasoning block's
  own `startedAt` when present, else the message `startedAt` (ticking in tenths), and once the
  block finishes with a `durationMs` the pill disappears in favor of the "Thought for <dur>"
  label.

#### Scenario: Reasoning + tools collapse to one line

- **GIVEN** an assistant turn whose blocks are `[reasoning, tool_call, tool_call, status]`
  followed by the answer `text`
- **WHEN** the log renders in grouped mode
- **THEN** the four metadata blocks collapse under one disclosure with a header summary chip
  and a `+N` badge, and the answer text renders bare beneath it.

### Minimal / Density Mode

- `MessageLog` and `MessageItem` MUST accept an OPTIONAL `minimal` flag (default `false`). When
  absent, output MUST be identical to the default grouped behavior.
- In minimal mode, an assistant turn MUST fold ALL of its `auxEligible` blocks into a SINGLE
  collapsed disclosure — even non-adjacent aux blocks separated by non-aux content — rather than
  only maximal runs. This is a denser "one metadata line per turn" view. A single aux block MUST
  still collapse into a one-item group (unlike the default pass, which renders a lone aux block
  bare).
- The single aux group MUST be emitted at the position of the FIRST auxiliary block
  (chronology-preserving); every non-aux block (the answer, any generative/custom content) MUST
  render bare in its original order.
- Minimal mode MUST force a compact footer and MUST mark the log (`.chat-log`) and each message
  wrapper (`.chat-message`) with `data-minimal="true"` so a host can apply a tighter density
  layout via its `classNames`/CSS targeting that attribute. The package is HEADLESS (change
  0013), so the compacted SPACING itself is host-supplied; the renderer only decides the
  grouping/footer behavior and emits the `data-minimal` hook.
- `flat` MUST take precedence over `minimal` (flat renders every block bare); `raw` MUST take
  precedence over `minimal` (raw renders the JSON view). User messages MUST get the compact
  chrome but MUST NOT aux-collapse (their default non-aux content stays bare/visible).
- Minimal mode MUST respect host timeline-behavior flags via the same overrides as the default
  pass (a host-opted `auxEligible` custom kind folds in; a per-tool-name non-aux override stays
  bare). Top-level `timelineItems` MUST remain interleaved by order and MUST NOT be folded — only a
  turn's own blocks fold.
- The folding pass MUST be a pure, DOM-free function (`collapseTurnAux`) that reuses the shared
  timeline-behavior policy; it MUST NOT reimplement summary/hidden-count selection.

#### Scenario: Minimal folds a turn's aux to one line with the answer bare

- **GIVEN** an assistant turn `[reasoning, tool_call, status, text]` and `minimal` set
- **WHEN** the log renders
- **THEN** the three metadata blocks collapse under ONE disclosure (with a header summary and `+N`
  badge), the answer `text` renders bare beneath it, the footer is compact, and the log/message
  wrappers carry `data-minimal="true"`.

#### Scenario: Minimal folds non-adjacent aux into the same group

- **GIVEN** an assistant turn `[reasoning, text, tool_call]` and `minimal` set
- **WHEN** the log renders
- **THEN** the reasoning and tool_call fold into ONE group (placed at the reasoning's position) and
  the interim `text` renders bare — whereas the default grouped pass would yield two separate runs.

#### Scenario: Minimal default is unchanged when off

- **GIVEN** an assistant turn and `minimal` set to `false` (or absent)
- **WHEN** the log renders
- **THEN** the output is byte-for-byte the default grouped behavior and no `data-minimal` attribute
  is present.

### Timestamp Gutter

- The log MUST support an OPTIONAL per-block TIMESTAMP GUTTER layout, enabled by the host via a
  `timestampGutter?: boolean` prop on `MessageLog` and `MessageItem` (default off). When OFF, rows
  render in a plain column with no gutter and no timestamps.
- When ON, each top-level rendered row (the aux group row, the answer text-block row, the user
  message row) MUST be wrapped in `.chat-gutter-row` carrying a left clock cell
  (`.chat-gutter-time`) + the row content (`.chat-gutter-content`) as two stable DOM hooks. The
  renderer emits the structure and the timestamp; the package is HEADLESS (change 0013), so the
  two-column VISUAL LAYOUT (the fixed clock-cell width, the muted/tabular look, the content cell
  taking the remaining width) is HOST-SUPPLIED via `classNames` onto those hooks. The clock cell
  is always emitted (and `aria-hidden` when blank) so the host can reserve its width even when
  empty.
- The clock MUST be local 24-hour `HH:MM:SS`, zero-padded, built manually (NOT
  `toLocaleTimeString`) for constant width and SSR-safety. A missing/invalid/non-finite timestamp
  MUST yield an empty (but width-reserving, `aria-hidden`) cell.
- The clock MUST be DE-DUPED PER-MESSAGE: consecutive rows WITHIN a message that resolve to the same
  `HH:MM:SS` MUST show the time once (on the first row of the run); later same-second rows MUST render
  a blank cell. A blank/invalid row MUST reset the run so the next identical time prints again. Each
  message's first row MUST show its own clock (there is NO cross-message de-dupe). Each `MessageItem`
  MUST build its OWN per-render `createClockGutterDeduper()` and feed it that message's rows; the
  de-duper MUST NOT be shared across `MessageItem` instances. This is a RENDER-PURITY requirement: a
  shared mutable de-duper threaded across components desyncs under React's multi-invoke render
  (StrictMode double-invoke, concurrent re-render) and blanks every committed gutter cell — so the
  de-duper MUST be created inside each `MessageItem` render and used only for that message's rows.
- The row timestamp MUST prefer a block-level timestamp (`startedAt`, carried by `tool_call`
  and `reasoning`; a group uses its FIRST block's) when finite and positive, else fall back to
  the message `createdAt`.
- Host-supplied top-level TIMELINE ITEMS (`extensions.timelineItems`, see §Render-Layer
  Extensibility) MUST also render in the gutter when `timestampGutter` is on: `MessageLog` MUST
  wrap each `TimelineItemView` in the same `.chat-gutter-row` structure with the clock derived
  from the item's `at` via `formatClockTime`. There is NO cross-entry de-dupe — each item shows
  its OWN clock (mirroring the per-message "each message's first row shows its own clock" rule),
  so the item clock is NOT threaded through a message's `createClockGutterDeduper`. An
  invalid/non-finite `at` MUST yield a blank (`aria-hidden`, width-reserving) cell, same as a
  message row with no time. When `timestampGutter` is OFF (default), the item MUST render bare
  (no gutter row), unchanged. The `.chat-gutter-row` markup is shared via the `GutterRow`
  presentational primitive that both `MessageItem` and `MessageLog` delegate to.

#### Scenario: Gutter de-dupes a same-second run within a message

- **GIVEN** a message whose consecutive rows resolve to the same `HH:MM:SS` and `timestampGutter` is
  set
- **WHEN** the message renders
- **THEN** the first row of the run shows the clock and each later same-second row renders a blank,
  width-reserved, `aria-hidden` gutter cell.

#### Scenario: No cross-message de-dupe (each message prints its own first-row clock)

- **GIVEN** two messages that resolve to the same `HH:MM:SS` and `timestampGutter` is set
- **WHEN** the log renders
- **THEN** EACH message's first row shows its own clock (de-dupe is per-message, not log-wide), and
  re-rendering yields identical committed gutter cells (render purity — each `MessageItem` owns a
  fresh per-render de-duper, so StrictMode/concurrent re-renders cannot desync it).

#### Scenario: Invalid timestamp blanks but reserves width

- **GIVEN** a row whose resolved timestamp is missing or invalid and `timestampGutter` is set
- **WHEN** the row renders
- **THEN** the `.chat-gutter-time` cell is empty (`aria-hidden`) yet still reserves its fixed,
  HOST-DEFINED width (set via `classNames.gutterTime`; the package ships no fixed width — the
  reference theme uses `w-16` = 4rem/64px) so the content column stays aligned, and the blank row
  resets the de-dupe run.

### Affordances

- The package MUST expose, as OPTIONAL callbacks on the message/log, at least: `onRegenerate`,
  `onFork`, `onReset`. When a callback is provided, its affordance MUST render in the message
  footer once the footer renders (see the footer visibility gate below); when absent, the
  affordance MUST NOT render.
- The package MUST provide a copy affordance (copy message text) with a copied-state flash,
  using the registry `CopyButton`. It requires no host callback and renders — once the footer
  renders (see the footer visibility gate below) — only when the message has non-whitespace
  copyable text (whitespace-only counts as empty; a tool-call-only turn has an empty copy
  payload, so no copy control).
- A compact footer mode MUST be supported (icon-only with a reveal toggle).
- Footer metrics (model, duration, tokens/sec) MUST render only when present and MUST degrade
  gracefully when absent.
- The footer MUST NOT render while the message is actively streaming (`isActive` — in
  `MessageLog` terms, `isStreaming && message.id === streamingMessageId`) or when the message
  has ZERO blocks (e.g. a just-created streaming placeholder). The footer affordances are
  completion actions; they render only once the assistant turn has settled and has content.
  The footer also renders NOTHING when it has no renderable affordances or metrics to show —
  no copyable (non-whitespace) text, no action callbacks, and no renderable metrics — so a
  settled turn with nothing actionable gets no empty footer chrome. This gate applies to the
  footer's WRAPPER chrome too: with `timestampGutter` enabled, `MessageItem` MUST NOT emit the
  footer's `.chat-gutter-row` (blank clock cell) when the footer has nothing to render. The
  zero-affordance decision is the exported pure predicate `hasFooterContent`, shared by
  `MessageItem`'s branch gate and `MessageFooter`'s safety-net early return.
- **Host responsibilities:** hosts MUST eventually clear `isStreaming`/`streamingMessageId`
  (terminalize runs, including on error) — a permanently-active message never shows a footer,
  by design. A failed or stopped turn is described by the message `outcome` (see Agent Activity),
  which opens the footer even when the turn has no content.
- An ACTIVE assistant message with zero blocks MUST render a live pending status row (phase
  `'pre-stream'`, live timer); a settled empty message renders nothing. The row is a synthetic
  status block (`'<messageId>:pending'`) rendered through the normal `BlockView` dispatch
  inside the blocks container — "Starting…" label, live timer from the message `createdAt`,
  tokens/sec pill while active — so the host's optimistic placeholder (appended at send time,
  before the first token) is never invisible. It MUST render identically in grouped and `flat`
  modes and, under `timestampGutter`, MUST be gutter-wrapped with the message `createdAt`
  clock printed. `raw` mode is unaffected (the JSON view wins), and the row disappears as soon
  as the first real block arrives (the trailing real block becomes the streaming one).

#### Scenario: Affordance visibility follows callbacks

- **GIVEN** a message rendered with `onRegenerate` but without `onFork`
- **WHEN** the footer renders
- **THEN** a regenerate control is shown and no fork control is shown.

#### Scenario: No footer while streaming or on an empty placeholder

- **GIVEN** a log with a completed assistant message and a second assistant message whose `id`
  equals `streamingMessageId` while `isStreaming` is set (or whose `blocks` array is empty)
- **WHEN** the log renders
- **THEN** exactly one footer renders — inside the COMPLETED message's `data-message-id`
  wrapper — and the streaming/empty message renders no footer.

#### Scenario: Active empty placeholder shows a live pending status row

- **GIVEN** a log with an assistant message whose `blocks` array is EMPTY and whose `id`
  equals `streamingMessageId` while `isStreaming` is set (the host's optimistic placeholder,
  before the first token arrives)
- **WHEN** the log renders
- **THEN** the message renders a live "Starting…" status row (pre-stream phase, live timer)
  inside its blocks container — gutter-wrapped with the `createdAt` clock when
  `timestampGutter` is on — and once `isStreaming` clears (or the message is otherwise
  non-active) the empty message renders nothing again.

### Agent Activity

How every renderer shows an agent's work. The decisions live in the shared render plan in
`@fx/chat-core`, so every renderer shows the same labels, counts, and gates.

- **Tool label and input.** A tool row's label MUST be the call's non-blank `title` (trimmed), else
  its `name`; a bare row and a group header headed by the call MUST agree. The row MAY add a one-line
  input: the call's `inputSummary`, else a summary derived from `arguments` (a string argument as
  is; else the first non-empty string among `command`, `file_path`, `path`, `pattern`, `url`,
  `query`, `prompt`, `description`; else compact JSON of a non-empty object), whitespace collapsed
  and cut with `…` — and none when the label already contains it.
- **Tool output text.** A tool's output text MUST be the result itself when it is a string, empty
  when absent, and two-space-indented JSON otherwise; it is what renderers lay out and what a copy
  of the output copies.
- **Approval qualifier.** A call with `approval.state` of `denied` or `unavailable` MUST show a
  `denied` / `refused` qualifier beside its error marker; `pending` shows `awaiting approval`.
- **Tool liveness.** A `pending`/`running` tool call MUST count as live only while its message is
  live and has no `outcome`; on a settled or stopped message it shows as unfinished, without a
  spinner. (Previously it counted as live regardless of its message.)
- **Plan.** A plan block is auxiliary (it folds into a turn's activity like reasoning and tool
  calls, and alone does not open the footer gate). Its summary is `Plan d/t` (completed / total),
  or `Plan` with no entries, with the `checklist` icon and no timer. Renderers MUST render it as a
  checklist with one row per entry and a per-status marker; completed entries de-emphasized.
- **Outcome.** An assistant message with an `error` outcome MUST show the error inside the message,
  after its content, as an error-toned row; a `stopped` outcome adds no row. A settled message with
  an outcome MUST show its footer even with no content; the footer facts include `stopped` /
  `failed` and a host-labelled retry hint slot.
- **Footer facts.** The footer's content MUST be planned as ordered facts — `elapsed`, `outcome`,
  `reasoning` (characters), `plan` (`d/t`), `tools` (`N tools[, M failed]`), `cost`, `context`
  (`ctx used/size`), `model`, `rate` — that each renderer draws with its own (injected) glyphs and
  separators. Activity facts (`reasoning`, `plan`, `tools`) appear only when the activity itself is
  collapsed; `context` only when it is shown in detail. The existing single-line metrics text stays
  available unchanged.
- **Live footer.** A footer on a live message is OPT-IN for the host (the default footer gate above
  is unchanged). When enabled, it shows from the first thing that arrives, and its elapsed fact
  counts whole seconds from the message's creation, so it changes at most once a second.
- **Durations.** Finished durations everywhere (row timers, footer `elapsed`) use the
  tenths-of-a-second format above. Live elapsed values outside rows (the live footer, a status
  line) use whole seconds (`12s`, `2m 05s`) so they change once a second. Sub-second finished
  footer values read in milliseconds (`640ms`).
- **Formats.** Cost: `$` and the amount with four decimals below 0.01, else two; a non-USD currency
  is suffixed with its code instead. Token and character counts: exact below 1000, then `2.4k`,
  `12k`, and `1.2M` from a million.
- **Activity counts and live phase** MUST be shared helpers: counts of reasoning characters, plan
  progress, and tools (total / failed / denied / running), where denied includes `unavailable` and
  failed includes denied; and the live phase of a message — `waiting` (nothing back), `thinking`
  (trailing reasoning open), `tool` (a live tool call, the latest such; it outranks earlier text), or
  `writing`.
- **Activity placement.** A host MAY ask for activity after content: content blocks (and the
  outcome row) first in their order, then the turn's activity folded as one group in its order.
  Text blocks separated by activity remain separate paragraphs.
- **Live tail.** A host MAY ask that, while a message is live and its activity collapsed, only the
  newest N activity blocks show, preceded by an `N earlier` row; reasoning shows only while nothing
  else has arrived. A finished message never shows a tail.

#### Scenario: Title wins over name

- **GIVEN** a tool call `{ name: 'fs_read', title: 'Read config.yaml' }`
- **WHEN** it heads a bare row or a group
- **THEN** both show `Read config.yaml`.

#### Scenario: Input not repeated

- **GIVEN** `{ title: 'Run npm test', arguments: { command: 'npm test' } }`
- **WHEN** its row is drawn
- **THEN** no separate input is shown.

#### Scenario: Stopped mid-tool

- **GIVEN** an assistant message with a `running` tool call and `outcome: { kind: 'stopped' }`
- **WHEN** it renders as not live
- **THEN** the tool row has no spinner, the footer shows, and its facts include `stopped`.

#### Scenario: Collapsed footer carries the activity

- **GIVEN** a finished answer with 599 reasoning characters, 3 tool calls (1 failed), cost 0.021,
  duration 16 s, activity collapsed
- **WHEN** its footer is planned
- **THEN** the facts are, in order, elapsed `16.0s`, reasoning `599`, tools `3 tools, 1 failed`,
  cost `$0.02`.

#### Scenario: Live footer ticks by the second

- **GIVEN** a live answer created 12.4 s ago with the live footer enabled
- **WHEN** its footer is planned now and 500 ms later
- **THEN** elapsed reads `12s` both times.

#### Scenario: Plan progress label

- **GIVEN** a group whose latest header-eligible block is a plan with 2 of 5 entries completed
- **WHEN** the group header is planned
- **THEN** its label is `Plan 2/5` with the `checklist` icon.

#### Scenario: Tool after text

- **GIVEN** a live message with blocks `[text, tool_call(running)]`
- **WHEN** its live phase is asked
- **THEN** it is `tool` with that call.

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
     `data-message-id` anchor contract). When `timestampGutter` is enabled, `MessageLog` MUST
     ALSO wrap each item in the timestamp-gutter row (see §Timestamp Gutter), rendering the clock
     from the item's `at` via `formatClockTime`.
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
  host overrides those flags for that tool. When a custom block heads a collapsed header, the
  summary label MUST prefer the block's OPTIONAL host-supplied `label` field when it is a
  non-blank string, using its TRIMMED value (a padded `'  Job status  '` renders as
  `'Job status'`), and MUST fall back to the raw `type` string otherwise (empty-string,
  whitespace-only, non-string, or absent `label`).
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

#### Scenario: Timeline item renders the gutter clock from its `at`

- **GIVEN** `extensions.timelineItems = [{ id:'m1', at, render }]` and `timestampGutter` is set
- **WHEN** the log renders
- **THEN** the item is wrapped in a `.chat-gutter-row` whose `.chat-gutter-time` cell shows
  `formatClockTime(at)` (its OWN clock — no cross-entry de-dupe); a non-finite `at` yields a
  blank, `aria-hidden`, width-reserving cell; with `timestampGutter` off the item renders bare
  (no gutter row).

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
  lazy-loaded. The grid MUST be responsive (reflow by available width) and carry stable `.chat-*`
  hooks so its look is host-supplied via `classNames` (the package is headless — change 0013 —
  and ships no attachment theme).
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
  text (the attachment `name` when present), carrying stable `.chat-*` hooks for host styling.

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
     message     → <MessageItem data-message-id=id [data-minimal]>
        grouping pass applies timeline-behavior registry (+ host custom-kind flags):
           default  → groupBlocks: each MAXIMAL run of auxEligible blocks → <BlockGroup>
           minimal  → collapseTurnAux: ALL aux blocks → ONE <BlockGroup> at first-aux index
                      (+ forced compact footer)
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
- An OPTIONAL `minimal` (density) flag on `MessageLog`/`MessageItem` selecting the `collapseTurnAux`
  folding pass + compact footer + `data-minimal` layout hook.
- An `extensions` prop carrying `blockRenderers`, `toolRenderers`, optional per-custom-kind
  grouping flags, and `timelineItems`; an inert fallback renderer for unknown block types.
- An attachment region (`MessageAttachments`) composing an image grid, a registry-backed
  lightbox/overlay slot, and media/file chips.

### Business Logic

- **timeline-behavior registry** — `getTimelineBehavior(kind) → { auxEligible,
  eligibleForHeaderSummary }`; pure and exported.
- **grouping pass** — single linear walk producing bare items and grouped runs; deterministic
  and unit-testable without the DOM.
- **minimal grouping pass** (`collapseTurnAux`) — a separate pure linear walk for density mode:
  folds ALL of a turn's `auxEligible` blocks into ONE group emitted at the first aux block's index,
  with non-aux blocks bare in order. Reuses the shared timeline-behavior policy; deterministic and
  DOM-free.
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
| 2026-06-27 | Added token-driven role styling (user/assistant bubbles via `data-role`, system unbubbled) | [0009-visual-density-parity](../../changes/0009-visual-density-parity.md) |
| 2026-06-27 | Disclosure caret owned solely by the `Collapsible` slot; substrate affordance precedence drops the caret (idle bodied row renders no affordance icon) | [0010-single-caret-disclosure](../../changes/0010-single-caret-disclosure.md) |
| 2026-06-27 | Added minimal / density mode: `minimal` flag folds a turn's aux to one group (`collapseTurnAux`), forces compact footer, `data-minimal` layout hook | [0011-minimal-density-mode](../../changes/0011-minimal-density-mode.md) |
| 2026-06-28 | Added per-block timestamp gutter: `timestampGutter` flag renders each row in a fixed 56px `HH:MM:SS` clock column (`formatClockTime`), de-duped via `createClockGutterDeduper`, block `startedAt` → message `createdAt` fallback; replaces the prior per-message timestamp | [0012-timestamp-gutter](../../changes/0012-timestamp-gutter.md) |
| 2026-06-28 | Render-purity fix for the timestamp gutter: de-dupe is now PER-MESSAGE (each `MessageItem` owns a fresh per-render `createClockGutterDeduper`), not a shared log-wide deduper threaded via `renderGutter`. The shared mutable closure desynced under React's multi-invoke render (StrictMode/concurrent) and blanked every committed gutter cell; per-message first rows now always show their clock | [0012-timestamp-gutter](../../changes/0012-timestamp-gutter.md) |
| 2026-06-29 | Package goes fully headless: transcript visual styling (role bubbles, density spacing, gutter layout, attachment look) is host-supplied via the `classNames` map onto the stable `.chat-*` hooks. The renderer still emits the `data-role` / `data-minimal` / `.chat-gutter-*` hooks; the package ships no transcript theme | [0013-headless-styling](../../changes/0013-headless-styling.md) |
| 2026-07-02 | Footer completion gate: the assistant footer renders only for non-active (`!isActive`) messages with at least one block — suppressed while actively streaming or on an empty placeholder | [0014-footer-streaming-empty-gate](../../changes/0014-footer-streaming-empty-gate.md) |
| 2026-07-02 | Copy affordance gated on non-empty copy text (tool-call-only turns render no Copy control); affordance MUSTs qualified by the footer visibility gate; host responsibilities documented (terminalize runs; zero-block turns render no footer) | [0014-footer-streaming-empty-gate](../../changes/0014-footer-streaming-empty-gate.md) |
| 2026-07-02 | Zero-affordance footers render no chrome at all — including the `timestampGutter` wrapper: `MessageItem` gates its footer branch (and the footer `.chat-gutter-row`) on the exported pure predicate `hasFooterContent`; `MessageFooter` keeps the same predicate as its safety-net early return | [0014-footer-streaming-empty-gate](../../changes/0014-footer-streaming-empty-gate.md) |
| 2026-07-02 | Active empty assistant message renders a live "Starting…" pending status row (synthetic pre-stream status block, live timer from `createdAt`, gutter-wrapped under `timestampGutter`, identical in grouped/`flat` modes); settled-empty stays invisible — restores the host's pre-first-token loading affordance | [0014-footer-streaming-empty-gate](../../changes/0014-footer-streaming-empty-gate.md) |
| 2026-07-02 | Tenth-second timers: `formatDuration` drops the `<1s` floor (sub-second renders as tenths, `0.0s`–`0.9s`); `useElapsedTimer` default tick 1000ms → 100ms so live pills count up in tenths matching display precision | [0015-timer-tenths](../../changes/0015-timer-tenths.md) |
| 2026-07-03 | Live reasoning timer & tokens/sec: an ACTIVE reasoning block shows a live ticking timer pill on both the collapsed group header and the bare row (`summarizeBlock` `showTimer` is the single source of truth; finished reasoning keeps no pill — the label embeds the duration); `MessageItem` feeds a live context tokens/sec via `useLiveTokensPerSecond` + `approxTokenCount` (text+reasoning chars ÷ 4) with a 300ms min-elapsed guard, finalized precedence unchanged (footer still reads `message.metrics` directly); `deriveTokensPerSecond` removed | [0016-live-reasoning-timer-and-tokens](../../changes/0016-live-reasoning-timer-and-tokens.md) |
| 2026-07-03 | Correctness review fixes: reasoning timers anchor at the block-level `startedAt` (new model field, host `reasoningStartedAt`) with message-level fallback; `summarizeBlock` owns the durationMs finished-gate (stale `isActive` never yields "Thinking…"); non-status group headers show tok/s only when the group is active or the message settled (no live churn on finished groups); provider `metrics.tokensPerSecond` wins over the live estimate while active (usage/durationMs finalized-only); rates rounding to `0.0 tok/s` render nothing; live pills require a finite clock anchor | [0016-live-reasoning-timer-and-tokens](../../changes/0016-live-reasoning-timer-and-tokens.md) |
| 2026-07-03 | Custom-block summary label: `CustomBlock` gains an OPTIONAL documented `label?: unknown` field (declared `unknown` so hosts already carrying a non-string `label` payload keep compiling); when a custom block heads a collapsed header, `summarizeBlock` prefers a host-supplied non-blank string `label` over the raw `type` (empty/whitespace-only/non-string/absent fall back to `type` unchanged) | [0017-custom-block-summary-label](../../changes/0017-custom-block-summary-label.md) |
| 2026-07-05 | Timeline-item gutter timestamps: under `timestampGutter`, `MessageLog` wraps host `timelineItems` (`TimelineItemView`) in the same `.chat-gutter-row` as message rows, deriving the clock from the item's `at` via `formatClockTime` (no cross-entry de-dupe; non-finite `at` → blank `aria-hidden` cell; bare when off). The gutter-row markup is extracted into a shared `GutterRow` primitive that `MessageItem` and `MessageLog` both delegate to | [0018-timeline-item-gutter-timestamps](../../changes/0018-timeline-item-gutter-timestamps.md) |
| 2026-10-10 | Agent activity: tool title/input/approval, tool liveness gated on the message, outcome | [0023-agent-activity-model](../../changes/0023-agent-activity-model.md) |
| 2026-10-10 | Plan rendering | [0024-plan-block](../../changes/0024-plan-block.md) |
| 2026-10-10 | Footer facts, opt-in live footer, formats, counts/phase, placement, live tail | [0025-activity-planning](../../changes/0025-activity-planning.md) |
| 2026-10-10 | Shared clock; flash switch | [0027-shared-clock](../../changes/0027-shared-clock.md) |
