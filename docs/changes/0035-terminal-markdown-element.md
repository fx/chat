# 0035: Terminal Markdown Element

## Summary

Export the dependency-free terminal markdown layout as an element, `TerminalMarkdown`, for the element-based markdown slot of the inline transcript, teach the inline parser character references, and have `tx chat`'s `--inline` mode inject it in place of its own `marked`-based renderer, so the app drops the `marked` dependency.

**Spec:** [ink-renderer](../specs/ink-renderer/), [markdown](../specs/ink-renderer/markdown.md), [terminal-app](../specs/terminal-app/)
**Status:** complete
**Depends On:** 0029

## Motivation

0029 gave the line viewport a dependency-free terminal markdown layout, but the inline (element-based) transcript's markdown slot still defaulted to plain text. `tx chat` filled that slot with its own `marked` → Ink renderer, so the two modes rendered markdown differently and the app carried a parser dependency the package already made unnecessary. The package's inline parser also left character references (`&amp;`, `&#65;`) as written, which `marked` decoded.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[Architecture § Testing](../specs/architecture/index.md#testing)). CI enforces these as merge gates.

### Functional requirements

The specs own the behavior. This change owns:

- `@fx/chat-ink` exports `TerminalMarkdown` (and `TerminalMarkdownProps`): an element taking the inline markdown slot's props plus optional `width` and `measure`. It strips controls from the source, lays it out with the default terminal markdown to its box's measured width (the terminal's width until the first layout pass, or an explicit `width`), and draws the lines in the injected theme roles and glyphs.
- The inline markdown slot's default stays plain; a host opts in by injecting `TerminalMarkdown`.
- The inline parser decodes `&amp; &lt; &gt; &quot; &apos; &nbsp;` and decimal/hex numeric references outside code spans. A numeric reference naming a C0/C1 control, a surrogate or no character stays as written, so decoding never produces a control.
- `tx chat` injects `TerminalMarkdown` in `--inline` mode; `apps/tui/src/markdown.tsx` and the `marked` dependency are removed, and its tests move to the package.

## Design

### Decisions

- **One layout, two shapes.** The element wraps the same `terminalMarkdown` the line viewport uses rather than a second renderer, so both modes render identically and the package needs no parser dependency.
- **Measured width with a terminal fallback.** Ink measures a box only after layout, so the first render lays out to the terminal's columns and re-lays out once the box is measured; a host may pin `width`.
- **References never decode into controls.** Controls are stripped before parsing; a numeric reference could otherwise reintroduce one after sanitising, so such references stay literal.
- **Opt-in, not a new default.** The inline slot's plain default is unchanged so existing hosts see no behavior change.

### Non-Goals

Changing the inline slot's default; HTML named references beyond the six listed.

## Tasks

- [x] Ink: `TerminalMarkdown` element exported from `@fx/chat-ink`
- [x] Ink: inline character references, never decoding into controls
- [x] tx chat: inject `TerminalMarkdown` in `--inline`; remove `markdown.tsx` and `marked`; move tests to the package
- [x] Specs (ink-renderer, markdown, terminal-app) and indexes
