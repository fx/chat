# 0020: Agent Runtime

## Summary

Add `@fx/chat-agent`: an OpenAI-compatible streaming client, a pure delta accumulator that builds
`ChatMessage`s, history encoding, and the tool loop with approval and cancellation.

**Spec:** [chat-agent](../specs/chat-agent/)
**Status:** complete
**Depends On:** 0019

## Motivation

The mobile app (0021) and a later terminal CLI need identical agent behavior against
user-configured endpoints, with no backend. Building it once as a UI-free package keeps the renderers
pure and gives both apps the same stream handling.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[Architecture § Testing](../specs/architecture/index.md#testing)). CI enforces these as merge gates:

- Vitest; every exported function has unit tests covering the spec scenarios.
- Streaming and timing use fake timers and recorded chunk fixtures — no network and no real sleeps.
- No `.only` / `.skip`.
- Coverage threshold (100%) extends to `packages/agent/src/**`.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not in the
rule.

### Functional requirements

The [chat-agent spec](../specs/chat-agent/) owns the endpoint, streaming, tool-loop, encoding,
cancellation and error behavior and its scenarios; they are this change's acceptance criteria. What
implementing them requires of this change:

- Chunk fixtures MUST include the reasoning-field variants named in the spec, split tool-call
  arguments, a usage-only final chunk, a `stop` finish reason with tool calls, and an error body.
- The package is wired into the root build, typecheck, coverage include, and publish workflow.

## Design

### Approach

- `sse.ts` — incremental SSE line parser over a byte stream (handles `\r\n`, multi-line `data:`,
  comments, `[DONE]`).
- `client.ts` — `createClient({ baseUrl, apiKey, fetch, headers })` with `listModels` and
  `streamCompletion` yielding normalized events.
- `think.ts` — streaming `<think>` splitter that holds back partial tags.
- `accumulate.ts` — pure `applyEvent(state, event)` building the turn's blocks and metrics.
- `encode.ts` — `ChatMessage[]` → Chat Completions messages, splitting assistant turns into steps.
- `run.ts` — `runAgent` loop: stream → accumulate → approve → execute → encode → repeat.

### Decisions

- **One assistant message per user turn, spanning all steps.**
  - **Why**: matches the message model (tool results folded into `tool_call` blocks) and lets the
    renderers' turn-level grouping work unchanged.
  - **Alternatives considered**: one message per step — needs a tool-role message type the model
    deliberately lacks.
- **Step boundaries recorded explicitly** (each step's first block index and the reasoning field it
  used) in the message's opaque host bag under the `fx.agent` key; when that record is absent (a
  message from elsewhere), steps are recovered from block order — a new step starts at the first
  non-tool block after a tool call.
  - **Why**: the model has no step concept; this avoids extending the core union while keeping the
    re-encoding exact for the runtime's own messages.
- **Usage requested via `stream_options.include_usage`**, retried once without it if the endpoint
  rejects the option.

### Non-Goals

- Responses API, MCP, structured reasoning payloads, embeddings, non-streaming mode.

## Tasks

- [x] Scaffold `packages/agent`, wire build/typecheck/coverage
- [x] SSE parser, think-tag splitter, accumulator with fixtures
- [x] Client (`listModels`, `streamCompletion`) and history encoder
- [x] `runAgent` loop: tools, approval, max steps, abort, error outcomes
- [x] Docs: spec changelog and indexes

## Open Questions

- [ ] Should tool results be truncated before being sent back to the model? Current default: the
      host's tool decides; the runtime sends what it returns, stringified.

## References

- Spec: [chat-agent](../specs/chat-agent/)
- Related changes: [0019-core-extraction](./0019-core-extraction.md),
  [0021-mobile-app](./0021-mobile-app.md)
