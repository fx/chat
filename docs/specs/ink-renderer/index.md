# Ink Renderer

## Overview

`@fx/chat-ink` renders `@fx/chat-core` conversations in a terminal with Ink, with the same injection
philosophy as `@fx/chat`: it ships behavior and structure, and the host injects the look (colors,
glyphs, markdown-to-ANSI). It targets the same full agent-style interactions — streaming text,
reasoning with live timers, tool calls with status — and an input composer with completion.

It serves two kinds of host: an **inline CLI** that prints finished messages into terminal scrollback
and keeps only the live turn on screen, and a **fullscreen host** that owns a fixed region of the
screen, scrolls it, switches conversations and reopens old chats. A fullscreen host supplies data,
the keys it wants first, a theme, glyphs and policies — and ships no chat rendering, styling or
input code of its own.

Supplementary documents (normative, same ownership rules):

- [Line layout and viewport](./layout.md) — the line model, message frames, block layouts, detail
  levels, the scrolling viewport, status line, pending rows, empty state, performance.
- [Terminal markdown](./markdown.md) — the markdown layout slot and its default.
- [Composer](./composer.md) — the fullscreen composer: controlled state, layout, keys, routing.
- [Mouse](./mouse.md) — scrolling, selection, copy and click targets.
- [Images](./images.md) — the image-provider contract and the opt-in kitty provider.


## Background

Terminals differ from the DOM in ways that make sharing component trees a trap: output that has
scrolled off cannot be re-rendered, there is no hover or pointer, disclosure needs focus and keys,
and input is keypress-driven. The shared behavior therefore comes from [chat-core](../chat-core/)
(grouping, summaries, timers, metrics, completion providers), and this package is a terminal
projection of it.

## Requirements

### Package Boundary

- The package MUST be named `@fx/chat-ink`, live at `packages/ink/`, ship ESM + `.d.ts`, run on
  Node 22+, and peer-depend on Ink 8 and React 19.3 or newer (Ink 8's own requirement).
- It MUST depend on `@fx/chat-core` for all transcript logic and MUST NOT import `@fx/chat` or
  `react-dom`.
- The package MUST NOT load React, Ink or a JSX runtime of its own: the host hands in its instances
  with `createChatInk({ React, ink })` before anything renders, and the package renders with those
  (a plugin host such as tx gives every plugin its own, and a tree takes one instance of each). The
  core hooks it uses come from `@fx/chat-core/hooks` bound to the same React. One process binds
  once; binding again with other instances MUST fail, and using the package unbound MUST fail with
  a message naming `createChatInk`. Hosts share the timers' clock through the package's own
  `ClockProvider`.

### Injection

- Every visual decision — the appearance of each semantic text role (content, muted, strong, marker,
  chrome, cursor, positive, caution, danger, user, assistant, accent, code, link, selection), glyphs
  for icons, frames, markers and roles, markdown rendering and layout, the message frame, spinner and
  pulse frames and cadence — MUST come from an injected terminal registry; partial registries merge
  over greyscale plain defaults that render a readable transcript with no colour.
- Appearances MAY set underline and strikethrough in addition to colour, dim, bold, italic and
  inverse. Defaults: `accent`, `code` plain; `link` underlined; `selection` inverse.
- The package MUST export a plain ASCII glyph set for terminals without box-drawing or emoji
  symbols, alongside the default Unicode set; every glyph the renderer draws (tool status, plan
  status, activity facts, frames, folds, attachment, image, pending, pulse, rules, bars) is a named,
  overridable glyph.
- The completion flash MUST be switchable off through the registry (default on).

### Transcript

- Finalized messages MUST be written once and never re-rendered; only the active turn MUST be
  re-rendered as it streams.
- Auxiliary blocks MUST group and summarize exactly as defined by
  [message-rendering](../message-rendering/) (same labels, same timers, same tokens/sec), using the
  shared core logic.
- Row and group bodies (reasoning text, tool input and output) MUST be expandable for the live turn;
  finished messages print collapsed unless the host asks for expanded output. Long bodies MUST be
  clipped to a host-configurable number of lines.
- Hosts MAY render custom block kinds through injected renderers; unknown kinds render as an inert
  labelled row.

#### Scenario: Same labels as the DOM renderer

- **GIVEN** an assistant message with reasoning (2.4 s) and one finished tool call
- **WHEN** it is rendered by `@fx/chat` and by `@fx/chat-ink`
- **THEN** both show the same group summary label and duration text.

### Terminal Safety

- The renderer MUST NOT pass terminal control sequences from content to the terminal. Every string
  it draws that comes from a message, a tool, the model or a host prop (message text, markdown with
  its code blocks, tables, links and image alt text, reasoning, tool names, input and output,
  errors, attachments, status and footer facts, titles, the composer echo) MUST be stripped of ESC
  sequences (CSI, OSC, DCS, SOS, PM, APC and others), C1 controls (U+0080–U+009F), DEL and C0
  controls other than newline and tab before it is drawn; carriage returns are removed.
- Content MUST be cleaned where it enters layout, so widths are measured on what is drawn; the
  renderer's text component MUST clean string children again as a last guard. The renderer's own
  styling travels as Ink props, never as escapes inside content.

#### Scenario: A clipboard write in an answer stays inert

- **GIVEN** an answer, a code block or a tool output containing `ESC ] 52 ; c ; … BEL`
- **WHEN** the transcript renders it, inline or in the viewport
- **THEN** nothing reaches the terminal but the sequence's printable remainder, and no line is wider
  than the width it was laid out for.

### Composer

- The composer MUST support multi-line input (newline via Alt+Enter, Shift+Enter where the terminal
  reports it, Ctrl+J, or a trailing backslash), Enter to submit, line and word editing keys, paste,
  history recall that keeps the unsent draft, and the core completion-provider contract.
- Keystrokes delivered together in one chunk MUST behave as if typed one at a time, including a
  carriage return that submits.
- Tab MUST apply the selected completion; Enter MUST apply it only after the user moved the
  selection, and otherwise send the line.

#### Scenario: Command line sends on Enter

- **GIVEN** a completion provider offering `/model <id>` for the input `/model`
- **WHEN** the user presses Enter without moving the selection
- **THEN** `/model` is submitted rather than completed.

## Open Questions

- **Testing harness.** Resolved: `ink-testing-library` 4 works with Ink 8.
- **Scrollback for long active turns** in the inline transcript. Current default: only the active
  turn's tail is live; fullscreen hosts use the viewport instead.
- **Image protocols beyond kitty** (sixel, iTerm2) and formats beyond PNG/JPEG. Out of scope.

## References

- [chat-core](../chat-core/), [message-rendering](../message-rendering/), [chat-agent](../chat-agent/)

## Changelog

| Date | Change | Document |
|------|--------|----------|
| 2026-10-10 | Initial spec created (planned) | [0022-ink-renderer](../../changes/0022-ink-renderer.md) |
| 2026-10-10 | Implemented; registry roles, composer keys and chunked input specified | [0022-ink-renderer](../../changes/0022-ink-renderer.md) |
| 2026-10-10 | Fullscreen hosts: line layout, frames, viewport, markdown, composer, mouse, images; roles and glyphs extended | [0028-ink-line-layout](../../changes/0028-ink-line-layout.md) |
| 2026-10-11 | Terminal safety: content never drives the terminal; image size cap enforced while reading; split terminal reports joined | — |
