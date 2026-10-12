# `tx chat`

Agent chat in the terminal, as a plugin for the [tx](https://github.com/fx/tx) toolbox. It renders
with `@fx-/chat-ink`, runs turns with `@fx-/chat-agent` against any OpenAI-compatible endpoint, and
uses tx for settings storage, the theme, and setup dialogs. See the
[terminal-app spec](../../docs/specs/terminal-app/index.md).

## Install

This repository is a tx marketplace (`.tx/config.json` at the root declares the `chat` plugin):

```sh
mise run tui:install   # builds the @fx-/chat-* packages, adds this marketplace
tx chat
```

`tui:install` runs `bun run build` (the plugin imports the built `@fx-/chat-*` packages) and
`tx marketplace add "$PWD" --name chat`, a live reference: edits apply on the next run (rebuild
the packages after changing them). `mise install` installs the released tx 2.0.0 that
`mise.toml` pins; the manifest declares support for tx `^2.0.0` (the plugin needs tx 2's Ink 8).

## Use

```sh
tx chat                                  # first run asks for the endpoint and model
tx chat --setup                          # change the stored endpoint
tx chat -m some-model --system "Be terse."
OPENAI_BASE_URL=http://localhost:11434/v1 OPENAI_MODEL=llama3 tx chat
```

Flags win over `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL`, which win over the stored
profile (tx's config document, key `chat`). A key given only by flag or environment is never written
to disk.

`tx chat` takes the full screen (alternate screen, restored on exit); `tx chat --inline` prints
into the terminal's scrollback instead.

| Key | Fullscreen | Inline |
|---|---|---|
| Enter | send; while an answer streams, queue (Tab completes; Enter picks a completion after ↑/↓) | send |
| Alt+Enter, Ctrl+J, `\` + Enter | newline | newline |
| Esc | close details, clear the input, take back the last queued message, else stop | stop |
| Ctrl+C | stop the running turn; quit when idle | same |
| Ctrl+T / Ctrl+O | cycle detail / toggle details | — / toggle details |
| Ctrl+R | retry a failed or stopped answer | (`/retry`) |
| PgUp/PgDn, Shift+↑/↓, wheel | scroll the transcript | terminal scrollback |
| Mouse drag | copy (OSC 52); Shift+drag keeps the terminal's own selection | terminal |
| ↑ / ↓ | move between rows, then through history | same |

On kitty-protocol terminals (kitty, Ghostty; not inside tmux/screen) images in answers draw inline:
`data:` URLs at once, other URLs after a click.

Commands: `/model <id>` (models complete from the endpoint), `/system <text>`, `/tools [name]`,
`/expand`, `/retry`, `/new`, `/setup`, `/help`, `/quit`.

For a local mock endpoint: `bun apps/mobile/scripts/mock-openai.ts 8787`, then
`OPENAI_BASE_URL=http://localhost:8787/v1 OPENAI_MODEL=mock-1 tx chat`.
