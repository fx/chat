# 0045: Model Picker

## Summary

Turn the Android app's model picker into a searchable, filterable list of the models of every enabled endpoint, with capability filters, a filters panel, favourites, cached and refreshable listings and a windowed list. Endpoints can be disabled, and one default model (from any endpoint) replaces the active endpoint and its per-endpoint default model, with a migration of stored settings. The assistant's model is chosen in a sheet, and "Same as new chats" follows from whether its model equals the default model.

**Spec:** [mobile-app](../specs/mobile-app/)
**Status:** complete
**Depends On:** 0039, 0042, 0043, 0044

## Motivation

1. Endpoints such as OpenRouter list hundreds of models; a plain list with no search or filter was unusable on a phone.
2. Listings declare what models can do (tools, reasoning, vision, context length, provider; kept by 0044), and the picker could use them to narrow the list.
3. Fetching every listing each time the picker opened was slow, and a long list was janky to scroll.
4. With several endpoints, choosing first an endpoint and then a model split one decision across two places; an "active" endpoint with its own default model no longer fitted once one list showed every endpoint's models.
5. An endpoint that is offline or unwanted had to be deleted to keep it out of the picker.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[Architecture § Testing](../specs/architecture/index.md#testing)). CI enforces these as merge gates.

### Functional requirements

- The picker lists the models of every enabled endpoint at once; each row names its endpoint when there are several, and choosing a model binds the conversation to that endpoint. An endpoint whose listing fails does not hide the others: it is named with a retry and a Disable action.
- Search matches every term against the model id or name. The search field expands while focused.
- Capability shortcut icons (tools, reasoning, vision) appear only when some model declares that capability. A filters panel shows every filter in effect (capability shortcuts mirrored, providers as a multi-select, endpoints as a multi-select with all selected by default, favourites only) with its match count. The favourites filter lives only in the panel.
- Typing an unlisted model id stays available, collapsed while there is a list to pick from.
- Listings are cached per endpoint, keyed by its URL and a hash of its key (never the key itself), shown at once from the cache, fetched again when older than a day, and refreshable from the picker and from each endpoint's row in settings. Only the rows in view are drawn.
- Models can be starred per endpoint (`Settings.favorites`); starred models list first.
- An endpoint can be disabled from its editor or from the picker's listing-error notice, and enabled again from the endpoint list (`Profile.disabled`). A disabled endpoint is left out of the picker and never used for new chats or the assistant; chats already on it keep working.
- `Settings.defaultModel` (`{ profileId, model }`) is what new chats start on. Without one, or with its endpoint deleted or disabled, a new chat opens on the picker and the first model chosen becomes the default (`AppStore.chooseModel`). Endpoints lose their model field and checkmark; "Load models" in the editor becomes a connection test.
- Stored settings migrate (`migrate`): the active endpoint and its model become the default model, and an assistant choice naming only an endpoint gets that endpoint's old model.
- The assistant's model is chosen in a sheet that closes after a pick. "Same as new chats" is shown when the assistant's model equals the default model; choosing the new-chat model stores no separate choice, so the assistant keeps following new chats.

## Design

### Decisions

- **Picker logic stays in the app.** Search, capability and provider filtering (`apps/mobile/src/components/model-filter.ts`), caching, favourites and the default model live in `apps/mobile`. The packages supply only the generic `ModelInfo` listing from `@fx/chat-agent` (0039, 0044), consumed through its public export; no package changes in this slice.
- **Filters are shown where they apply.** Every filter in effect is visible in the panel, so the match count is always explained by what the panel shows; the shortcut icons are a mirror of panel state, not a separate filter.
- **A default model, not a default endpoint.** One list across endpoints makes the model the unit of choice; the endpoint follows from it.
- **"Same as new chats" is derived.** It is model equality with the default model rather than a stored flag, so the two cannot disagree.
- **Disabling is reversible and non-destructive.** It hides an endpoint from new work without breaking conversations bound to it.

### Non-Goals

Server-side (gateway) model metadata; model listing changes in `@fx/chat-agent` (0044 owns those); saying when a picked image cannot be read (0046).

## Tasks

- [x] Searchable picker; capability filter icons; filters panel with providers multi-select, endpoints, favourites and mirrored shortcuts
- [x] Assistant model in a sheet; "Same as new chats" tied to model equality
- [x] Cached, refreshable listings (picker and settings rows); windowed list; search expands while focused
- [x] Model favourites, filter only in the panel
- [x] One model list across every enabled endpoint
- [x] Disable endpoints (editor, listing-error notice, endpoint list)
- [x] Default model replaces the default endpoint; settings migration
- [x] Tests (model-filter, ModelPicker, store, app); mobile-app spec and indexes
