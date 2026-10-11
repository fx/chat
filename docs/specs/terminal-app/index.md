# Terminal App

## Overview

`apps/tui` is the terminal reference application for `@fx/chat`: an agent chat that runs as a
plugin of the `tx` command-line toolbox (`tx chat`). It renders with `@fx/chat-ink`, runs turns with
`@fx/chat-agent` against any OpenAI-compatible endpoint, and takes its settings storage, theme and
setup dialogs from tx's capabilities. Like the mobile app, it is product code that carries features
the libraries deliberately do not.

## Background

tx loads plugins from marketplaces: a repository (or local directory) whose `.tx/config.json`
manifest names each plugin's entry module. This repository is such a marketplace with one plugin,
`chat`, so `tx marketplace add <this repo> --name chat` makes `tx chat` available. A local directory
is a live reference — edits apply on the next run.

Related: [ink-renderer](../ink-renderer/), [chat-agent](../chat-agent/),
[mobile-app](../mobile-app/) (the same agent features on Android).

## Requirements

### Plugin

- The repository root MUST carry a tx marketplace manifest declaring the `chat` plugin, whose entry
  is `apps/tui/index.ts`.
- The manifest MUST declare the tx releases the plugin supports (`^2.0.0`), so a tx outside
  that range refuses it with a diagnostic instead of loading it.
- The plugin MUST register exactly the `tx chat` namespace, MUST write only through the streams tx
  provides, and MUST report failures by throwing rather than exiting the process.
- The plugin MUST read tx's config and theme capabilities inside its command action and fail with a
  message naming the capability when exactly one is not available.

### Settings

- Endpoint settings (base URL, OPTIONAL API key, model, OPTIONAL system prompt, enabled tools) MUST
  resolve from command-line flags, then `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL`, then
  the profile stored in tx's per-user config document under the `chat` key.
- When no usable endpoint resolves, or `--setup` is given, the app MUST run setup through tx's
  dialogs (base URL, key, then a model from the endpoint's list or typed by hand) and store the
  result; without a terminal it MUST fail with instructions instead.
- Settings changed in a session (model, system prompt, tools) MUST be stored; an API key that came
  only from a flag or the environment MUST NOT be written to the config document.

#### Scenario: Key from the environment stays off disk

- **GIVEN** no stored profile and `OPENAI_API_KEY` set
- **WHEN** the user switches model with `/model`
- **THEN** the stored profile holds the base URL and new model, and no API key.

#### Scenario: Setup does not store a key from a flag or the environment

- **GIVEN** `OPENAI_API_KEY` set (or `--api-key` given)
- **WHEN** the user runs `tx chat --setup` and leaves the key field empty
- **THEN** the field was not pre-filled with that key, the session uses it, and the stored profile
  keeps only a key already stored or typed in setup.

### Fullscreen and Inline Modes

- `tx chat` MUST run **fullscreen** by default: it takes the alternate screen and shows the scrolling
  viewport (threaded frame), a status line, pending rows and the composer (plain variant), and
  restores the screen on exit. `--inline` MUST run the scrollback mode (finished messages printed
  into scrollback, the live turn redrawn).
- In fullscreen: the transcript follows new output unless the user scrolled up (PgUp/PgDn,
  Shift+↑/↓, the wheel); Ctrl+T cycles detail; messages typed while an answer streams are queued and
  sent in order when it finishes (shown as pending rows); Esc closes details, then clears the input,
  then takes the last queued message back into the input, then stops the turn; Ctrl+R retries a
  failed or stopped answer;
  mouse drag copies through the terminal clipboard and a notice confirms it; images in answers draw
  on kitty-protocol terminals, data URLs automatically and others on click.
- The empty state names the model and endpoint and the key hints.

### Chat

- The app MUST stream agent turns live (reasoning, tool calls, text, footer metrics) through
  `@fx/chat-ink`, with tx's theme mapped onto the renderer's theme roles. Fullscreen uses the
  package's terminal markdown line layout; the inline mode injects its own element markdown.
- Tools that require approval MUST prompt inline with the tool name and arguments; `y`/Enter allows
  and `n`/Esc denies.
- Esc (inline; in fullscreen after its other layers) and the first Ctrl+C MUST stop a running turn
  and keep the partial answer; Ctrl+C when idle, or again while a stopped turn winds down, MUST
  exit. Ctrl+C works while an approval is shown: the turn stops and the call is not declined.
- `/retry` and `/new` MUST NOT run while an answer is running (a notice says to stop it first).
- Ctrl+O MUST toggle reasoning/tool details for the live turn.
- Slash commands MUST be offered through completion: `/model <id>` (with the endpoint's models as
  completions), `/system <text>`, `/tools [name]`, `/expand`, `/retry`, `/new`, `/setup`, `/help`,
  `/quit`.
- A failed or stopped turn is shown through the message outcome (error row, `stopped` footer fact)
  with a `/retry` (and in fullscreen `^R`) hint; the partial answer is kept.

#### Scenario: Approve a fetch

- **GIVEN** the fetch tool is enabled
- **WHEN** the model calls it
- **THEN** an inline prompt shows the URL; `y` runs the fetch and the turn continues; `n` records a
  declined call that the model sees.

## Design

### Architecture

```
.tx/config.json            marketplace manifest → apps/tui/index.ts
apps/tui/
├── index.ts               plugin entry: `tx chat` command, capability lookup
└── src/
    ├── start.tsx          settings resolution, setup loop, render (fullscreen or --inline)
    ├── setup.ts           tx dialogs: base URL, key, model
    ├── settings.ts        flags > env > stored profile; validator
    ├── theme.ts           tx appearances → @fx/chat-ink theme roles
    ├── markdown.tsx       marked → Ink (the inline mode's markdown slot)
    ├── commands.ts        slash commands as completion providers
    ├── session.ts         the session: settings, turns, approvals, commands, queue
    ├── Fullscreen.tsx     viewport, status line, pending rows, plain composer, keys
    └── App.tsx            the inline view: transcript, composer, approvals, keys
```

Streaming updates are applied to the transcript at most once per frame (about 30 a second); the
newest state of each message wins. Fullscreen renders incrementally (only changed rows are
rewritten). Ink measures every visible row on every frame, so its speed on Bun depends on the host's
`string-width` (the package's emoji check is pathologically slow on Bun) and on the host building
React for production; both belong to tx, whose React and Ink the plugin renders with.

The plugin renders with the React and Ink tx hands it (`api.dependencies`), binding `@fx/chat-ink`
to them before anything renders; it ships no copy of either. It needs Ink 8, which tx provides from
2.0: the manifest admits only tx 2, and should an older tx load the plugin anyway, the command
fails with a message naming the version it needs. This repository pins the released tx 2.0.0 in
`mise.toml` (`github:fx/tx`).

## Constraints

- No outbound request other than the configured endpoint, pages the fetch tool loads with approval,
  and images the user clicked to show.
- Conversations are not persisted; they last for the session.
- Model-controlled text the app draws itself (the approval prompt's arguments, its markdown) MUST go
  through the same terminal-control sanitization as `@fx/chat-ink`'s own rendering, so content
  cannot drive the terminal.

## Open Questions

- **Conversation persistence / resume.** Current default: session-only.
- **Read-only playback** of a recorded conversation. The viewport supports it; no command exposes it
  yet.
- **Local tools for a terminal agent** (files, shell). Current default: out of scope; the built-in
  tools are the same as on mobile.

## References

- [ink-renderer](../ink-renderer/), [chat-agent](../chat-agent/), [mobile-app](../mobile-app/)

## Changelog

| Date | Change | Document |
|------|--------|----------|
| 2026-10-10 | Initial spec created | [0022-ink-renderer](../../changes/0022-ink-renderer.md) |
| 2026-10-10 | Fullscreen mode (viewport, status line, queue, mouse copy, images) by default; `--inline` | [0032-tui-fullscreen](../../changes/0032-tui-fullscreen.md) |
