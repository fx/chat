# 0043: Digital Assistant

## Summary

Make the Android app selectable as the device's digital assistant: invoked that way it listens for one spoken prompt and starts a new chat with it. Settings become a menu of sub-pages (Endpoints, System prompt, Tools, Assistant, About) that the Android back action walks up one level at a time, and the new Assistant page shows whether the app holds the assistant role, opens the system picker and chooses the endpoint and model spoken prompts run on.

**Spec:** [mobile-app](../specs/mobile-app/)
**Status:** complete
**Depends On:** 0021, 0037, 0038

## Motivation

1. A chat app on a phone is most useful one gesture away. Android lets any app that handles `ACTION_ASSIST` be the "Digital assistant app" (long-press power, corner swipe); the app did not handle it, so it could not be chosen.
2. Settings was one long scrolling page; adding assistant settings made it longer still, and Android back left settings entirely instead of going up a level.
3. A spoken prompt may want a different (faster, cheaper) model than the one new chats use.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[Architecture § Testing](../specs/architecture/index.md#testing)). CI enforces these as merge gates.

### Functional requirements

- The Android manifest gives `MainActivity` an intent filter for `android.intent.action.ASSIST` and `android.intent.action.VOICE_COMMAND`.
- Started (or re-delivered via `onNewIntent`) with either action, `MainActivity` runs the system speech recognizer (`RecognizerIntent.ACTION_RECOGNIZE_SPEECH`, free form) once; a non-empty result is parked and the web app is told through a `fx-assist` window event. A cancelled or empty recognition, or no recognizer, just opens the app.
- `MainActivity` installs a `window.FxAssist` JavascriptInterface with `takePrompt()` (the parked prompt, once), `isAssistant()` (`RoleManager.ROLE_ASSISTANT` held; false before Android 10) and `openAssistantSettings()` (voice-input settings, falling back to system settings).
- The platform layer exposes `onAssistPrompt(handler)` (takes a prompt parked before it listened, then one per `fx-assist`), `isAssistant()` (undefined outside the Android shell) and `openAssistantSettings()`; all are no-ops without the bridge.
- Once settings are loaded and an endpoint exists, each assist prompt creates a conversation with `createAssistantConversation()`, opens it and sends the prompt. When that fails (a storage error, say), a notice shows the prompt and the error instead of dropping it; each failed prompt gets its own notice, kept until dismissed.
- `Settings.assistant` (`{ profileId?, model? }`, default `{}`) chooses the assistant's endpoint and model. `AppStore.assistantModel()` resolves it: the bound endpoint with the chosen model (or that endpoint's model), else the active endpoint and its model. Deleting the bound endpoint resets it to `{}`. `load()` does not validate it: stored settings without it load with the default, and a stored binding to an endpoint that no longer exists is kept but resolves like an unset one (the active endpoint and its model; the Assistant page shows "same as new chats").
- Settings is routed by a `SettingsPath` (`[]` menu, `[page]`, `['endpoints', id]`); `parentRoute` / `parentPath` make the back action go up one level, and from the menu to the conversation list. Each menu row summarizes its page's value.
- The Assistant page shows the role status with a button to the system picker (only in the Android shell), a "same as new chats" choice and a model picker. A `ModelPicker` component is shared by the conversation model sheet and the Assistant page.

## Design

### Decisions

- **The bridge stays in the app.** The Kotlin activity and the `window.FxAssist` adapter live in `apps/mobile`; no package learns about Android, speech or the assistant role.
- **Park, then signal.** The recognizer result can arrive before the web view has loaded (a cold start). The activity holds the prompt and fires `fx-assist`; the web app takes it when it starts listening and on every event, so a prompt is never lost and never delivered twice.
- **The assistant falls back to new-chat behaviour.** Unset, or bound to an endpoint since deleted, the assistant uses the active endpoint and its model, so it always works once any endpoint exists.
- **Failures are shown, not dropped.** The bridge ignores the prompt handler's result, so the app catches it and raises an app-level notice; the Assistant page shows an inline error when its setting cannot be saved (it still applies until the next launch).
- **Settings pages are part of the route.** The page shown lives in the app `Route`, so Android's back handler and the header's back button share one parent function.

### Non-Goals

Hotword activation (the system reserves it); speaking replies aloud; the later model picker with search, favourites and a default model (0045).

## Tasks

- [x] Android: `ASSIST` / `VOICE_COMMAND` intent filter; speech recognition; `FxAssist` bridge (`takePrompt`, `isAssistant`, `openAssistantSettings`)
- [x] Platform: `onAssistPrompt`, `isAssistant`, `openAssistantSettings`
- [x] App: assist prompts start a new chat; settings routed with back going up a level
- [x] Store: `assistant` settings, `assistantModel`, `createAssistantConversation`, reset on endpoint deletion
- [x] Settings sub-menus and Assistant page; shared `ModelPicker`
- [x] Review fixes: notice for an assist prompt that could not start a chat; Assistant page save error; stale assistant binding documented and tested
- [x] Tests (platform, store, app); mobile-app spec and indexes
