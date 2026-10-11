# 0022: Ink Renderer

## Summary

Add `@fx/chat-ink`, a terminal renderer for core conversations with an injected terminal registry, a
plain-text default and a keyboard composer, plus the terminal reference app — delivered as a plugin
of the `tx` toolbox (`tx chat`) rather than a standalone CLI.

**Spec:** [ink-renderer](../specs/ink-renderer/)
**Status:** draft
**Depends On:** 0019, 0020

## Motivation

Agent-style CLIs are a primary consumer of chat UIs. Delivering a terminal renderer is the test of
whether the core split actually captures the shared behavior.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[Architecture § Testing](../specs/architecture/index.md#testing)). CI enforces these as merge gates:

- Vitest; renderer tests run Ink against in-memory streams and assert on the produced frames (text),
  never on screenshots.
- Fake timers for timers and spinners; no `.only` / `.skip`.
- Coverage threshold (100%) extends to `packages/ink/src/**`.
- A cross-renderer parity test renders the same fixture through `@fx/chat` and `@fx/chat-ink` and
  compares the summary labels and durations.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not in the
rule.

### Functional requirements

The [ink-renderer spec](../specs/ink-renderer/) owns the behavior and its scenarios. What implementing
them requires of this change:

- The repository's React dev dependency moves to the version Ink requires; `@fx/chat` keeps
  supporting React 18 and 19 as peers.
- If a row view-model is extracted into core (see chat-core Open Questions), `@fx/chat` is moved onto
  it in the same change so both renderers share it.

## Design

### Decisions

- **Finalized messages via Ink's static output, active turn live.**
  - **Why**: terminal scrollback cannot be redrawn; this is the only flicker-free model.
- **Own multi-line editor on Ink's input hook.**
  - **Why**: no mature multi-line Ink input exists.
- **Render planning moved into core** (`planMessage`, `planGroupHeader`, `statusLabel`,
  `shouldShowTimer`, `formatFooterMetrics`), and `@fx/chat` projects it too.
  - **Why**: the second renderer exists now; sharing the plan is what keeps the two identical.
- **The terminal app is a tx plugin** (`.tx/config.json` at the repo root → `apps/tui`).
  - **Why**: tx supplies settings storage, theme and dialogs, so the app carries only chat logic.
- **The plugin renders with tx's injected React and Ink** (React 19.3 / Ink 8, tx 2.0); the
  package and the tx bundle of the plugin contain neither. This first shipped with the plugin
  bundling its own React 19.3 and Ink 8 beside tx's React 19.2 / Ink 7.1;
  [0033-host-instances](./0033-host-instances.md) moved it onto the host's instances.
  - **Why**: one tree renders with one React and one Ink, so a plugin that shares the screen with
    tx's UI must use tx's instances; tx 2.0 injects the Ink 8 `@fx/chat-ink` needs.
- **Built-in tools moved into `@fx/chat-agent`** with injected fetch / HTML-to-text / clock.
  - **Why**: the second consumer (the terminal app) arrived; the mobile app passes its DOM converter.

### Non-Goals

- Conversation persistence in the terminal app. (Fullscreen viewport, mouse and images follow in
  changes 0028–0032.)

## Tasks

- [x] Scaffold `packages/ink`, bump repo React for Ink, test harness
- [x] Move render planning into core; `@fx/chat` projects it
- [x] Terminal registry contract + plain-text default
- [x] Transcript: static finalized messages, live active turn, grouping/summaries/timers from core
- [x] Composer: multi-line, history, completion providers, chunked input
- [x] Cross-renderer parity test
- [ ] Terminal app as a tx plugin (`apps/tui`, `tx chat`) on `@fx/chat-agent`; shared built-in tools
- [ ] Verified in a real terminal (tmux): setup dialogs, streaming, approval, Esc/Ctrl+C stop,
      `/model` completion, `/new`, quit
- [ ] Docs: specs, indexes

## References

- Spec: [ink-renderer](../specs/ink-renderer/)
- Related changes: [0019-core-extraction](./0019-core-extraction.md),
  [0020-agent-runtime](./0020-agent-runtime.md),
  [0033-host-instances](./0033-host-instances.md)
