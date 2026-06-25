# 0002: Normalized Message Model & Codec

## Summary

Implement the transport-agnostic message model (`ChatMessage`, `ContentBlock` union,
`ToolCallBlock`, `Attachment`, `MessageMetrics`) and the pure codec that normalizes a host
shape — including unwrapping multiply-encoded tool JSON and assigning explicit tool status —
into the model. Pure data and pure functions; no React, no DOM.

**Spec:** [message-model](../specs/message-model/)
**Status:** draft
**Depends On:** 0001

## Motivation

Every renderer and the composer consume this model. Defining it explicitly (discriminated
content blocks, parsed tool args/results, explicit tool status) removes render-time
re-derivation and lets hosts adopt the package without rewriting storage.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[architecture › Testing](../specs/architecture/index.md#testing)). CI enforces these as merge
gates:

- Every codec function MUST have unit tests, including each GIVEN/WHEN/THEN scenario in the
  spec.
- Tests MUST cover JSON-unwrapping (single and multiply-encoded), tool status mapping, ordering
  of blocks, transcript-level tool-role folding (matched and unmatched results), and the
  dev-mode validator.
- The model and codec MUST be tested as importable in a non-DOM context.
- No `.only`/`.skip`; coverage at or above the configured threshold.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not
in the rule.

### Model Types

- The package MUST export the `ChatMessage`, `ContentBlock` (discriminated by `type`),
  `ToolCallBlock` (with explicit `status`), `Attachment`, and `MessageMetrics` types per the
  spec.
- The core `ContentBlock` union MUST NOT include application-specific kinds.

### Codec

- The package MUST export `normalizeMessage(input, mapping)` producing a `ChatMessage` with
  ordered blocks, parsed tool `arguments`/`result`, and explicit tool `status`.
- The package MUST export `normalizeTranscript(inputs, mapping)` producing `ChatMessage[]` that
  folds standalone tool-role host messages into the originating assistant message's matching
  `tool_call` block (by tool-call back-reference), emits no standalone tool-role message, and
  preserves an unmatched tool result rather than dropping it.
- The codec MUST unwrap multiply-encoded JSON strings (bounded iterations).
- The package MUST export a dev-mode `assertChatMessage(value)` guard.

#### Scenario: Flat-content normalization

- **GIVEN** a host message with flat `content`, separate `reasoning`, and `toolCalls`
- **WHEN** normalized
- **THEN** blocks are ordered `[reasoning?, text, tool_call…]`, tool values are parsed, and
  tool status is explicit.

#### Scenario: Folding separate tool-role messages

- **GIVEN** a transcript `[assistant(toolCalls:[{id:'t1'}]), tool(toolCallId:'t1', result), user]`
- **WHEN** passed through `normalizeTranscript`
- **THEN** the output is `[assistant, user]` with the assistant's `t1` block carrying the parsed
  `result`/`status`, and no standalone tool-role message.

## Design

### Approach

- Add `packages/chat/src/model/` with `types.ts` and `codec.ts`.
- Implement a small bounded `deepParseJson` helper inside the codec.
- Map host tool error signaling into `status` via a mapping callback (the host decides what an
  error is); default mapping documented for the common "top-level `error` key" case.
- Export everything from the root entry point.

### Decisions

- **Decision**: `unknown` for tool `arguments`/`result` at the type boundary; codec guarantees
  JSON-safety.
  - **Why**: avoid over-constraining hosts.
  - **Alternatives considered**: a strict recursive `JSONValue` (kept as open question).
- **Decision**: No host-specific named adapter in the public surface.
  - **Why**: keep the package application-agnostic.
  - **Alternatives considered**: ship a named adapter (rejected; provide docs/examples
    instead).

### Non-Goals

- No rendering, no registry, no streaming hooks (later changes).
- No application-specific block kinds.

## Tasks

- [ ] Implement `model/types.ts` (ChatMessage, ContentBlock union, ToolCallBlock, Attachment,
      MessageMetrics) with full unit-tested type coverage via type tests
- [ ] Implement `model/codec.ts` (`normalizeMessage`, `normalizeTranscript` with tool-role
      folding by back-reference + unmatched-result preservation, bounded `deepParseJson`,
      tool-status mapping, attachment kind derivation) with unit tests for every scenario
- [ ] Implement `assertChatMessage` dev guard with tests
- [ ] Export model + codec from the root entry point and add a non-DOM import test

## Open Questions

- [ ] `JSONValue` vs `unknown` for tool payload types
- [ ] Default tool-error mapping shape

## References

- Spec: [message-model](../specs/message-model/)
- Related: [0004-message-rendering](./0004-message-rendering.md)
