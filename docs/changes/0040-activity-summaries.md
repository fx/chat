# 0040: Activity Summaries

## Summary

Headless support in `@fx/chat` for compact, touch-friendly activity without baking any look into the package: an optional `MessageDetails` presenter slot that a compact footer's reveal opens instead of revealing inline, an optional `ActivitySummary` presenter slot that replaces runs of activity rows with plain-data items (`activityDisplay="summary"`), `finishedActivity` on `MessageLog`/`MessageItem` with footer activity facts that toggle the activity in place, an optional `info` icon for the details control, summarized activity shown inside the footer, the details item a summary opened marked `data-focused`, the pending (`Starting`) item carrying the message's start, and memoized messages so only the changed message re-renders.

**Spec:** [component-registry](../specs/component-registry/), [message-rendering](../specs/message-rendering/)
**Status:** complete
**Depends On:** 0023, 0034

## Motivation

A touch host wants a finished answer's activity reduced to a few footer facts, a run of live activity shown as compact items rather than rows, and the message's details and actions in its own surface (a bottom sheet, a popover) rather than revealed inline in a narrow footer. The package must make that possible while staying design-system agnostic: it hands the host data and optional presenter slots, and keeps a working headless fallback when a host provides neither. Streaming long transcripts also re-rendered every message on each token, because `MessageLog` bound fresh per-message callbacks every render.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[Architecture § Testing](../specs/architecture/index.md#testing)). CI enforces these as merge gates.

### Functional requirements

The specs own the behavior. This change owns:

- Registry: OPTIONAL `MessageDetails?: ComponentType<MessageDetailsProps>` — controlled (`open`, `onOpenChange`), with labelled formatted `details`, `outcome`, `copyText`, `actions` (id, label, registry icon, handler), the message's `activity` as the package's rows (`.chat-details-activity-item[data-block-id]`, `data-focused` on the opened item) and `focusId`. No headless default: absent, the compact footer reveals inline as before. Its props reference no `@fx/chat-core` type.
- Registry: OPTIONAL `ActivitySummary?: ComponentType<ActivitySummaryProps>` — `{ items; live; onActivate? }`, each `ActivityItem` plain data (`id`, `kind`, `label`, tool `name`, `status`, `startedAt`, `durationMs`, `tokensPerSecond`, `detail`); `onActivate` absent without a `MessageDetails` presenter. Used only with `activityDisplay="summary"`; absent, activity renders as rows.
- New exported types `MessageDetail`, `MessageDetailsAction`, `MessageDetailsProps`, `ActivityItem`, `ActivitySummaryProps`, `ActivityFact`; new `classNames` keys for the footer activity facts and the details activity (`.chat-footer-activity`, `.chat-footer-fact*`, `.chat-footer-activity-items`, `.chat-details-activity*`).
- Optional icon `info` (an `OptionalIconName` with a headless glyph), used by the footer's details control, so `Record<IconName, …>` host maps keep compiling.
- `MessageLog`/`MessageItem` take `finishedActivity` (`row` default | `footer`) and `activityDisplay` (`rows` default | `summary`). With `footer`, a finished message's footer shows activity facts (tool calls and failures, thinking time or size, plan progress); each fact toggles the activity back — as rows in place, or with summary display as summaries inside the footer after the facts.
- The message (not the footer) owns the details presenter, so summary items — live or finished — open it at their own block.
- One footer decision: `hasFooterContent` counts activity facts, and `MessageItem` decides it once before planning and passes it to `planMessage`, so finished activity rows are dropped only for a footer that renders and carries facts standing in for them (never for a whitespace-only, empty or custom-only answer with nothing else in the footer, or for activity no fact stands for).
- The pending placeholder item (`Starting`) carries the message's `createdAt` as `startedAt`.
- `MessageItem` is memoized and `MessageLog` passes per-message action callbacks with stable identity that call the host's latest handlers, so only the changed message re-renders even when a host passes fresh handlers each render.

## Design

### Decisions

- **Slots, not looks.** Both presenters are OPTIONAL registry slots with no headless default: the package decides *what* to show (items, facts, details, actions as data) and leaves *how* to the host. Without them every existing consumer renders exactly as before; both new props default to the previous behaviour.
- **Items are plain data.** `ActivitySummaryProps` carries no React nodes, class strings or icons — a host maps `kind`/`name`/`status` to its own visuals and ticks live time from `startedAt`. Only `MessageDetailsProps.activity` is a node, because it is the package's own rows (so the host need not re-implement reasoning, tool and plan rendering).
- **Facts toggle in place.** The footer facts are buttons that show the activity again rather than opening a surface, keeping the footer one run of controls; the details surface is a separate `info` control.
- **The message owns details.** Live summary items must open the details before a footer exists, so the presenter's state lives in `MessageItem`.
- **One footer decision.** Review found `planMessage` hiding a finished answer's activity for a footer that then rendered nothing (whitespace-only or custom-only content, no actions or metrics), losing the activity. The footer's content (including its facts) is now computed before planning and is the plan's `showFooter`, and footer-only activity requires at least one fact, so the two cannot disagree.
- **Stable callbacks over host discipline.** Memoization only pays off if bound callbacks keep their identity; `MessageLog` caches them per message id and reads the host's latest handlers through a ref, so hosts need not memoize.

### Non-Goals

A shipped summary or details presenter (those belong to a design-system package or the host); any change to `@fx/chat-core` or `@fx/chat-agent`.

## Tasks

- [x] Registry: optional `MessageDetails` presenter; compact footer opens it instead of revealing inline
- [x] Registry: optional `ActivitySummary` presenter and plain-data activity items; `activityDisplay` and `finishedActivity` in `MessageLog`/`MessageItem`; footer activity facts; message-owned details with activity
- [x] Footer facts toggle the activity; optional `info` icon for the details control
- [x] Summarized activity shown from the footer renders inside it
- [x] Details item a summary opened marked `data-focused`
- [x] Memoized messages with stable per-message callbacks
- [x] Pending status item carries the message's start
- [x] Review fix: single-sourced footer decision shared by the plan and the footer gate
- [x] Tests (footer, message log, activity items, icons); specs and indexes
