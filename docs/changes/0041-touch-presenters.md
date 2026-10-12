# 0041: Touch Presenters

## Summary

The touch look for `@fx/chat-shadcn`, built on the optional presenter slots `@fx/chat` gained in 0040: `createShadcnClassNames({ touch })` with steady, touch-sized disclosure rows at the answer's text size and an all-tile touch footer; revealed footer actions that grow to fit their labels; a `MessageDetailsSheet` presenter that shows a message's details, activity and actions in a bottom sheet (vaul drawer on radix dialog); an `ActivitySummary` presenter (`createActivityTiles`) that shows activity as square status tiles with a compositor-driven ring and a live timer, opening the details at the tapped item, highlighted. `createShadcnComponents({ touch: true })` provides both presenters.

**Spec:** [architecture](../specs/architecture/)
**Status:** complete
**Depends On:** 0036, 0040

## Motivation

0040 gave `@fx/chat` headless slots for a compact, touch-friendly activity display but shipped no look for them, by design. `@fx/chat-shadcn` is where the shadcn look lives, so the touch presenters belong there. Separately, disclosure rows changed height and shifted their label as a turn progressed (a static `Starting…` row, a live row and a group header were 25, 52 and 44px tall, and a live row's spinner pushed the label right), and revealed footer actions spilled over each other in fixed 44px boxes.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[Architecture § Testing](../specs/architecture/index.md#testing)). CI enforces these as merge gates.

### Functional requirements

- `createShadcnClassNames({ touch })` (exported with `ShadcnClassNamesOptions`; `shadcnClassNames` stays the non-touch theme): one row-header height for every row kind (40px at the answer's text size on touch, 28px/12px otherwise); a static row reserves the caret's width and a live row's spinner takes the kind icon's place, so the label never moves; rows carry no padding and bodies indent under the row's icon.
- Touch footer: every control is a 44px tile (one `TILE` size shared by activity tiles, footer facts and icon buttons); the footer wraps them and the metrics take their own line; shown activity tiles join the footer's wrap.
- Registry: the touch trigger no longer sets its own height (it comes from the classNames theme); icon buttons keep a 44×44 minimum but grow to fit a label.
- `MessageDetailsSheet`: a `MessageDetails` presenter in a bottom `Drawer` (new `ui/drawer`, deps `vaul` and `@radix-ui/react-dialog`) with the details as facts, the message's activity and its actions.
- `createActivityTiles(toolIcons?)` / `tileText`: an `ActivitySummary` presenter rendering items as status tiles (kind or per-tool icon, time/rate/progress inside, a ring while running, amber while waiting); tapping a tile opens the details at it; a live tile's time ticks (`TILE_TICK_MS`) and the waiting tile's spinner turns; the ring turns on the compositor.
- `createShadcnComponents({ touch: true, toolIcons? })` provides `MessageDetails` and `ActivitySummary`; without `touch` the registry is unchanged.

## Design

### Decisions

- **Visuals stay out of `@fx/chat`.** Everything here implements 0040's optional slots and `classNames` keys from `@fx/chat-shadcn`, using only `@fx/chat`'s public exports; no package below it changes.
- **Row height belongs to the theme.** Height moved from the registry's trigger to `createShadcnClassNames`, so every row kind (including the static pending row, which has no trigger) gets the same height.
- **Tiles are status only.** On touch a tile shows what happened; the details sheet is where text, activity and actions live.
- **Presenters follow `touch`.** Touch hosts get the sheet and tiles from the registry they already build; desktop hosts are untouched.

### Effect on the Android app

The app already builds `createShadcnComponents({ touch: true })` and renders `MessageLog` with `compactFooter`, so with this change:

- the compact footer's details control opens the bottom sheet instead of revealing actions inline;
- it now pairs the registry with `createShadcnClassNames({ touch: true })` (one-line app change, carried here so its disclosure rows keep a touch height after the registry stopped sizing them), which also gives it 40px rows and the all-tile touch footer;
- activity tiles are inactive until the app opts into `activityDisplay="summary"` / `finishedActivity="footer"` (a later change).

### Non-Goals

Any change to `@fx/chat`, `@fx/chat-core` or `@fx/chat-agent`; the app adopting summary display and footer activity.

## Tasks

- [x] Steady, touch-sized disclosure rows via `createShadcnClassNames({ touch })`; touch rows at the answer's text size
- [x] Revealed footer actions fit their labels
- [x] `MessageDetailsSheet` bottom sheet (`ui/drawer`, vaul, radix dialog)
- [x] Activity tiles, footer fact tiles, sheet activity; one tile size; all-tile touch footer; shown tiles join the footer's wrap
- [x] Tiles open their details highlighted; ring on the compositor; waiting tile's spinner turns with a live timer
- [x] Android app pairs the touch registry with the touch classNames theme
- [x] Tests (class names, registry, details sheet, tiles); index entries
