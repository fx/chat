# 0031: Mouse and Images

## Summary

Viewport mouse support (reporting lifecycle, origin helper, wheel, drag-select with highlight, copy extraction, OSC 52, double-click, clicks) and images (provider contract, image lines and captions, the opt-in `@fx/chat-ink/kitty` provider with fetch policy).

**Spec:** [ink-renderer § mouse](../specs/ink-renderer/mouse.md), [§ images](../specs/ink-renderer/images.md)
**Status:** complete
**Depends On:** 0028, 0029

## Motivation

Selection/copy and images are what fullscreen hosts hand-roll today.

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

The specs own the behavior. This change owns:

- **Mission over proposal:** the kitty provider decodes nothing itself; non-PNG formats need a host-injected decoder (no image codecs bundled).

## Design

### Decisions

- Origin: sum of Yoga computed left/top up the node chain, isolated in `screenOrigin`. Kitty diacritics table embedded from the protocol's published list.
- Ink 8 drops mouse reports and terminal replies before its input listeners, so the viewport reads them from a raw stdin `data` tap (`useTerminalData`); with Ink's `readable` listener attached, `data` fires for every chunk Ink reads. Hosts tap the same way for the kitty cell-size reply.
- Placeholder colours use `ansi256(id)`; the terminals that support the protocol report true colour, so the colour library never downsamples the id.
- Table padding and joints are chrome; the joint copies as a tab so a copied table pastes as columns.

### Non-Goals

Sixel/iTerm2, GIF/WebP.

## Tasks

- [x] Mouse: lifecycle, origin, wheel, selection, extraction, OSC 52, clicks; tests
- [x] Image contract + lines; kitty provider; tests; specs/indexes

## References

- Source proposals reviewed in this session: external `chat-core-changes.md` and
  `chat-ink-changes.md` (agent-activity and fullscreen-terminal needs of another host).
