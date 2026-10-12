# 0042: Mobile Activity Tiles

## Summary

The Android app adopts the touch activity presenters from 0040/0041: a turn's reasoning and tool calls show as tiles, kept below its latest text while it streams, and once the answer lands they leave the transcript for the footer's fact tiles and the details sheet. Only the last answer's footer and the tapped message's footer show; when a run ends the live tiles morph into the footer. Streamed updates reach the transcript at most every 50ms.

**Spec:** [mobile-app](../specs/mobile-app/)
**Status:** complete
**Depends On:** 0037, 0040, 0041

## Motivation

0040 gave `@fx/chat` headless slots for a compact activity display and 0041 gave `@fx/chat-shadcn` a touch look for them, but the app still rendered every activity row inline and every footer at once. On a phone that buried the answer under disclosure rows and footers. Streamed chunks also reached the transcript one by one, repainting far more often than a phone needs.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[Architecture § Testing](../specs/architecture/index.md#testing)). CI enforces these as merge gates.

### Functional requirements

- The conversation renders `MessageLog` with `activityDisplay="summary"`, `activityPlacement="after-content"` and `finishedActivity="footer"`: live activity shows as tiles under the newest text; finished activity lives in the footer and the details sheet.
- The built-in tools get their own tile icons (`fetch_url`: globe, `calculator`, `current_time`: clock) via `createShadcnComponents({ toolIcons })`.
- Footers are hidden except the last answer's and the selected one's. Tapping an assistant message selects it (tapping its text again, or anywhere outside a message, clears it); taps on a footer, or bubbling from the details sheet's portal, change nothing. The footer fades in unless reduced motion is on.
- When a run ends, the transcript learns it one render late inside a view transition (where supported and motion is welcome); the last answer's tile row and footer share a view-transition name, so the tiles morph into the footer.
- The app store passes `updateIntervalMs` (default `UPDATE_INTERVAL_MS` = 50, injectable for tests) to `ChatController`, so streamed updates are applied at most every 50ms.

## Design

### Decisions

- **App-only.** Everything here is configuration of public `@fx/chat`, `@fx/chat-shadcn` and `@fx/chat-agent` APIs plus app CSS keyed on the stable `.chat-*` hooks and `data-message-id`; no package changes.
- **Footer visibility is app CSS.** The selected/last message ids are written into a generated `<style>` rule (`conversationStyle`, ids escaped with `CSS.escape`) rather than a library prop, since which footers show is a touch-app decision.
- **Throttling stays in the controller.** `ChatController` (0037) already implements `updateIntervalMs` (latest snapshot wins); the app only chooses the interval. No app-side throttle was added.

### Non-Goals

Any change to `@fx/chat`, `@fx/chat-core`, `@fx/chat-agent` or `@fx/chat-shadcn`; mobile-app spec text for these behaviours (the source branch added none).

## Tasks

- [x] Activity as tiles, finished activity in the footer; built-in tool tile icons
- [x] One footer shown, on the tapped message; fade-in respecting reduced motion
- [x] Live activity kept below the turn's latest text (`after-content`)
- [x] Last answer's footer always shown; finished tiles morph into the footer
- [x] Streamed updates applied at most every 50ms via the controller's `updateIntervalMs`
- [x] Tests (`conversationStyle`, `selectionAfterTap`, `useFinishTransition`, app); index entries
