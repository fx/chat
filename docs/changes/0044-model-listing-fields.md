# 0044: Model Listing Fields

## Summary

`@fx/chat-agent` keeps the standard fields of an endpoint's model listing. Beside `supportedParameters`, `ModelInfo` now carries `name`, `ownedBy` (`owned_by`), `created`, `contextLength` (`context_length`) and `inputModalities` (`architecture.input_modalities`): the OpenAI listing fields and the OpenRouter convention many gateways share. Each is kept only when the endpoint gives it with the expected type, so hosts can search, describe and filter a listing without parsing the raw response themselves.

**Spec:** [chat-agent](../specs/chat-agent/)
**Status:** complete
**Depends On:** 0039

## Motivation

`listModelInfo()` (0039) returned only a model's id and declared parameters. A host that wants to show a model's display name, search by owner, sort by age or filter by context window or image input had to fetch and parse `/models` itself, duplicating the client's endpoint handling and its tolerance of malformed listings.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[Architecture § Testing](../specs/architecture/index.md#testing)). CI enforces these as merge gates.

### Functional requirements

The spec owns the behavior. This change owns:

- `ModelInfo` gains optional `name`, `ownedBy`, `created`, `contextLength` and `inputModalities`; `supportedParameters` and `id` are unchanged.
- Each listing entry is mapped by `modelInfo(raw, id)`: a non-empty string for `name` / `owned_by`; a finite positive number for `created` / `context_length`; for `architecture.input_modalities` and `supported_parameters`, an array whose string members are kept. A field that is missing or has another type is dropped, not defaulted.
- Explicit listings still always fetch and refresh the tool-support cache (0039); the extra fields do not change tool support.

## Design

### Decisions

- **Generic listing fields only.** The package keeps the fields as the endpoint names them, in camelCase, with no provider- or app-specific interpretation. What a host does with them (capability filters, labels) lives in the host.
- **Validate by type, drop the rest.** Gateways differ and some return partial or mistyped entries; a field present with the wrong type is treated as absent so hosts never see e.g. a string context length.

### Non-Goals

Pricing, per-provider metadata and any server-side model metadata service; host UI for searching or filtering models (the mobile app's capability filters are a later change).

## Tasks

- [x] `ModelInfo` listing fields and the typed `modelInfo` mapping in `packages/agent/src/client.ts`
- [x] Client test covering kept, mistyped and missing fields
- [x] chat-agent spec requirement and changelog row
