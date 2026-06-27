# 0011: Minimal / Density Mode

## Summary

Add an OPTIONAL `minimal` (density) mode to the reference chat UI. In minimal mode an assistant
turn folds ALL of its auxiliary blocks (reasoning / tool calls / status) into a SINGLE collapsed
disclosure — even non-adjacent ones — leaving the answer and any generative/custom content bare,
forces a compact footer, and applies a tighter token-driven layout via a `data-minimal` hook. The
default grouped behavior is unchanged when the flag is off.

**Spec:** [message-rendering](../specs/message-rendering/), [demos](../specs/demos/)
**Status:** complete
**Depends On:** 0004, 0007

## Motivation

The default grouped view keeps one disclosure per maximal aux run, so a turn with text between two
tool runs shows two disclosures, and a lone aux block renders bare. For a dense, scannable
transcript a host wants exactly one metadata line per turn with the answer prominent beneath it.
Minimal mode provides that as an additive flag — a separate pure folding pass plus spacing tokens —
without touching the default behavior or the renderer structure.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[architecture › Testing](../specs/architecture/index.md#testing)). CI enforces these as merge
gates:

- `collapseTurnAux` MUST be exhaustively unit-tested (pure, DOM-free): all-aux → one group;
  mixed → aux group at the first-aux position + bare non-aux in order; a SINGLE aux block → a
  one-item group; zero aux → all bare; non-adjacent aux folded into ONE group; a custom non-aux
  block bare and ordered after the group; a host-opted `auxEligible` custom kind folded in; a
  per-tool-name non-aux override kept bare; empty → `[]`; every branch covered.
- `MessageItem` MUST be tested in minimal mode: assistant → exactly one `.chat-group` + bare answer,
  `data-minimal`, compact footer (`data-compact`); non-adjacent aux folded; user → compact chrome
  only (no aux-collapse); `minimal={false}` → identical to grouped; `flat` wins over `minimal`;
  `raw` wins over `minimal`; a trailing custom non-aux block renders bare after the group.
- `MessageLog` MUST be tested: `minimal` threads to each `MessageItem` and marks `.chat-log`
  `data-minimal`; absent → no `data-minimal` anywhere.
- The stylesheet contract MUST be parse-tested: the `.chat-log[data-minimal]` and
  `.chat-message[data-minimal]` rules reference `--chat-gap-compact`, and the token exists with
  light and dark values.
- The demo MUST include a Minimal toggle, and the demo tests MUST render minimal across all three
  registries and assert one collapsed group per assistant turn, with zero runtime network calls
  preserved.
- No `.only`/`.skip`; coverage at or above the configured threshold.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not in
the rule.

### Public Surface

- `MessageLog` and `MessageItem` MUST accept an OPTIONAL `minimal?: boolean` (default `false`).
  When absent, output MUST be identical to the default grouped behavior.

### Folding Pass

- A new pure, DOM-free `collapseTurnAux(blocks, overrides?)` MUST fold ALL `auxEligible` blocks into
  ONE group, emitted at the FIRST aux block's index, with non-aux blocks bare in original order. A
  single aux block MUST still collapse into a one-item group. It MUST reuse
  `getBlockTimelineBehavior` (and the existing summary/hidden-count selection) — not reimplement
  them — and `groupBlocks` MUST remain unchanged.

### MessageItem / MessageLog Behavior

- When `minimal && !flat && !raw && role === 'assistant'`, `MessageItem` MUST use `collapseTurnAux`
  instead of `groupBlocks`. When `minimal`, it MUST force a compact footer and add
  `data-minimal="true"` on `.chat-message`. `flat` MUST win over `minimal`; `raw` MUST win over
  `minimal`. User messages MUST get the compact chrome but NOT aux-collapse.
- `MessageLog` MUST thread `minimal` to each `MessageItem` and add `data-minimal="true"` on
  `.chat-log`. Top-level `timelineItems` MUST stay interleaved by order and MUST NOT be folded.

### Styling

- The stylesheet MUST add `--chat-gap-compact` (~`0.375rem`, light + dark) and minimal rules:
  `.chat-log[data-minimal="true"]` (tighter inter-message gap), `.chat-message[data-minimal="true"]`
  (tighter in-message gap + bubble padding), and compact footer spacing. Token-driven and
  headless-only.

### Demo

- The demo controls strip MUST include a "Minimal" toggle next to Flat/Verbose, mapping to
  `minimal` on `MessageLog`, threaded through every registry pane.

#### Scenario: Minimal folds a turn's aux to one line

- **GIVEN** an assistant turn `[reasoning, tool_call, status, text]` with `minimal` set
- **WHEN** the log renders
- **THEN** the three metadata blocks collapse under ONE disclosure with a `+N` badge, the answer
  renders bare beneath it, the footer is compact, and the log/message wrappers carry `data-minimal`.

## Design

### Approach

- `render/minimalGrouping.ts` — new `collapseTurnAux` pure pass.
- `render/MessageItem.tsx` — `minimal` prop selects the pass for assistant turns, forces compact
  footer, sets `data-minimal`.
- `render/MessageLog.tsx` — `minimal` prop threaded down + `data-minimal` on `.chat-log`.
- `styles.css` — `--chat-gap-compact` token + minimal layout rules.
- `demos/chat-demo` — a Minimal toggle in `App.tsx`, threaded through `Pane.tsx`.

### Decisions

- **Decision**: A separate `collapseTurnAux` pass rather than parameterizing `groupBlocks`.
  - **Why**: the semantics genuinely differ (fold all vs maximal runs; lone-aux → group vs bare);
    keeping `groupBlocks` untouched protects the default path and keeps each pass simple.
- **Decision**: Emit the single group at the FIRST aux block's index.
  - **Why**: chronology-preserving — the metadata line appears where the turn's work began.
- **Decision**: Respect host timeline-behavior flags; do not special-case "pinned generative".
  - **Why**: the existing non-aux default already keeps custom/generative blocks bare and visible;
    no extra branch is needed.

### Non-Goals

- No change to the default grouped pass, summaries, timers, block dispatch, or attachments.
- No folding of top-level `timelineItems` (only a turn's own blocks fold).

## Tasks

- [x] `minimalGrouping.ts`: `collapseTurnAux` pure pass (+ export)
- [x] `MessageItem`: `minimal` prop (assistant fold, compact footer, `data-minimal`; flat/raw
      precedence; user compact chrome only)
- [x] `MessageLog`: `minimal` prop threaded + `.chat-log` `data-minimal`
- [x] `styles.css`: `--chat-gap-compact` (light+dark) + minimal layout rules
- [x] Demo: Minimal toggle in App/Pane threaded to `MessageLog`
- [x] Specs: message-rendering (Minimal subsection + scenarios, architecture/Business Logic),
      demos + changelog rows
- [x] Tests: `collapseTurnAux` exhaustive; MessageItem/MessageLog minimal; styles parse; demo
      parity (minimal across registries) + no-network

## Open Questions

- [ ] Whether to also offer a density level beyond a single boolean (current default: boolean flag)

## References

- Spec: [message-rendering](../specs/message-rendering/), [demos](../specs/demos/)
- Related: [0004-message-rendering](./0004-message-rendering.md),
  [0007-render-extensibility](./0007-render-extensibility.md)
