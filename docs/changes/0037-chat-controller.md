# 0037: Chat Controller

## Summary

Add `ChatController` to `@fx/chat-agent`: a shared, UI-free conversation controller that owns conversations, lazily loaded transcripts, runs, run errors, the tool-approval queue and messages queued while a run streams, persisted through an injected key-value store. The mobile app's store and `tx chat` sessions now run on it instead of each carrying its own copy of those mechanics.

**Spec:** [chat-agent](../specs/chat-agent/), [mobile-app](../specs/mobile-app/), [terminal-app](../specs/terminal-app/)
**Status:** complete
**Depends On:** 0020, 0021, 0032

## Motivation

The mobile app and the terminal app each implemented the same conversation mechanics around `runAgent`: starting and stopping runs, applying streamed updates, the approval queue, recording run errors and (in the terminal) queueing messages typed while a run streams. The two copies drifted, and a third host would have needed a third. The mechanics are generic chat behavior with two consumers, so by the library boundary rule they belong in a package; endpoints, models, tool settings and visuals stay with each app.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[Architecture § Testing](../specs/architecture/index.md#testing)). CI enforces these as merge gates.

### Functional requirements

The specs own the behavior. This change owns:

- `@fx/chat-agent` exports `ChatController<M extends ConversationMeta>` (framework-free `subscribe` / `getState`) with `load`, `openConversation`, `createConversation`, `updateConversation`, `deleteConversation`, `clear`, `flush`, `send`, `regenerate`, `stop`, `unqueue` and `dispose`, plus the `newId` and `titleFrom` helpers and the `ConversationMeta`, `RunConfig`, `RunResolution`, `ControllerOptions`, `ControllerState`, `ActiveRun`, `RunError`, `PendingApproval` and `QueuedMessage` types.
- Runs are configured per conversation by the host's `resolveRun(meta)`, which returns a `RunConfig` or `{ blocked }` (surfaced as the conversation's run error).
- Options: `kv` (persistence), `fetch`, `htmlToText`, `now`, `newId`, `run` (injectable `runAgent`), `saveDelayMs` (debounced transcript writes), `updateIntervalMs` (throttled stream updates, flushed before an approval and at run end) and `queue` (queue messages sent during a run, sent in order when it ends).
- `send` and `regenerate` start their run synchronously once the transcript is loaded, so the user message and the run are in state as soon as the call returns.
- `KeyValueStore` with `memoryStore()` and a lazily opened `indexedDbStore(name?)` moves from the mobile app into `@fx/chat-agent`; tool calls left running by a killed app are marked failed when a transcript loads.
- The mobile app store keeps settings, endpoints and model resolution and delegates conversations, transcripts, runs and approvals to a controller backed by `indexedDbStore`.
- `tx chat`'s `useChatSession` keeps settings, slash commands and notices and drives one in-memory controller conversation (frame-throttled updates, message queue); Ctrl+C, Esc, `/retry` and `/new` keep their semantics, and a run that cannot start still surfaces as a notice.

## Design

### Decisions

- **The controller is framework-free.** `subscribe` / `getState` fit React's `useSyncExternalStore` and an Ink app alike, and keep `@fx/chat-agent` free of React.
- **Endpoints stay app-owned.** The controller never stores settings; it asks the host per run. Each app keeps its own endpoint model (mobile profiles, terminal flags/env/stored profile) and its own UI for a blocked run.
- **Persistence is injected.** The host passes a `KeyValueStore`; the IndexedDB adapter opens its database on first use, so importing the package never touches `indexedDB` and a terminal host uses the in-memory store. This is the one platform API the package touches, and only at the host's choice; the chat-agent spec's package boundary records the exception.
- **Conversation metadata is generic.** Hosts extend `ConversationMeta` with their own fields (the mobile app binds a conversation to an endpoint and model) rather than the controller knowing about them.
- **Throttling and queueing are options.** They generalise the terminal app's frame-rate updates and message queue; the mobile app applies every update and drops messages sent during a run, as before.
- **Runs start synchronously.** Waiting on storage before recording the run let a second `send` race a starting run. With the transcript loaded, the user message and the run are recorded before `send` / `regenerate` return; the agent itself starts once the conversation list is stored, unless the run was stopped or the conversation deleted meanwhile. A conversation deleted while its transcript loads is not run.

### Non-Goals

Changes to either app's look, settings or model selection; server-side conversation storage; sharing conversations between hosts.

## Tasks

- [x] `@fx/chat-agent`: `ChatController`, `KeyValueStore` with memory and IndexedDB stores, public exports, tests (100% coverage)
- [x] Mobile: build the app store on `ChatController`; drop the app's storage adapter
- [x] `@fx/chat-agent`: start `send` / `regenerate` runs synchronously
- [x] `tx chat`: run sessions on `ChatController`
- [x] Specs (chat-agent, mobile-app, terminal-app) and indexes
