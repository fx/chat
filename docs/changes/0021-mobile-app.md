# 0021: Mobile App

## Summary

Build the Android reference app in `apps/mobile`: a Vite + React web UI wrapped by Tauri v2, using
`@fx/chat` for rendering, `@fx/chat-agent` for runs, and app-local storage, settings, tools and theme.

**Spec:** [mobile-app](../specs/mobile-app/)
**Status:** complete
**Depends On:** 0019, 0020

## Motivation

The library needs a full-featured, real-device consumer to validate its injection API and to show
adopters how to build a product on it. Mobile is the first target.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[Architecture § Testing](../specs/architecture/index.md#testing)), applied to the app:

- Vitest + `@testing-library/react` for app logic (stores, tool implementations, agent wiring,
  approval queue, screens' key flows), with `fetch` and storage faked — no network.
- Fake timers for anything time-based; no `.only` / `.skip`.
- The app is NOT included in the library's 100% coverage gate (it is not published source); its
  tests MUST run in CI with the rest of the suite.
- CI MUST build the web UI on every PR. The Android APK build is a separate job (heavy toolchain) run
  on pushes to the default branch and on demand.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not in the
rule.

### Functional requirements

The [mobile-app spec](../specs/mobile-app/) owns every user-facing behavior and its scenarios; they
are this change's acceptance criteria. What implementing them requires of this change:

- The architecture spec's layout gains `apps/` for applications (alongside `demos/`).
- The no-internal-references check MUST scan `apps/` too.
- The generated Android project is committed; build outputs and signing material are not.

## Design

### Approach

- Vite + React 19 + Tailwind v4 web UI; the app's chat registry and `classNames` theme are written in
  the app (shadcn-style primitives, `lucide-react` icons, `react-markdown` + GFM for markdown).
- Platform adapters: `fetch` → Tauri HTTP plugin on device, `window.fetch` in the browser; storage →
  IndexedDB (works identically in the Android webview and a browser); back button → Tauri app API on
  device, no-op in the browser; insets → CSS `env()` with a JS fallback.
- State: a small store (React context + reducer) with debounced persistence; the active run's message
  is written through on every snapshot, throttled.
- Tauri: `tauri-plugin-http` with an allow-all-URLs capability (the user chooses endpoints at run
  time); cleartext traffic allowed so LAN model servers work.

### Decisions

- **IndexedDB for conversations and settings** instead of a Tauri store or SQLite plugin.
  - **Why**: one implementation for device and browser; the webview's storage is app-private.
  - **Alternatives considered**: `plugin-store` (fine for settings, awkward for many conversations),
    `plugin-sql` (migrations, more native surface for no current need).
- **API key in app-private storage**, masked in UI.
  - **Why**: no mature keystore plugin exists; app storage is sandboxed per app on Android.
- **Tailwind + app-local registry**, not `@fx/ui`.
  - **Why**: `@fx/ui` is on a restricted registry; the reference app must build for anyone.
- **Approval queue** in the app: the agent's approval callback enqueues a prompt rendered as a sheet
  above the composer.

### Non-Goals

- Desktop and iOS builds, push notifications, sync across devices, MCP, voice, release signing and
  store publishing.

## Tasks

- [x] Scaffold `apps/mobile` (Vite, React, Tailwind, tests), wire workspace scripts, CI web build,
      internal-refs scan
- [x] Platform adapters and IndexedDB store (profiles, settings, conversations)
- [x] Chat registry + `classNames` theme + markdown slot
- [x] Screens: setup/settings (profiles, model picker, system prompt, tools), conversation list,
      conversation (streaming, stop, retry, copy, regenerate, attachments)
- [x] Agent wiring: built-in tools, approval sheet, run persistence
- [x] Tauri v2 shell: init, HTTP plugin + capability, cleartext, back button, insets; debug APK build
      script and CI job
- [x] On-device verification (Android 15 emulator, debug APK): first-launch setup and model listing
      over cleartext HTTP to a LAN endpoint, streaming, stop, calculator and approved fetch tool calls,
      keyboard insets (composer stays above the IME), back navigation (keyboard → list → exit),
      persistence across restart, inline error with retry, dark mode, 44 px touch targets
- [x] Docs: spec changelog, architecture layout, indexes

## Open Questions

- [ ] On the emulator, the first ~500 ms of every streamed response arrives as one burst for both the
      webview's own fetch and the native HTTP plugin (the host sees the server's 40 ms cadence), so
      very short reasoning reads "0.0s". Attributed to the emulator's network path; confirm on a
      physical device.

- [ ] Application id / display name for the store listing — current placeholder `dev.fx.chat`,
      "fx chat".

## References

- Spec: [mobile-app](../specs/mobile-app/)
- Related changes: [0019-core-extraction](./0019-core-extraction.md),
  [0020-agent-runtime](./0020-agent-runtime.md)
