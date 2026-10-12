# Message Model

## Overview

The message model is the **normalized, transport-agnostic** data shape that every `@fx-/chat`
renderer consumes. It MUST be independent of any wire format, database schema, or LLM provider
SDK. Hosts map their own message shapes into this model via a documented codec. The model is
pure data and pure functions: it MUST NOT import React, the DOM, or any UI primitive.

## Background

The extraction source represents a message as a flat `content` string with sibling fields
(`reasoning`, `toolCalls`, `images`, `fileAttachments`, timing fields) and folds `role:'tool'`
messages into the originating assistant message's tool results at render time. Tool-call
arguments and results are opaque, sometimes multiply-encoded, JSON strings; tool error and
timing are derived at render time rather than stored.

For a reusable package this is too implicit. This spec defines an explicit, discriminated
**content-block** model so renderers never re-derive structure, plus a codec layer so hosts
can adopt the package without rewriting their storage. The model deliberately covers only
generic chat concepts; application-specific block kinds (job/wake timelines, generative-UI)
are out of scope (see [architecture](../architecture/)).

Related: [message-rendering](../message-rendering/) consumes this model;
[architecture](../architecture/) constrains its purity.

## Requirements

### Normalized Message

- A `ChatMessage` MUST carry a stable `id`, a `role`, and an ordered list of content
  `blocks`. It MAY carry `createdAt`, `metrics` (timing/usage), and an opaque `meta` bag.
- `role` MUST be one of `'system' | 'user' | 'assistant'`. The model MUST NOT define a
  standalone `'tool'` role message; tool execution is represented as blocks on an assistant
  message (see Tool Invocation).
- The model MUST represent message content as an ordered, discriminated `ContentBlock[]`,
  not as a flat string with sibling fields. This makes ordering explicit and removes
  render-time re-derivation.
- The model MUST be JSON-serializable. It MUST NOT contain functions, class instances, or
  React nodes.

#### Scenario: Stable identity and ordering

- **GIVEN** a `ChatMessage` with multiple blocks
- **WHEN** it is rendered and later re-rendered after a streaming update
- **THEN** the message `id` and the relative order of its blocks are preserved.

### Content Blocks

- The model MUST define a discriminated union `ContentBlock` with at least these variants,
  each tagged by a `type` field:
  - `text` — assistant or user prose. Carries `text: string`. MAY carry `markdown?: boolean`
    hint (assistant text is markdown by default; user text is plain by default).
  - `reasoning` — model thinking. Carries `text: string` and OPTIONAL `startedAt` (epoch
    ms; anchors the live thinking timer for reasoning that follows earlier turn activity)
    and `durationMs`.
  - `tool_call` — a single tool invocation (see Tool Invocation).
  - `status` — a generation-lifecycle marker. Carries an OPTIONAL `phase` of
    `'pre-stream' | 'streaming' | 'complete'`.
  - `system` — system-prompt content. Carries `text: string`.
  - `plan` — an agent's checklist. Carries `entries`, each with `content: string`, a `status` of
    `'pending' | 'in_progress' | 'completed'`, an OPTIONAL `priority` of `'high' | 'medium' | 'low'`
    and an OPTIONAL stable `id`. A plan is a generic agent concept (reported in the same shape by
    agent protocols and coding agents), not an application-specific kind.
- A plan update MUST replace the whole entry list: a producer updates the existing plan block (same
  `id`) in place rather than appending a second one, so the latest plan wins.
- Each block MUST carry a stable `id` (unique within its message) usable as a render key.
- The union MUST be open to extension by the host **only** through the registry's renderer
  slots, not by mutating the core union. The core union MUST NOT include app-specific kinds.

#### Scenario: Discriminated rendering

- **GIVEN** a message whose blocks are `[reasoning, text, tool_call]`
- **WHEN** a renderer iterates the blocks
- **THEN** it dispatches on `block.type` with exhaustive handling and no string parsing of
  content to discover structure.

### Tool Invocation

- A `tool_call` block MUST represent one invocation with: `id`, tool `name`, `arguments`, an
  OPTIONAL `result`, an explicit `status`, and OPTIONAL timing.
- `status` MUST be an explicit enum: `'pending' | 'running' | 'success' | 'error'`. Renderers
  MUST NOT re-derive error state by inspecting result payloads.
- `arguments` and `result` MUST be representable as already-parsed JSON values
  (`unknown`/`JSONValue`), not as opaque strings. The codec is responsible for unwrapping any
  multiply-encoded strings during normalization.
- The model MUST support OPTIONAL extracted media on a result (e.g. `media?: { kind:
  'image'|'audio'; url: string }[]`) so renderers can show generated images/audio without
  parsing the raw result.
- A `tool_call` MAY carry descriptive fields a host maps from its agent events:
  - `title` — a human title for the invocation ("Read config.yaml"), preferred over `name` for
    display;
  - `kind` — what the tool does, an open string with well-known values `read`, `edit`, `delete`,
    `move`, `search`, `execute`, `think`, `fetch`, `other` (renderers MAY choose a glyph by it; any
    other value is treated as `other`);
  - `inputSummary` — one line saying what the call acts on (a command, a path, a query);
  - `approval` — the outcome of asking permission: `state` of `'pending' | 'approved' | 'denied' |
    'unavailable'` (no way to allow it was offered) and an OPTIONAL display `label` ("allow once").
- `approval` explains `status`, never replaces it: a denied or unavailable call MUST still carry
  `status: 'error'`, and renderers MUST NOT infer approval from the result payload.

#### Scenario: Denied call keeps an error status

- **GIVEN** a call the user declined
- **WHEN** the host maps it
- **THEN** the block has `status: 'error'` and `approval: { state: 'denied' }`.

#### Scenario: Explicit error status

- **GIVEN** a tool result that the host considers an error
- **WHEN** the host maps it into a `tool_call` block
- **THEN** the block's `status` is `'error'` and the renderer styles it as an error without
  inspecting `result`.

### Attachments

- A `user` message MUST be able to carry attachments distinct from text: images and generic
  files.
- An attachment MUST carry at least a `url`, a `mediaType`, and a derived `kind` of
  `'image' | 'video' | 'audio' | 'file'`. It MAY carry `name`, a display `description`
  ("screenshot.png · 1280×720 · 240 KB", preferred over `name` when present) and a `size` in bytes.
- `url` MAY be any string the host can resolve (a `data:` or `https:` URL, a `file:` reference, an
  app-local id). Renderers that fetch MUST still apply the attachment-URL safety check or a host
  policy; renderers that only display it need not.
- The model MUST keep attachments separate from text blocks (attachments are message-level),
  matching how composers and renderers treat them.

### Message Outcome

- A message MAY carry an `outcome` saying how its generation ended when it did not simply complete:
  `{ kind: 'stopped' }` (stopped by the user or host; partial content kept) or `{ kind: 'error';
  message: string; retryable?: boolean }`.
- Whether a message is live stays a render-time input, never part of the model. A host restoring a
  message persisted mid-stream marks it stopped; that is host policy.

### Metrics

- A message MAY carry `metrics` with OPTIONAL `durationMs`, `tokensPerSecond`, token `usage`
  (`prompt`, `completion`, `total`), `model` identifier(s), `cost` (`amount`, OPTIONAL `currency`;
  absent currency means USD) as the endpoint reported it, and `context` window use after the turn
  (`used` tokens, OPTIONAL window `size`).
- Renderers MUST treat all metrics as OPTIONAL and degrade gracefully when absent.

### Codec

- The package MUST export pure codec helpers to construct and validate the model:
  - a single-message builder/normalizer that takes one host message and produces a
    `ChatMessage` (the package MAY provide a generic adapter signature and a reference adapter
    for the extraction source's shape, documented as an example, not a dependency).
  - a **transcript-level** normalizer that takes an ordered array of host messages and produces
    `ChatMessage[]`. This normalizer MUST fold standalone tool-role messages (host messages
    that carry a tool result and a back-reference such as `toolCallId`) into the originating
    assistant message's matching `tool_call` block (setting its `result`/`status`), and MUST
    NOT emit them as their own `ChatMessage`. A tool result with no matching prior tool call
    MUST be preserved (e.g. attached to a synthesized/unknown tool_call block) rather than
    dropped.
  - a guard/validator that asserts a value conforms to `ChatMessage` at runtime in dev.
- The codec MUST unwrap multiply-encoded JSON strings for tool `arguments`/`result` during
  normalization, so downstream consumers receive parsed values.
- The codec MUST carry the OPTIONAL tool-call fields (`title`, `kind`, `inputSummary`, `approval`),
  the message `outcome`, attachment `description`/`size`, and `plan` content from host messages
  through unchanged, and the validator MUST accept them when well-formed (`title` and
  `inputSummary` strings, `approval.state` one of its four values, plan entries with string
  `content` and a known `status`, outcome kinds as listed).
- The codec MUST be pure and synchronous and MUST NOT touch the DOM.

#### Scenario: Folding separate tool-role messages

- **GIVEN** an ordered host transcript `[assistant(toolCalls:[{id:'t1',…}]), tool(toolCallId:'t1', result), user(…)]`
- **WHEN** it is passed through the transcript-level normalizer
- **THEN** the output is `[assistant, user]` where the assistant's `t1` `tool_call` block carries
  the parsed `result` and an explicit `status`, and no standalone tool-role `ChatMessage` is
  emitted.

#### Scenario: Normalizing a flat-content host message

- **GIVEN** a host message with a flat `content` string, a `reasoning` string, and a
  `toolCalls` array of `{ function: { name, arguments }, result }`
- **WHEN** it is passed through the codec
- **THEN** the result is a `ChatMessage` whose `blocks` are ordered
  `[reasoning?, text, tool_call…]`, each tool call has parsed `arguments`/`result` and an
  explicit `status`, and no information needed by renderers is lost.

## Design

### Data Models

Illustrative TypeScript (authoritative field set; exact naming finalized in implementation):

```ts
type Role = 'system' | 'user' | 'assistant'

type ToolStatus = 'pending' | 'running' | 'success' | 'error'

interface ToolCallBlock {
  type: 'tool_call'
  id: string
  name: string
  arguments: unknown          // parsed value, not a JSON string
  result?: unknown            // parsed value, not a JSON string
  status: ToolStatus
  startedAt?: number          // epoch ms
  durationMs?: number
  media?: { kind: 'image' | 'audio'; url: string }[]
}

type ContentBlock =
  | { type: 'text'; id: string; text: string; markdown?: boolean }
  | { type: 'reasoning'; id: string; text: string; startedAt?: number; durationMs?: number }
  | { type: 'status'; id: string; phase?: 'pre-stream' | 'streaming' | 'complete' }
  | { type: 'system'; id: string; text: string }
  | ToolCallBlock

interface Attachment {
  url: string
  mediaType: string
  kind: 'image' | 'video' | 'audio' | 'file'
  name?: string
}

interface MessageMetrics {
  durationMs?: number
  tokensPerSecond?: number
  usage?: { prompt?: number; completion?: number; total?: number }
  model?: string
  requestModel?: string
}

interface ChatMessage {
  id: string
  role: Role
  blocks: ContentBlock[]
  attachments?: Attachment[]   // user messages
  createdAt?: number           // epoch ms
  metrics?: MessageMetrics
  meta?: Record<string, unknown>
}
```

### Business Logic

- **Streaming identity** — the model carries explicit `startedAt`/`durationMs` so the
  rendering layer's live timers can be derived purely from data and survive remounts. When a
  block is mid-stream, `durationMs` is absent and `status`/`phase` indicate activity.
- **Codec unwrapping** — a small `deepParseJson`-style helper (bounded iterations) converts
  multiply-encoded strings to values; it is part of the codec, not the renderers.
- **No tool role** — a host's `role:'tool'` messages are merged into the originating
  assistant message's `tool_call` block `result`/`status` by the **transcript-level** codec
  (matching on the result's tool-call back-reference), never surfaced as their own message. The
  single-message normalizer cannot perform this fold and is intended for hosts whose tool
  results are already inlined on the assistant message.

## Constraints

- The model and codec MUST be importable in SSR and in non-DOM environments.
- The model MUST remain minimal: adding application-specific block kinds to the core union is
  prohibited; extension happens via registry renderer slots (see component-registry).

## Open Questions

- **JSONValue vs unknown** for tool `arguments`/`result`.
  - Options: a strict `JSONValue` recursive type; plain `unknown`.
  - Current default: `unknown` at the type boundary, with the codec guaranteeing JSON-safety,
    to avoid over-constraining hosts.
- **Reference adapter scope** — whether to ship a named adapter for any specific host shape.
  - Current default: ship generic `normalizeMessage(input, mapping)` and
    `normalizeTranscript(inputs, mapping)` helpers plus documented examples; no host-specific
    adapter in the published surface.

## References

- [architecture](../architecture/)
- [message-rendering](../message-rendering/)

## Changelog

| Date | Change | Document |
|------|--------|----------|
| 2026-06-25 | Initial spec created | [0002-message-model](../../changes/0002-message-model.md) |
| 2026-07-03 | `ReasoningBlock` gains an OPTIONAL epoch-ms `startedAt` (mirroring `tool_call`), mapped by the codec from the optional host field `reasoningStartedAt` and validated by `assertChatMessage` — anchors the render layer's live thinking timer | [0016-live-reasoning-timer-and-tokens](../../changes/0016-live-reasoning-timer-and-tokens.md) |
| 2026-10-10 | Agent-activity fields: tool title/kind/inputSummary/approval, message outcome, cost/context metrics, attachment description/size | [0023-agent-activity-model](../../changes/0023-agent-activity-model.md) |
| 2026-10-10 | `plan` content block | [0024-plan-block](../../changes/0024-plan-block.md) |
