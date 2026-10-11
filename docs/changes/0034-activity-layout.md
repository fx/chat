# 0034: Activity Layout Polish

## Summary

Make chronological (`inline`) activity a comfortable default for line-layout hosts and keep `after-content` and footer-only finished activity clean: no double header for a lone activity block after content, footer-only finished activity that hides every activity row, a truthful and neutrally marked live-tail `earlier` row, a blank line between content and activity, adjacent text blocks kept as separate paragraphs in either placement, a threaded footer corner with no dangling space when there are no footer facts, a live-phase label that names a tool as its row does, one spinner for every live row, default glyphs with an unambiguous terminal width, and group headers that say what the group holds.

**Spec:** [message-rendering](../specs/message-rendering/), [chat-core](../specs/chat-core/), [ink-renderer](../specs/ink-renderer/), [layout](../specs/ink-renderer/layout.md)
**Status:** complete
**Depends On:** 0025, 0028, 0033

## Motivation

A host that shows activity in stream order, with an option to leave a finished answer's activity to the footer's counts, hit these defects:

1. With `after-content`, a single activity block was still wrapped in a group, so the layout drew a group header and then the block's own header inside it.
2. `finishedActivity: 'footer'` skipped only `group` rows; a lone reasoning, tool or plan block (a bare row) still showed after the answer finished.
3. The live tail's `earlier` row was drawn with the tool glyph and counted hidden reasoning and plans too, so one hidden thought read as a hidden tool.
4. Activity rows sat directly against the answer text before and after them.
5. The threaded frame drew the footer corner and a trailing space even when the answer had no footer facts.
6. Two text blocks were separated by a blank line only with `after-content`; in stream order — notably when the activity between them is hidden — the paragraphs ran together.
7. With an agent that reasons before every tool call, the `earlier` row counted reasoning the tail hides anyway — even reasoning between shown rows — so `+1 earlier step` sat above a single shown tool call and read as hidden tool calls.
8. The live phase named a running tool by its title alone; harnesses often title shell calls generically, so the status line read `running Running`.
9. Running tool rows and live plan entries drew a static glyph while every other live row drew the spinner.
10. Default glyphs such as `⚒`, `⚙`, `☑`, `🖼` and `⏸` are emoji-capable but text-default: the measure counts one cell while many terminals draw two (eating the following space, shifting lines), and `∴` did not read as thinking.
11. A finished group of `[reasoning, tool] × 5` + reasoning read `(+10) Reasoning`: the header named the last thought and hid everything else in an unexplained count, and tool rows showed no time at all.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[Architecture § Testing](../specs/architecture/index.md#testing)). CI enforces these as merge gates.

### Functional requirements

The specs own the behavior. This change owns:

- `planMessage` with `activityPlacement: 'after-content'` plans a single activity block as a bare row (two or more stay one group).
- New plan option `finishedActivity?: 'row' | 'footer'` (default `row`): with `footer`, a finished assistant message whose footer shows plans no activity rows (bare activity blocks and groups alike, decided by the timeline-behaviour registry), in either placement. Flat planning ignores it.
- The `earlier` row carries `tools` (hidden tool calls) beside `count`; `earlierLabel(row)` gives its plain text. Both renderers use it. It counts only hidden blocks older than the tail's first shown row, never reasoning.
- New core helper `toolHeadline(call)`: the label, then the input when it adds something. `StatusLine`'s default `tool` phase label is `running <toolHeadline, ≤32 cells>`.
- `@fx/chat-ink`: a pending/running tool row in a live message and an in-progress plan entry in a live message draw the spinner (line layout and element-based view); `glyphs.toolRunning` is no longer drawn and is deprecated; `planActive` stays for a plan entry in a message that is not live.
- Core `planGroupHeader` plans headers by content: `kind` (`tools` | `reasoning` | `block`), `tools` (`ToolGroupCounts`: total, succeeded, failed, running call, the only call), `reasoningCount`; `hiddenCount` 0 for tool and reasoning headers. New helpers `toolGroupLabel(counts, durationMs?)` and `toolSpanMs(calls)`. `summarizeBlock` gives tool calls a timer pill; the DOM and terminal tool rows show their duration or live elapsed. The DOM group summary carries `data-tools` / `data-failed`.
- `@fx/chat-ink`: the default glyph set is monochrome and `Emoji=No` throughout (`✻` thinking, `ƒ` tools, `§` system prompt, `☐` plan, `▣` image, `‖` queued, `⊕` attachment, `☒` done task); new export `emojiGlyphs` — the default set with `🧠` `🔧` `📜` `📋` `📷` `📎` `⏳`, all `Emoji_Presentation=Yes`.
- `@fx/chat-ink`: new glyph `earlier` (`⋮` / ASCII `^`; empty draws no marker); `glyphs.tool` is no longer drawn and is deprecated.
- `@fx/chat-ink`: `LayoutContext.activitySpacing` / `TranscriptViewport` `activitySpacing` (default `true`) — one blank decoration line between content and adjacent activity.
- `@fx/chat-ink`: adjacent text rows get one blank line between them in both placements, including text rows made adjacent by hidden activity; always on, and copied (a paragraph break).
- The threaded frame closes an answer without footer facts with the bare corner glyph right after the body.

## Design

### Decisions

- **Footer-only activity is a core plan option.** It is a row decision, so it lives with the rest of row planning; the terminal line layout passes it while collapsed. It applies only when the footer shows, so an activity-only turn (no footer) never disappears. The DOM renderer does not expose it: its footer carries no activity counts.
- **The earlier row's breakdown is tool calls vs. everything else.** The live tail keeps the newest tool calls, so tool calls are what a reader expects to be hidden; the rest (reasoning, older plans, other activity kinds) reads as steps. Labels: `+2 earlier tool calls`, `+1 earlier step`, `+3 earlier steps (2 tool calls)`.
- **Spacing is decoration on the body boundary.** A `frame` line (never copied), drawn by whichever frame wraps the body, so the threaded gutter continues through it. Consecutive activity rows and the outcome row's side (content) are not split.
- **Paragraph separation is copied and always on.** The blank line between adjacent text blocks is a paragraph break, so a copy across two paragraphs keeps it — what `after-content` always did — unlike the activity-spacing decoration, which a copy skips. It does not follow `activitySpacing`: turning activity spacing off is about density around activity, while two paragraphs with no line between them read as one. The two never stack, since text rows made adjacent have no activity row between them.
- **The earlier row announces rows, not blocks.** Reasoning the tail hides is not a hidden row — the footer's reasoning count covers it — and a block between shown rows is not "earlier". With reasoning before every call, the row appears only once more tool calls exist than the tail shows.
- **A group header says what it holds.** Tool calls are what a reader scans for, so a group with any is about them alone: the count, the failures, and the time they took. Time is wall clock across the calls (parallel calls overlap), not a sum, unless starts are missing. Thoughts are counted, not hidden behind `+N`. The counts are structured in core so each renderer draws the outcome split its own way (DOM text `4 ok · 1 failed`, terminal glyphs `4 ✓ 1 ✗`); a plan or other kind keeps `+N`, since its label does not state the rest.
- **Glyph widths are a rule, not a font question.** A text-default emoji-capable character is measured one cell but drawn two by many terminals; no shipped set may contain one. The default stays monochrome text (one cell, no colour) and sticks to glyphs common monospace fonts carry; colour icons are an opt-in set of emoji-default characters, measured and drawn two cells. A test enforces both.
- **Bare corner without facts.** The threaded answer ends `│ body` → `╰` — no blank gutter line and no trailing space — instead of an empty footer line.

### Non-Goals

Spacing in the element-based inline transcript (`MessageView`); a DOM `finishedActivity` prop.

## Tasks

- [x] Core: lone after-content activity block bare; `finishedActivity` plan option; `earlier` row `tools` and `earlierLabel`
- [x] DOM: earlier row label from core, `data-tools`
- [x] Ink: adjacent text blocks separated in both placements
- [x] Ink: `earlier` glyph; line layout drops the group-only skip and uses the plan option; activity spacing option (layout context, viewport, cache key); threaded bare corner
- [x] Core: earlier row counts only older, non-reasoning activity; `toolHeadline`; status line phase label
- [x] Ink: spinner for running tool rows and live plan entries (line layout and element view); `toolRunning` deprecated
- [x] Ink: monochrome default glyphs, `emojiGlyphs`, glyph-width test
- [x] Core: group headers by content (tool counts and span, thoughts, plans); tool rows timed; DOM and terminal projection; parity
- [x] Tests (core, line layout, frames, cross-renderer parity); specs and indexes
