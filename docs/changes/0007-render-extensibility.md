# 0007: Render-Layer Extensibility — Custom Block & Tool Renderers

## Summary

Add an additive, registry-driven extension API to the rendering layer so a host application can
inject its own rendering **without** modifying the closed core `ContentBlock` union or forking
the package renderers. The API lets a host: (a) render a custom/unknown block `type` with a
host-supplied renderer; (b) override the renderer for a specific `tool_call` by tool `name`;
and (c) interleave custom top-level timeline items alongside messages. Unknown block types MUST
render inert (never crash). With no extension prop supplied, behavior is unchanged.

**Spec:** [message-rendering](../specs/message-rendering/)
**Status:** draft
**Depends On:** 0003, 0004

## Motivation

The package deliberately excludes application-specific surfaces — host-defined block kinds,
bespoke rendering for particular tools, and custom timeline markers — so the core stays generic.
A host that wants to adopt this package for its generic chat surface still needs to render those
pieces in-place. Today that is impossible without forking the renderers or polluting the core
union. This change defines the minimal seam that keeps the core closed while making the render
layer open for extension: a single OPTIONAL `extensions` prop on `MessageLog`/`BlockView`,
resolved through the existing registry, with deterministic grouping behavior and a safe fallback
for unknown types.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[architecture › Testing](../specs/architecture/index.md#testing)). CI enforces these as merge
gates:

- Every new code path (custom block renderer dispatch, tool-name override, timeline merge, inert
  unknown-type fallback) MUST have unit tests covering its GIVEN/WHEN/THEN scenarios.
- The unknown-type fallback MUST be tested **without** an `extensions` prop, asserting no throw
  and a safe inert render.
- The timeline merge (messages + custom items ordered by `createdAt`/`at`) MUST be unit-tested
  as a pure function without the DOM.
- The grouping interaction MUST be tested: custom blocks default to non-aux (break runs); an
  opted-in custom kind participates per its flags.
- The design-system-agnostic guarantee MUST hold: custom/override renderers draw atoms from the
  registry; a render test MUST exercise the extension path through the headless registry and one
  styled stub.
- Additivity MUST be tested: a fixture rendered with no `extensions` prop produces output
  identical to the pre-extension renderer (snapshot/structural equality).
- No `.only`/`.skip`; coverage at or above the configured threshold.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not
in the rule.

### Extension API Surface

- `MessageLog` and `BlockView` MUST accept a single OPTIONAL `extensions` object. When absent,
  rendering MUST be byte-for-byte the current default behavior.
- `extensions` MUST expose three independent, OPTIONAL capabilities:
  - `blockRenderers`: a map keyed by custom block `type` string (any value outside the core
    union) → a component receiving at least `{ block, message, isStreaming }`.
  - `toolRenderers`: a map keyed by tool `name` → a component receiving at least
    `{ block, message, isStreaming }`, rendered **instead of** the default tool block.
  - `timelineItems`: an array of host items, each `{ id, at, render }` (or `{ id, at, kind }`
    resolved through `blockRenderers`), interleaved into the timeline ordered by `at`.
- Custom block/tool renderers and timeline items MUST draw their visual atoms from the registry
  via `useChatComponents()`; the package MUST NOT require the host to import a UI kit.

### Dispatch & Fallback

- Block dispatch MUST resolve in this order: (1) `tool_call` whose `name` is in `toolRenderers`
  → host tool renderer; (2) core `type` → default renderer; (3) custom `type` in
  `blockRenderers` → host block renderer; (4) otherwise → inert fallback.
- The inert fallback for an unknown `type` MUST NOT throw, with or without `extensions`. It MUST
  render a safe placeholder (registry `JsonView` in raw/debug mode, empty otherwise).
- Tool names absent from `toolRenderers` MUST render with the default tool block.

#### Scenario: Unknown block type renders inert, not a crash

- **GIVEN** a message containing a block of `type:'host_marker'` and no `extensions` prop
- **WHEN** the log renders
- **THEN** the block renders a safe placeholder (or nothing), no error is thrown, and all other
  blocks render normally.

#### Scenario: Tool-call override by name

- **GIVEN** `extensions.toolRenderers = { render_ui: HostToolUI }` and a turn with two
  `tool_call` blocks named `render_ui` and `search`
- **WHEN** the log renders
- **THEN** `HostToolUI` renders for the `render_ui` block and the default tool block renders for
  `search`.

### Timeline Interleaving

- `MessageLog` MUST merge `messages` and `extensions.timelineItems` into one ordered timeline by
  `createdAt`/`at`, and MUST wrap each custom item with a stable `data-timeline-item-id`
  attribute mirroring the `data-message-id` anchor contract.

#### Scenario: Custom item interleaves by order

- **GIVEN** messages at `createdAt` 100 and 300 and `extensions.timelineItems = [{ id:'m1',
  at:200, render }]`
- **WHEN** the log renders
- **THEN** the custom item renders between the two messages, wrapped with
  `data-timeline-item-id="m1"`.

### Grouping Interaction

- Custom blocks MUST default to **non-aux** (render bare, break auxiliary runs) so an unknown
  block never disappears into a collapsed disclosure.
- A host MAY opt a custom kind into grouping by supplying per-kind `{ auxEligible,
  eligibleForHeaderSummary }` flags alongside its renderer; absent flags ⇒ non-aux and not
  header-eligible.
- Tool overrides MUST inherit the existing `tool_call` grouping behavior unless the host
  overrides those flags for that tool.

#### Scenario: Custom block defaults to non-aux

- **GIVEN** a turn `[reasoning, host_marker, tool_call]` where `host_marker` has a renderer but
  no grouping flags
- **WHEN** rendered grouped
- **THEN** `host_marker` renders bare and breaks the auxiliary run (it is not folded into the
  reasoning/tool disclosure).

## Design

### Approach

- Extend `MessageLog`/`MessageItem`/`BlockView` (in the render layer) to thread an OPTIONAL
  `extensions` prop down to a single block-dispatch function.
- Replace the implicit exhaustive `switch` on `block.type` with a dispatch that consults
  `toolRenderers` (by name), then core renderers, then `blockRenderers` (by custom type), then a
  shared inert fallback component.
- Add a pure `mergeTimeline(messages, timelineItems)` helper that yields an ordered stream of
  `{ kind:'message' | 'item', … }` for `MessageLog` to render; custom items get a
  `data-timeline-item-id` wrapper.
- Extend the grouping pass so the timeline-behavior lookup falls back to host-supplied per-kind
  flags for custom types, defaulting to non-aux.

### Decisions

- **Decision**: One `extensions` prop object rather than several top-level props.
  - **Why**: keeps the `MessageLog` signature stable and groups all host injection in one place.
  - **Alternatives considered**: separate `blockRenderers`/`toolRenderers`/`timelineItems` props
    (rejected — wider surface, harder to evolve).
- **Decision**: Custom blocks default to non-aux.
  - **Why**: an unknown block silently folding into a collapsed disclosure is a data-loss-shaped
    surprise; bare-by-default is the safe, visible default.
  - **Alternatives considered**: default aux-eligible (rejected — hides host content).
- **Decision**: Unknown types fall back to an inert placeholder, never throw.
  - **Why**: forward-compatibility — a host (or a newer transcript) can introduce a type the
    current renderer doesn't know without crashing the log.
  - **Alternatives considered**: throw/`assertNever` (rejected — brittle across versions).

### Non-Goals

- No new core `ContentBlock` variants; the core union stays closed.
- No host-specific block kinds shipped in the package (markers, generative-UI, etc. remain the
  host's concern).
- No data fetching, router, or store integration.

## Tasks

- [ ] Add the `extensions` prop type (`blockRenderers`, `toolRenderers`, `timelineItems`, optional
      per-kind grouping flags) and thread it through `MessageLog` → `MessageItem` → `BlockView`
- [ ] Implement the block-dispatch resolver (tool override → core → custom → inert fallback) and
      the shared inert fallback component
- [ ] Implement the pure `mergeTimeline` helper + `data-timeline-item-id` wrapper for custom items
- [ ] Extend the grouping pass to consult host per-kind flags (default non-aux) for custom types
- [ ] Tests: unknown-type fallback (no-throw, with/without `extensions`), tool override by name,
      timeline merge ordering, grouping default + opt-in, additivity snapshot, cross-registry
      agnosticism through the extension path

## Open Questions

- [ ] Custom-kind grouping flags: co-located on each `blockRenderers` entry vs a separate
      `timelineBehavior` map on `extensions`
- [ ] Whether `data-timeline-item-id` should be part of the documented public test-id surface

## References

- Spec: [message-rendering](../specs/message-rendering/)
- Related: [0003-component-registry](./0003-component-registry.md),
  [0004-message-rendering](./0004-message-rendering.md)
