# Mobile App

## Overview

`apps/mobile` is the full-featured reference application for `@fx/chat`: an Android app (Tauri v2
wrapping a web UI) for agent-style conversations with any OpenAI-compatible endpoint. It proves that
the library's injected, unstyled renderers are enough to build a polished product, and it carries the
product features a real app needs (settings, persistence, conversation management, tools) that do NOT
belong in the library. It is fully client-side: no backend of ours exists.

## Background

The library is a primitive, not a product (see [architecture](../architecture/)). A reference app is
where product concerns live and where the library's API is exercised end to end on a real device. It
is the first consumer of [chat-agent](../chat-agent/). Mobile is the first target; desktop builds of
the same app are a later concern.

Library boundary rule: a capability moves from the app into a package only when it is generic chat
behavior and a second consumer needs it. Everything app-specific (storage, settings, navigation, the
visual theme) stays in `apps/mobile`.

## Requirements

### Platform and Build

- The app MUST build to an installable Android APK (min SDK 24) with one repository command, and its
  web UI MUST also run in a desktop browser for development.
- The web UI MUST consume the libraries only through their public package names.
- The app MUST NOT be published to npm and MUST NOT be part of the library's coverage gate; it has its
  own tests.

### Endpoint Settings

- The user MUST be able to configure one or more endpoint profiles, each with a name, base URL,
  OPTIONAL API key, and default model, and choose the active profile.
- The app MUST offer the endpoint's model list for selection, and MUST allow typing a model id when
  listing fails or the endpoint does not support listing.
- The model picker MUST be searchable (every term, in the id or name) and SHOULD filter by provider
  and by the capabilities models declare in the listing (tools, reasoning, vision), offering a
  filter only when some model declares it. Typing an unlisted id MUST stay available, collapsed
  while there is a list to pick from.
- The API key MUST be stored only on the device, MUST be masked in the UI after entry, MUST NOT be
  written to logs, and MUST be sent only to its own profile's base URL.
- Requests MUST bypass browser CORS restrictions on device, and plain-HTTP endpoints on the local
  network (e.g. a self-hosted model server) MUST be reachable.

#### Scenario: First launch

- **GIVEN** a fresh install with no profiles
- **WHEN** the app opens
- **THEN** it shows endpoint setup instead of an empty chat, and after saving a valid profile the user
  lands in a new conversation.

#### Scenario: Listing unsupported

- **GIVEN** a profile whose endpoint returns an error for the model listing
- **WHEN** the user opens the model picker
- **THEN** the error is shown and a free-text model field is available.

### Conversations

- Conversations MUST persist on the device across app restarts, including partially streamed
  messages that were stopped.
- The user MUST be able to create, open, rename, and delete conversations; the list MUST be ordered by
  last activity. A new conversation MUST get an automatic title from its first user message.
- Each conversation MUST remember the profile and model it uses; the user MUST be able to change the
  model for the next turn.
- A conversation's transcript MUST only be sent to the endpoint of the profile it is bound to. When
  that profile no longer exists, sending, regenerating and retrying MUST be withheld and the
  conversation MUST say its profile is unavailable, until the user explicitly binds it to another
  profile; the app MUST NOT fall back to the active profile.
- An OPTIONAL per-app system prompt MUST be applied to every new turn.

### Agent Chat

- Sending a message MUST start an agent run (see [chat-agent](../chat-agent/)) and render it live
  through `@fx/chat`: streaming text, reasoning with live timer, tool calls with status, and the
  footer metrics once finished.
- While a run is active, the send control MUST become a stop control that aborts it; the partial turn
  MUST be kept.
- A failed run MUST show the error inline in the conversation with a retry action; the partial turn
  MUST be kept.
- The user MUST be able to copy a message and regenerate the last assistant turn.
- The user SHOULD be able to attach images from the device to a message; they MUST be sent to the
  endpoint as image inputs.

#### Scenario: Stop mid-stream

- **GIVEN** an assistant turn that is streaming text
- **WHEN** the user taps stop
- **THEN** streaming ends within one frame of the abort, the text so far stays visible, and the
  composer is ready for the next message.

### Tools

- The app MUST ship a small set of built-in tools and let the user enable or disable each one:
  current date/time, an arithmetic calculator, and an HTTP GET fetcher of web pages as text.
- Tools that reach the network MUST require per-call approval by default; the approval prompt MUST
  show the tool name and its arguments, and MUST offer allow and deny.
- Denials and tool errors MUST be visible on the tool call and returned to the model.

#### Scenario: Approve a fetch

- **GIVEN** the fetch tool is enabled and requires approval
- **WHEN** the model calls it with a URL
- **THEN** an approval prompt shows the URL; allowing runs the fetch and the tool call shows its
  result; denying marks the call declined and the model continues.

### Mobile Experience

- The composer MUST stay visible above the on-screen keyboard, and content MUST NOT be drawn under the
  status bar, navigation bar, or display cutout.
- The transcript MUST follow new output while the user is at the bottom and MUST NOT jump while the
  user has scrolled up.
- The Android back action MUST navigate from a conversation to the list, and from the list exit the
  app.
- The app MUST follow the system light/dark preference.
- All touch targets MUST be at least 44×44 CSS px.

### Digital Assistant

- The app MUST be selectable as the Android digital assistant app (it handles `ACTION_ASSIST`).
- Invoked as the assistant, it MUST listen for one spoken prompt with the system speech recognizer
  and start a new conversation with it; a cancelled or empty recognition MUST just open the app.
- A spoken prompt that cannot start a conversation MUST be shown to the user with the error, not
  dropped.
- The assistant MUST run on the endpoint and model chosen in its settings, or on the active
  endpoint and its model when none is chosen or the chosen endpoint was deleted.
- Its settings MUST say whether the app is the digital assistant and open the system picker.

### Settings Menu

- Settings MUST be a menu of sub-pages (endpoints, system prompt, tools, assistant, about), each
  row summarizing its current value; the back action MUST go up one level.

#### Scenario: Ask by long-pressing power

- **GIVEN** the app is the digital assistant and a profile is set up
- **WHEN** the user long-presses power and says "what time is it"
- **THEN** a new conversation opens with that prompt sent

### Styling Through Injection

- The app's entire look MUST be supplied through the library's injection seams (component registry,
  icons, markdown slot, `classNames`); the app MUST NOT patch, fork, or override library internals or
  rely on undocumented DOM structure beyond the stable `.chat-*` hooks.

## Design

### Architecture

```
apps/mobile
├── src/            React + Vite web UI
│   ├── platform/   fetch / back-button / insets adapters (Tauri on device, browser in dev)
│   ├── store/      settings + endpoint wiring around @fx/chat-agent's ChatController
│   ├── agent/      wiring to @fx/chat-agent, built-in tools, approval queue
│   ├── chat/       registry + classNames theme injected into @fx/chat
│   └── screens/    conversation list, conversation, settings
└── src-tauri/      Tauri v2 shell (Rust), Android project under gen/android
```

Platform adapters isolate every Tauri API so the same UI runs in a desktop browser.

## Constraints

- No analytics, crash reporting, or any outbound request other than the user's endpoint and tools the
  user enabled.
- Rendering an answer MUST NOT make any network request. Remote images in answers MUST NOT be loaded;
  each MUST be shown as a link to the image instead (inline `data:` images MAY be drawn). Raw HTML in
  answers MUST NOT be rendered. Links MUST open only when the user taps them.
- The app ships no endpoint defaults that point at a real service.

## Open Questions

- **API-key storage hardening.** Tauri has no mature first-party keystore plugin. Current default: keep
  the key in app-private storage (sandboxed per app); revisit with a keystore-backed plugin.
- **Desktop and iOS.** Current default: Android only; the platform adapters keep other targets open.

## References

- [architecture](../architecture/), [chat-agent](../chat-agent/), [chat-core](../chat-core/),
  [component-registry](../component-registry/), [message-rendering](../message-rendering/)
- Tauri v2 Android and HTTP plugin documentation.

## Changelog

| Date | Change | Document |
|------|--------|----------|
| 2026-10-10 | Initial spec created | [0021-mobile-app](../../changes/0021-mobile-app.md) |
| 2026-10-11 | The app's shadcn registry, `classNames` theme, markdown slot and design tokens move into `@fx/chat-shadcn` (touch mode) | [0036-shadcn-package](../../changes/0036-shadcn-package.md) |
| 2026-10-11 | App store built on `ChatController`; IndexedDB store moved into `@fx/chat-agent` | [0037-chat-controller](../../changes/0037-chat-controller.md) |
| 2026-10-11 | Digital assistant | [0043-digital-assistant](../../changes/0043-digital-assistant.md) |
| 2026-10-12 | Settings sub-menus; assistant model | [0043-digital-assistant](../../changes/0043-digital-assistant.md) |
| 2026-10-12 | Model picker search and filters | — |
