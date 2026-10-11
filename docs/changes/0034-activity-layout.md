# 0034: Activity Layout Polish

## Summary

Make chronological (`inline`) activity a comfortable default for line-layout hosts and keep `after-content` and footer-only finished activity clean: no double header for a lone activity block after content, footer-only finished activity that hides every activity row, a truthful and neutrally marked live-tail `earlier` row, a blank line between content and activity, adjacent text blocks kept as separate paragraphs in either placement, and a threaded footer corner with no dangling space when there are no footer facts.

**Spec:** [message-rendering](../specs/message-rendering/), [chat-core](../specs/chat-core/), [ink-renderer](../specs/ink-renderer/), [layout](../specs/ink-renderer/layout.md)
**Status:** complete
**Depends On:** 0025, 0028, 0033

## Motivation

A host that shows activity in stream order, with an option to leave a finished answer's activity to the footer's counts, hit five defects:

1. With `after-content`, a single activity block was still wrapped in a group, so the layout drew a group header and then the block's own header inside it.
2. `finishedActivity: 'footer'` skipped only `group` rows; a lone reasoning, tool or plan block (a bare row) still showed after the answer finished.
3. The live tail's `earlier` row was drawn with the tool glyph and counted hidden reasoning and plans too, so one hidden thought read as a hidden tool.
4. Activity rows sat directly against the answer text before and after them.
5. The threaded frame drew the footer corner and a trailing space even when the answer had no footer facts.
6. Two text blocks were separated by a blank line only with `after-content`; in stream order — notably when the activity between them is hidden — the paragraphs ran together.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[Architecture § Testing](../specs/architecture/index.md#testing)). CI enforces these as merge gates.

### Functional requirements

The specs own the behavior. This change owns:

- `planMessage` with `activityPlacement: 'after-content'` plans a single activity block as a bare row (two or more stay one group).
- New plan option `finishedActivity?: 'row' | 'footer'` (default `row`): with `footer`, a finished assistant message whose footer shows plans no activity rows (bare activity blocks and groups alike, decided by the timeline-behaviour registry), in either placement. Flat planning ignores it.
- The `earlier` row carries `tools` (hidden tool calls) beside `count`; `earlierLabel(row)` gives its plain text. Both renderers use it.
- `@fx/chat-ink`: new glyph `earlier` (`⋮` / ASCII `^`; empty draws no marker); `glyphs.tool` is no longer drawn and is deprecated.
- `@fx/chat-ink`: `LayoutContext.activitySpacing` / `TranscriptViewport` `activitySpacing` (default `true`) — one blank decoration line between content and adjacent activity.
- `@fx/chat-ink`: adjacent text rows get one blank decoration line between them in both placements, including text rows made adjacent by hidden activity; always on.
- The threaded frame closes an answer without footer facts with the bare corner glyph right after the body.

## Design

### Decisions

- **Footer-only activity is a core plan option.** It is a row decision, so it lives with the rest of row planning; the terminal line layout passes it while collapsed. It applies only when the footer shows, so an activity-only turn (no footer) never disappears. The DOM renderer does not expose it: its footer carries no activity counts.
- **The earlier row's breakdown is tool calls vs. everything else.** The live tail keeps the newest tool calls, so tool calls are what a reader expects to be hidden; the rest (reasoning, older plans, other activity kinds) reads as steps. Labels: `+2 earlier tool calls`, `+1 earlier step`, `+3 earlier steps (2 tool calls)`.
- **Spacing is decoration on the body boundary.** A `frame` line (never copied), drawn by whichever frame wraps the body, so the threaded gutter continues through it. Consecutive activity rows and the outcome row's side (content) are not split.
- **Paragraph separation is decoration and always on.** The blank line between adjacent text blocks is the same kind as activity spacing (`frame`, not copied), so a copy across two text blocks reads like one across a hidden tool call. It does not follow `activitySpacing`: turning activity spacing off is about density around activity, while two paragraphs with no line between them read as one. The two never stack, since text rows made adjacent have no activity row between them. (With `after-content`, the line between text blocks was previously copied; it no longer is.)
- **Bare corner without facts.** The threaded answer ends `│ body` → `╰` — no blank gutter line and no trailing space — instead of an empty footer line.

### Non-Goals

Spacing in the element-based inline transcript (`MessageView`); a DOM `finishedActivity` prop.

## Tasks

- [x] Core: lone after-content activity block bare; `finishedActivity` plan option; `earlier` row `tools` and `earlierLabel`
- [x] DOM: earlier row label from core, `data-tools`
- [x] Ink: adjacent text blocks separated in both placements
- [x] Ink: `earlier` glyph; line layout drops the group-only skip and uses the plan option; activity spacing option (layout context, viewport, cache key); threaded bare corner
- [x] Tests (core, line layout, frames, cross-renderer parity); specs and indexes
