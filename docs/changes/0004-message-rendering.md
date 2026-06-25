# 0004: Message Log, Block Renderers, Streaming & Grouping

## Summary

Implement the rendering layer: `MessageLog`, per-block renderers (text, reasoning, tool_call,
status, system, raw-json), the shared collapsible substrate, the streaming/timing hooks
(`useElapsedTimer`, `useFlashComplete`, `useLiveTokensPerSecond`), the timeline-behavior
grouping registry with the grouped renderer, the message footer affordances (copy + optional
regenerate/fork/reset), and the scroll-to-message utility.

**Spec:** [message-rendering](../specs/message-rendering/)
**Status:** complete
**Depends On:** 0002, 0003

## Motivation

This is the visible chat surface. It consumes the model (0002) and registry (0003) and turns a
`ChatMessage[]` into a polished, streaming, collapsible conversation with the auxiliary-block
grouping that keeps multi-tool turns compact.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[architecture › Testing](../specs/architecture/index.md#testing)). CI enforces these as merge
gates:

- Every renderer and hook MUST have tests covering the spec scenarios.
- Streaming/timing hooks MUST be tested with fake timers (no real sleeps); cover timer-survives-
  remount and finalized-duration-wins.
- The grouping pass MUST be unit-tested as a pure function (bare vs grouped, header-summary
  selection, `+N` count) without the DOM.
- The design-system-agnostic guarantee MUST be tested: render the same fixture through the
  headless registry and one styled stub, asserting structural/semantic output.
- Affordance visibility MUST be tested against presence/absence of callbacks.
- No `.only`/`.skip`; coverage at or above the configured threshold.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not
in the rule.

### Message Log & Anchor

- `MessageLog` MUST render an ordered `ChatMessage[]`, wrap each message with
  `data-message-id`, accept `isStreaming`/`streamingMessageId`, and bundle no virtualizer.

### Block Renderers & Substrate

- Implement renderers for every `ContentBlock` variant per the spec, plus a raw-json mode.
- All collapsibles MUST share one substrate over the registry `Collapsible` with the documented
  affordance-icon precedence and auto-hide rule.

#### Scenario: Tool error styling from status

- **GIVEN** a `tool_call` with `status:'error'`
- **WHEN** rendered
- **THEN** it is error-styled and default-expanded without inspecting `result`.

### Streaming & Timing

- Implement `useElapsedTimer`, `useFlashComplete`, `useLiveTokensPerSecond` as pure-input hooks
  driven by epoch timestamps; finalized `durationMs` wins; tokens/sec prefers provider/usage
  value when complete. Honor `prefers-reduced-motion`.

### Grouping

- Implement the `getTimelineBehavior(kind)` registry and a grouped renderer collapsing maximal
  runs of `auxEligible` blocks across consecutive assistant steps, with header-summary
  selection and a `+N` badge; single-item runs render bare; policy is the single source of
  truth.

#### Scenario: Reasoning + tools collapse to one line

- **GIVEN** blocks `[reasoning, tool_call, tool_call, status]` then answer `text`
- **WHEN** rendered grouped
- **THEN** the four metadata blocks collapse under one disclosure with a summary chip + `+N`,
  and the answer renders bare.

### Affordances & Scroll Utility

- Footer MUST render copy always, and regenerate/fork/reset only when their callbacks are
  provided; compact mode supported; metrics render only when present.
- Provide an SSR-safe `scrollToMessage(id)` honoring reduced motion via the `data-message-id`
  contract.

## Design

### Approach

- Add `packages/chat/src/render/`: `MessageLog.tsx`, `MessageItem.tsx`, `blocks/*`,
  `CollapsibleRow.tsx`, `MessageFooter.tsx`, `grouping.ts` (pure) + `BlockGroup.tsx`,
  `hooks/*`, `scroll.ts`.
- Build the grouping pass as a pure function over a flattened block stream so it is testable
  without React.
- Read all primitives/icons/Markdown from the registry; pass only contract props.

### Decisions

- **Decision**: Default to grouped rendering with a flat opt-in.
  - **Why**: grouped is the compact, intended experience; flat aids debugging.
  - **Alternatives considered**: flat default (rejected — clutters multi-tool turns).
- **Decision**: No bundled virtualization.
  - **Why**: keep the package primitive; hosts vary widely.
  - **Alternatives considered**: bundle a windowing lib (rejected — adds a dep + opinions).

### Non-Goals

- No job/wake/generative-UI blocks (out of scope for the package).
- No data fetching, router, or store integration.

## Tasks

- [x] Implement `MessageLog` + `MessageItem` with `data-message-id` anchor and streaming props
- [x] Implement `CollapsibleRow` substrate (affordance precedence, auto-hide, controlled/uncontrolled)
- [x] Implement block renderers (text, reasoning, tool_call w/ media + error, status, system,
      raw-json) over the registry
- [x] Implement timing hooks (`useElapsedTimer`, `useFlashComplete`, `useLiveTokensPerSecond`)
      with fake-timer tests + reasoning-duration formatter
- [x] Implement `getTimelineBehavior` registry + pure grouping pass + `BlockGroup` renderer with
      header-summary + `+N`
- [x] Implement `MessageFooter` affordances (copy + optional regenerate/fork/reset, compact mode)
- [x] Implement `scrollToMessage` utility and a cross-registry agnosticism render test

## Open Questions

- [ ] Grouped vs flat default confirmation
- [ ] Public `data-testid` surface for grouped disclosure + footer controls

## References

- Spec: [message-rendering](../specs/message-rendering/)
- Related: [0002-message-model](./0002-message-model.md),
  [0003-component-registry](./0003-component-registry.md)
