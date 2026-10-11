# 0030: Fullscreen Composer

## Summary

Composer additions: controlled value with attachments, plain variant, cell-width soft wrap, max rows with inner scroll, attachments row, visual-row moves, word jumps, kill-line option, recall rule, attachments in history, host key routing (`onKey`, host-fed input), `onPaste`, kitty-keyboard mode, terminal-report filtering.

**Spec:** [ink-renderer § composer](../specs/ink-renderer/composer.md)
**Status:** complete
**Depends On:** 0028

## Motivation

Fullscreen hosts need drafts per conversation, queue restore, Esc layering and single-dispatcher input.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[Architecture § Testing](../specs/architecture/index.md#testing)). CI enforces these as merge gates:

- Vitest (+ `@testing-library/react` for DOM, `ink-testing-library` for terminal views); every
  exported function, hook and component has tests covering its spec scenarios.
- Timing logic uses fake timers only; no real-clock sleeps; no `.only` / `.skip`.
- 100% lines/branches/functions/statements over `packages/*/src/**`; apps have their own tests.
- The cross-renderer parity test covers every label or fact both renderers show.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not in the
rule.

### Functional requirements

The spec owns the behavior. This change owns: the default composer's behavior and tests stay unchanged.

## Design

### Decisions

- The editor gains visual-row helpers over the soft-wrapped layout; `isTerminalReport` recognises SGR mouse and CSI replies.
- Soft wrap is by grapheme at the cell limit (not at word boundaries), so caret moves stay predictable.
- Ink 8 already drops mouse reports and CSI replies before its input listeners; the composer's own filter matters for hosts that route raw input in through the handle.
- History entries become `{ text, attachments? }`; `createHistory` and `pushHistory` still accept plain strings.

### Non-Goals

IME composition, undo.

## Tasks

- [x] Controlled state, attachments, plain variant, soft wrap, max rows; tests
- [x] Visual rows, word jumps, recall rule, kill-line; tests
- [x] Routing: onKey, host input, onPaste, kitty keyboard, report filtering; tests; specs/indexes

## References

- Source proposals reviewed in this session: external `chat-core-changes.md` and
  `chat-ink-changes.md` (agent-activity and fullscreen-terminal needs of another host).
