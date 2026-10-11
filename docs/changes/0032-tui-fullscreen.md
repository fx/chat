# 0032: TUI Fullscreen

## Summary

Move `tx chat` to the fullscreen viewport by default (threaded frame, status line, queue, mouse copy, images, detail keys) with `--inline` keeping the scrollback mode.

**Spec:** [terminal-app](../specs/terminal-app/)
**Status:** complete
**Depends On:** 0028, 0029, 0030, 0031

## Motivation

Dogfoods every fullscreen piece in a real host and verifies it in a real terminal.

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

The spec owns the behavior. This change owns: the TUI's markdown moves from its marked-based element renderer to the package default line layout (the inline mode keeps the injected element markdown).

## Design

### Decisions

- Alternate screen through Ink's `alternateScreen` render option; the layout follows the window size.
- Session logic (settings, turns, approvals, commands, queue) moves into a hook shared by the fullscreen and inline views.
- Esc layers in fullscreen: close details, clear the input, take back the last queued message, stop. Unqueueing only makes sense while an answer streams, so it comes before stopping.
- Shift+↑/↓ belong to the viewport: the host's key handler consumes them before the composer.
- Verified in tmux against the mock endpoint: empty state, threaded answers with lists, tables and code, a tool turn with a queued follow-up, details via Ctrl+T, Esc, exit restoring the screen, and `--inline`. Verification found reasoning rows drawing the collapsed marker in details mode; fixed in the line layout.

### Non-Goals

Persistence.

## Tasks

- [x] Fullscreen app shell; queue; keys; tests
- [x] Mouse copy notice, images, inline flag; tmux verification; specs/indexes

## References

- Source proposals reviewed in this session: external `chat-core-changes.md` and
  `chat-ink-changes.md` (agent-activity and fullscreen-terminal needs of another host).
