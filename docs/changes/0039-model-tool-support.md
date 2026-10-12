# 0039: Model Tool Support

## Summary

`@fx/chat-agent` honours a model's declared tool support. The client reads `supported_parameters` from the endpoint's model listing (the OpenRouter convention) and sends no tools to a model that declares parameters without `tools`; when the listing says nothing and the endpoint rejects a request over tools, it retries once without them and remembers the model. A request sent without tools carries its tool history as text (`flattenToolHistory`), so a conversation that used tools can continue on such a model. `listModelInfo()` exposes the declared parameters to hosts.

**Spec:** [chat-agent](../specs/chat-agent/)
**Status:** complete
**Depends On:** 0020, 0037

## Motivation

Some models take no client tools: an agent ingress answers a request carrying `tools` — and even one carrying `tool` messages or `tool_calls` — with a 400. With the built-in tools enabled, every turn on such a model failed, and a conversation that had used tools on another model could not continue on it at all.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[Architecture § Testing](../specs/architecture/index.md#testing)). CI enforces these as merge gates.

### Functional requirements

The spec owns the behavior. This change owns:

- New `ModelInfo` type (`id`, optional `supportedParameters`) and `Client.listModelInfo(signal?)`, sorted by id; `listModels()` is derived from it.
- The listing is read at most once per endpoint and key (a process-wide, bounded cache shared by every client), and only for a request that has tools or tool history. An aborted listing is not cached.
- A model whose listing declares parameters without `tools` gets no `tools` field and no tool history on the wire.
- A model the listing does not describe gets its tools; a 400/422 whose message names tools, tool choice or function calling is retried once without them, and that endpoint and model skip tools from then on (bounded process-wide set). This composes with the existing one-shot `stream_options` retry: each feature is dropped at most once.
- New export `flattenToolHistory(messages)`: each assistant tool call (`[called name(args)]`) and its result (`[name returned]\n…`) fold into the assistant turn as text; `tool` messages and `tool_calls` are dropped.

## Design

### Decisions

- **Tool support is the endpoint's property.** The listing cache and the set of models that rejected tools are shared by every client instance, keyed by endpoint (and key, for the listing), so a fresh client per run does not re-learn it. Both are bounded and start over when full.
- **Ask the listing only when it matters.** A request with no tools and no tool history never triggers a listing fetch, so plain chat costs nothing extra.
- **Retry on a message match, not any 400.** Only an error naming tools, tool choice or function calling drops them; any other rejection surfaces unchanged.
- **History as text, in the assistant turn.** Folding calls and results into the assistant's own turn keeps role alternation valid for strict endpoints and keeps what the tools returned visible to the model.

### Non-Goals

Server-side model metadata beyond `supported_parameters` (later slices add other listing fields); a host-facing toggle to force tools on or off per model.

## Tasks

- [x] `ModelInfo`, `listModelInfo()`, shared bounded listing cache
- [x] Skip tools for a model declaring none; retry once without tools on a tool rejection and remember the model
- [x] `flattenToolHistory` and its export; tool-less requests send history as text
- [x] Tests (client, encode, exports); chat-agent spec
