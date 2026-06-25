# 0005: Headless Composer, Completion Providers & Mentions

## Summary

Implement the headless `ChatInput` composer (controlled + uncontrolled, autosize, Enter-to-send,
attachment chips, mention overlay, atomic mention deletion), the DOM-free completion-provider
contract, the portal completion popup (caret-anchored, keyboard nav, IME guards, viewport flip,
a11y), the reference completion provider, and the mention parser/segmenter.

**Spec:** [input-composer](../specs/input-composer/)
**Status:** draft
**Depends On:** 0002, 0003

## Motivation

Completes the "display + headless input" scope: a reusable composer with a pluggable completion
system and no application-specific providers, fetches, or stores.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[architecture › Testing](../specs/architecture/index.md#testing)). CI enforces these as merge
gates:

- Composer behavior MUST be tested with `@testing-library/react` + `user-event`: Enter/Shift+
  Enter, send gating (empty/disabled/streaming), atomic mention deletion, attachment payload.
- The completion-provider contract, parser, and segmenter MUST be tested as importable in a
  non-DOM context.
- Popup tests MUST cover keyboard nav/apply, IME guard, provider precedence, stale-async
  abort, Escape suppression, and `aria-activedescendant`.
- No `.only`/`.skip`; coverage at or above the configured threshold.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not
in the rule.

### Composer

- `ChatInput` MUST support controlled (`value`/`onChange`) and uncontrolled use, autosize to
  `maxLines`, Enter-to-send (Shift+Enter newline), send gating (empty/disabled/streaming with
  optional `onStop`), attachment chips included in `onSend`, mention overlay, and atomic mention
  deletion. SSR-safe.

#### Scenario: Send gated while streaming

- **GIVEN** `isStreaming` true
- **WHEN** Enter pressed
- **THEN** `onSend` does not fire; a stop control shows if `onStop` provided.

### Completion Contract, Popup & Reference Provider

- Export the `CompletionProvider`/`CompletionItem`/`CompletionMatch`/`CompletionApplyResult`
  types (DOM-free) and exactly one static reference provider.
- The popup MUST anchor at the caret, support keyboard nav/apply with IME guards, flip to avoid
  clipping, render via portal, expose `handleKeyDown(e): boolean` called before the composer's
  handler, and be accessible (`listbox`/`option`/`aria-activedescendant`), with Escape
  suppression and a loading-delay.

#### Scenario: Stale async results discarded

- **GIVEN** an async provider
- **WHEN** the query changes before resolution
- **THEN** the stale request is aborted and never applied.

### Mentions

- Export DOM-free `parseMentions` (ranges) and `mentionsToSegments` (interleaved segments with
  stable keys); mention = `@<id>` at start or after whitespace; documented id charset.

#### Scenario: Atomic mention deletion

- **GIVEN** `hello @alice ` caret after the mention
- **WHEN** Backspace
- **THEN** the whole `@alice` token (+ one trailing space) is removed in one press.

## Design

### Approach

- Add `packages/chat/src/input/`: `ChatInput.tsx`, `CompletionPopup.tsx`, `completion/types.ts`,
  `completion/reference.ts`, `mentions.ts`, `caret.ts` (mirror-div caret measurement).
- Wire popup `handleKeyDown` ahead of composer key handling; recompute on render with O(1)
  early-outs; first-matching-provider wins; abort stale `items()`.
- Render the mention overlay behind the textarea from the segmenter, scroll-synced.

### Decisions

- **Decision**: First-class controlled mode (not imperative-ref-only).
  - **Why**: design-system-agnostic reuse needs a clean controlled API.
  - **Alternatives considered**: keep imperative ref (rejected — leaky, host-specific).
- **Decision**: Ship only the contract + one reference provider; no server-fetch provider.
  - **Why**: keep the package application-agnostic.
  - **Alternatives considered**: ship an example fetch provider (rejected; lives in demos/docs).

### Non-Goals

- No model/tool selectors, no upload pipeline, no generative-UI bridges, no cross-component
  global insertion registries.

## Tasks

- [ ] Implement `completion/types.ts` (contract) + `completion/reference.ts` (static provider)
      + `caret.ts`, with non-DOM import tests
- [ ] Implement `mentions.ts` (`parseMentions`, `mentionsToSegments`) with tests
- [ ] Implement `CompletionPopup` (anchor, keyboard nav/apply, IME guard, flip, portal, a11y,
      Escape suppression, loading-delay, stale-abort) with tests
- [ ] Implement `ChatInput` (controlled+uncontrolled, autosize, Enter-send + gating, attachment
      chips, mention overlay, atomic deletion, popup wiring) with tests

## Open Questions

- [ ] Controlled vs uncontrolled documented default
- [ ] Ship the small fuzzy scorer helper or not
- [ ] Scope of the `fileToAttachment` demo helper

## References

- Spec: [input-composer](../specs/input-composer/)
- Related: [0003-component-registry](./0003-component-registry.md)
