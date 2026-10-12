# Chat Agent

## Overview

`@fx/chat-agent` is an optional, UI-free runtime that drives agent-style conversations against any
OpenAI-compatible Chat Completions endpoint and produces `@fx/chat-core` `ChatMessage`s as it goes.
It streams text, reasoning and tool calls, executes host-registered tools (with optional approval),
and loops until the model stops calling tools. Every renderer (`@fx/chat`, `@fx/chat-ink`) can display
its output unchanged. It MUST NOT render UI and MUST NOT require a backend: it runs entirely in the
client (browser, webview, Node).

## Background

The reference apps ([mobile-app](../mobile-app/), a later terminal CLI) are fully client-side and talk
directly to a user-configured endpoint. They share the same hard part — turning a server-sent-event
stream of deltas into a growing, well-formed message, and running the tool loop — so it lives in one
package rather than being re-implemented per app. Keeping it separate from the renderers preserves the
renderers' purity: hosts with their own backend never install it.

Related: [chat-core](../chat-core/) (the model it produces), [message-model](../message-model/)
(block semantics: one assistant message per turn, tool results folded into `tool_call` blocks).

## Requirements

### Package Boundary

- The package MUST be named `@fx/chat-agent`, live at `packages/agent/`, ship ESM + `.d.ts`, and
  depend only on `@fx/chat-core`.
- It MUST NOT import React, any renderer, or any platform API other than the injected `fetch`.
  The one exception is the opt-in `indexedDbStore()` persistence adapter, which touches
  `indexedDB` only when a host chooses it and first reads or writes through it.
- The HTTP transport MUST be injectable: the host MAY pass its own `fetch` (e.g. a native,
  CORS-exempt fetch on mobile); the global `fetch` is the default.

### Endpoint Configuration

- A client MUST be configured with a base URL and an OPTIONAL API key; when a key is present it MUST
  be sent as an `Authorization: Bearer` header and MUST NOT be sent anywhere except the configured
  base URL.
- The client MUST NOT follow redirects from the endpoint. A redirect response — or a response the
  transport followed anyway — MUST be an error naming the redirect target and telling the user to
  configure that URL as the base URL directly; its body MUST NOT be read.
- The base URL MUST be accepted with or without a trailing slash and with or without a trailing
  `/v1` segment supplied by the user (it is used as given; paths are appended to it).
- The client MUST list available models from the endpoint's models listing and MUST surface a listing
  failure as an error rather than an empty list.

#### Scenario: Key goes only to the endpoint

- **GIVEN** a client configured with base URL `https://api.example.test/v1` and key `sk-test`
- **WHEN** the agent runs a turn whose tools fetch `https://other.example.test/`
- **THEN** the request to `api.example.test` carries `Authorization: Bearer sk-test`, and no
  request to any other host carries it.

#### Scenario: Endpoint redirects

- **GIVEN** a client configured with base URL `https://api.example.test/v1` and key `sk-test`
- **WHEN** the endpoint answers the models listing with a redirect to `https://other.example.test/v1/models`
- **THEN** listing fails with an error naming `https://other.example.test/v1/models` and asking for it
  to be configured as the base URL, and no request to `other.example.test` is made.

### Streaming Into a Message

A turn produces exactly one assistant `ChatMessage`, updated in place as deltas arrive. The host
receives an immutable snapshot after every applied delta.

- Content deltas MUST append to a text block; reasoning deltas MUST append to a reasoning block.
  Reasoning MUST be accepted from the `reasoning_content` and `reasoning` delta fields, and — when
  enabled (default on) — from `<think>…</think>` spans inside content, including tags split across
  chunks.
- A reasoning block MUST carry `startedAt` when its first delta arrives and `durationMs` once any
  non-reasoning output follows it or the turn ends.
- Tool-call deltas MUST be accumulated by their stream `index` into one `tool_call` block per call,
  with the name and the concatenated argument fragments; arguments MUST be parsed to JSON once the
  call is complete, and unparseable arguments MUST yield an `error` status rather than a crash.
- A step MUST be treated as ending in tool calls whenever it accumulated at least one tool call,
  whatever its `finish_reason` (some servers report `stop` alongside tool calls).
- Block order MUST follow arrival order across steps (reasoning, text, tool calls, then the next
  step's reasoning, text, …), so renderers can group auxiliary runs.
- When the endpoint reports usage, the message MUST carry it in its metrics together with the model
  name, total duration, and completion tokens per second.

#### Scenario: Tool-call arguments split across chunks

- **GIVEN** a stream whose deltas carry tool call index 0 with name `calculator` and arguments
  `{"expr` then `ession":"1+1"}`
- **WHEN** the stream finishes with `finish_reason: "tool_calls"`
- **THEN** the message holds one `tool_call` block named `calculator` with arguments
  `{ "expression": "1+1" }`.

#### Scenario: Inline think tags

- **GIVEN** content deltas `<thi`, `nk>plan</th`, `ink>Answer`
- **WHEN** they are applied with think-tag parsing enabled
- **THEN** the message holds a reasoning block `plan` followed by a text block `Answer`.

### Tool Loop

- The host MUST be able to register tools, each with a name, a description, a JSON-Schema parameter
  definition, an executor, and an OPTIONAL approval requirement.
- After a step that ends with tool calls, the runtime MUST execute each call, record the result (or
  error) and duration on its block with status `success` or `error`, send the results back to the
  model, and start the next step; it MUST stop when a step ends without tool calls or when a
  host-configured maximum number of steps is reached.
- A call to an unregistered tool MUST be recorded as an `error` result and returned to the model, not
  thrown.
- For a tool that requires approval, the call MUST remain `pending` until the host's approval
  callback resolves; a denial MUST be recorded as an `error` result stating that the user declined,
  and returned to the model.
- Tool executors MUST receive the run's abort signal.

#### Scenario: Denied tool call

- **GIVEN** a registered tool `fetch_url` that requires approval and a host approval callback that
  resolves `false`
- **WHEN** the model calls `fetch_url`
- **THEN** the executor never runs, the block ends with status `error` and a declined result, and the
  next step's request includes that result.

### Built-in Tools

- The package MUST offer the built-in tools the reference apps share — current date/time, a
  deterministic arithmetic calculator (a parser, never evaluating code; IEEE-754 double precision),
  and an HTTP GET page fetcher returning text, truncated to a fixed limit — each enabled per host,
  with network tools requiring approval by default.
- The page fetcher MUST NOT follow redirects: it MUST request with manual redirect handling, and when
  the response is a redirect, or the transport followed one anyway, it MUST NOT return the body and
  MUST instead tell the model the target URL (or that it is unknown) and that loading it takes
  another, separately approved call.
- Platform services the tools use (transport, HTML-to-text, clock) MUST be injectable, with defaults
  that need no DOM.

### Activity Fields

- The runtime MUST record approval on tool calls that require it: `pending` while the host decides,
  then `approved`, or `denied` (also when no approval handler exists) — alongside the existing
  status rules.
- The finished message MUST carry an `outcome` when the run did not complete: `stopped` when
  aborted, `error` (with the run's error message, retryable) on failure or when the step limit was
  reached.
- When the endpoint reports a cost in its usage (e.g. a `cost` field), the message metrics MUST carry
  it; summed across steps. Context use MUST be recorded as the last step's prompt plus completion
  tokens when both are reported.

### Conversation Encoding

- The runtime MUST encode a `ChatMessage[]` history into Chat Completions messages: system prompt
  first (when given), user messages with their text and image attachments, and each assistant turn
  split back into its steps — an assistant message with text and `tool_calls`, followed by one `tool`
  message per call carrying its result.
- Reasoning that arrived in a delta field MUST be echoed back on its assistant step under the same
  field name (some endpoints reject a tool-call continuation without it). Reasoning parsed from inline
  think tags MUST NOT be sent back.
- Status blocks and custom blocks MUST NOT be sent.

### Cancellation and Errors

- Aborting a run MUST stop at the next stream event even if the transport ignores the signal, MUST stop the stream and any running tool, MUST end a pending approval even if the host's approval callback never settles, MUST leave the message well-formed
  (open reasoning finalized, unfinished tool calls marked `error` with an aborted result), and MUST
  resolve the run with an `aborted` outcome rather than rejecting.
- HTTP errors, malformed streams, and network failures MUST resolve the run with an `error` outcome
  carrying a human-readable message (including the endpoint's error message when it sends one); the
  partial message MUST be kept.

#### Scenario: User stops a streaming turn

- **GIVEN** a run that has streamed reasoning and half a sentence of text
- **WHEN** the host aborts
- **THEN** the run resolves `aborted`, the reasoning block has a `durationMs`, and the text so far is
  kept.

### Conversation Controller

- The package MUST export `ChatController`, a framework-free conversation controller
  (`subscribe` / `getState`, usable with `useSyncExternalStore` or any loop) that owns the
  conversation list, lazily loaded transcripts, active runs, run errors, the tool-approval queue and
  messages queued while a run streams.
- Persistence MUST go through an injected `KeyValueStore` (`get` / `set` / `delete`); the package
  ships `memoryStore()` and the lazily opened `indexedDbStore(name?)`, and the host picks one.
  Transcript writes are debounced; tool calls left running by a killed process are marked failed on
  load.
- Endpoints, models and tool settings MUST stay host-owned: the controller asks
  `resolveRun(meta)` per conversation for a `RunConfig` (base URL, key, model, system prompt, tools,
  approvals, extra tools) or `{ blocked }`, which is surfaced as the conversation's run error.
- `send` and `regenerate` MUST start their run synchronously once the transcript is loaded, so the
  user message and the run are in state as soon as the call returns. A message sent while a run is
  active is queued (option `queue`) or dropped; queued messages are sent in order when the run ends,
  and `unqueue` takes the newest back.
- Streamed updates MAY be throttled (`updateIntervalMs`); pending updates MUST be applied before an
  approval is shown and when the run ends. `stop(id)` aborts one run; `dispose()` stops every run.
- Conversation metadata is generic (`ChatController<M extends ConversationMeta>`): hosts extend it
  with their own fields (e.g. which endpoint a conversation is bound to).

## Design

### Architecture

```
createClient({ baseUrl, apiKey?, fetch? })
  ├── listModels()
  └── streamCompletion(request, signal) ──► SSE parser ──► normalized StreamEvent[]
runAgent({ client, model, history, tools, approve?, maxSteps, signal, onUpdate })
  loop: encode(history + current turn) → stream → applyEvent* → execute tools → next step
applyEvent(message, event) → message      (pure; the accumulator, unit-tested in isolation)
new ChatController({ fetch, resolveRun, kv?, queue?, updateIntervalMs? })
  state (conversations, transcripts, runs, errors, approvals, queue) ── subscribe/getState
  send / regenerate ──► resolveRun(meta) ──► runAgent ──► debounced KeyValueStore writes
```

The accumulator is pure so it is tested with recorded chunk sequences, no network.

## Constraints

- No telemetry, no hard-coded endpoints, no outbound request except to the configured base URL and
  whatever host tools themselves fetch.
- The package MUST NOT log API keys or request headers.

## Open Questions

- **Responses API.** Only Chat Completions is supported. Current default: add an alternate transport
  later if needed; the event layer is designed so a second transport can feed the same accumulator.
- **MCP tools.** Remote MCP servers as tool sources. Current default: out of scope.
- **Structured reasoning details.** Some routers send a structured reasoning payload that they want
  returned verbatim across tool turns. Current default: not preserved; only the plaintext field is.

## References

- OpenAI Chat Completions streaming reference (`stream: true`, `stream_options.include_usage`).
- [chat-core](../chat-core/), [message-model](../message-model/), [mobile-app](../mobile-app/)

## Changelog

| Date | Change | Document |
|------|--------|----------|
| 2026-10-10 | Initial spec created | [0020-agent-runtime](../../changes/0020-agent-runtime.md) |
| 2026-10-10 | Built-in tools moved in from the mobile app; abort honoured per event | [0022-ink-renderer](../../changes/0022-ink-renderer.md) |
| 2026-10-10 | Approval state, message outcome, cost/context metrics | [0023-agent-activity-model](../../changes/0023-agent-activity-model.md) |
| 2026-10-11 | `ChatController` conversation controller; `KeyValueStore` with memory and IndexedDB stores | [0037-chat-controller](../../changes/0037-chat-controller.md) |
