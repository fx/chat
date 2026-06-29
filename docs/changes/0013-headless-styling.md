# 0013: Headless Styling — Host-Supplied Theme via classNames

## Summary

Make `@fx/chat` fully HEADLESS. The package ships NO visual CSS: colors, fonts, spacing, radius,
density, role bubbles, and the entire transcript look are now supplied by the HOST through the
`classNames` API (the `ChatClassNames` map passed to `<ChatProvider classNames={…}>`), applied onto
the stable `.chat-*` DOM hooks. The 1244-line `styles.css` theme stylesheet is DELETED and replaced
by a small `structure.css` that carries ONLY layout mechanics that cannot be expressed as per-element
host utility classes: the `@keyframes` (`chat-spin`, `chat-lightbox-fade`), the active-affordance +
completion spinner animation, the mention-overlay alignment box, the fixed-overlay positioning for
the lightbox and the completion popup, and a `prefers-reduced-motion` guard. The `./styles.css`
package export is replaced by `./structure.css`. The headless primitives become unstyled semantic
HTML carrying the stable hooks.

**Spec:** [architecture](../specs/architecture/), [component-registry](../specs/component-registry/),
[message-rendering](../specs/message-rendering/), [input-composer](../specs/input-composer/),
[demos](../specs/demos/)
**Status:** complete
**Depends On:** 0003, 0009

## Motivation

Earlier changes (0009–0012) accumulated a large default theme into `styles.css` — token bridges,
light/dark blocks, role-bubble selectors, density rules, focus rings, the timestamp gutter — to make
the package's own defaults look like a polished chat surface. That coupled the package to a specific
visual design and forced every host that wanted a different look to override (or fight) the shipped
CSS. The design-system-agnostic contract (see [architecture](../specs/architecture/)) is better
served by shipping NO look at all: the host owns every visual decision and injects it through the
`classNames` map onto the stable `.chat-*` hooks. The package keeps only the structural mechanics a
host CANNOT express as a per-element class — animation `@keyframes`, the two-layer mention-overlay
alignment box, and fixed-overlay positioning for the package's own lightbox/popup — so the package's
OWN composer/lightbox/spinners still work out of the box.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[architecture › Testing](../specs/architecture/index.md#testing)). CI enforces these as merge gates:

- The package smoke test MUST assert the CSS export is `./structure.css` (NOT `./styles.css`): the
  `exports` map MUST expose exactly `.`, `./headless`, and `./structure.css`; `package.json`
  `exports`/`files` MUST point at `src/structure.css`; and `src/styles.css` MUST no longer exist on
  disk.
- The smoke test MUST assert `structure.css` CONTAINS the mechanics it should ship: `@keyframes
  chat-spin`, `@keyframes chat-lightbox-fade`, the completion spinner `animation: chat-spin`, the
  shared `.chat-input-overlay, .chat-input-textarea` alignment box (with the relative
  `.chat-input-field` context), `.chat-lightbox { position: fixed }`, the completion popup z-index +
  scroll cap, and a `@media (prefers-reduced-motion)` block that drops the spinner animation.
- The smoke test MUST assert `structure.css` ships NO visual theme: no `--chat-*` custom-property
  DEFINITIONS and no `var(--chat-*)` consumption; no `.chat-text` bubble rule; no
  `--chat-user-bubble-*` / `--chat-assistant-bubble-*` tokens; no `[data-role=…]` / `[data-theme=…]`
  selectors; no `prefers-color-scheme` block; and no raw color literals (hex/rgb/hsl). A regression
  that dumps visual CSS back into the package MUST fail these assertions.
- Every test MUST assert real behavior (no trivially-true tests). No `.only`/`.skip`; coverage at or
  above the configured threshold.
- No source or test outside `demos/` may reference the deleted `styles.css`.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not in
the rule.

### Headless Package (No Visual CSS)

- The package MUST ship NO visual theme CSS. All visual styling — colors, fonts, spacing, radius,
  density, role bubbles, the whole transcript look — MUST be host-supplied via the `classNames` API
  applied onto the stable `.chat-*` DOM hooks.
- The headless primitives MUST be unstyled semantic HTML carrying only their stable `.chat-*` hooks
  (plus any host `classNames` value appended after the hook).
- The package MUST ship a `structure.css` carrying ONLY layout mechanics that cannot be expressed as
  per-element host utility classes: the animation `@keyframes`, the active-affordance + completion
  spinner animation, the mention-overlay alignment box (`.chat-input-field` /
  `.chat-input-overlay` / `.chat-input-textarea`), the lightbox + completion-popup fixed-overlay
  positioning, and a `prefers-reduced-motion` guard.
- `structure.css` MUST be OPTIONAL: a host that uses only the transcript (its own composer and
  lightbox) and supplies a full `classNames` theme — including a spinner utility for the active
  affordance — needs none of it.

### Styling Mechanism (classNames Injection)

- The package MUST expose a `ChatClassNames` map with one OPTIONAL key per stable `.chat-*` render
  hook (the `chat-` prefix stripped, camelCased), threaded through React context by the
  `<ChatProvider classNames={…}>` prop.
- Each render component MUST append its matching `classNames` value AFTER the stable `.chat-*` class,
  so a host styles every element with its own design system without losing the stable hooks. Every
  key MUST be OPTIONAL: an absent key appends nothing, leaving output byte-identical to the unstyled
  default.
- The names MUST be generic and design-system-agnostic (no host/app coupling).
- Nested `<ChatProvider>`s MUST shallow-merge `classNames` (an inner provider overrides only the keys
  it supplies); with no `classNames`, the injected map MUST be empty.

#### Scenario: Host theme is applied through classNames

- **GIVEN** a `<ChatProvider classNames={{ text: 'host-bubble', message: 'host-row' }}>`
- **WHEN** the transcript renders
- **THEN** the answer-text element carries both `chat-text` and `host-bubble`, the message wrapper
  carries both `chat-message` and `host-row`, and an element whose key is absent carries only its
  stable `chat-*` hook.

### Package CSS Export

- The package MUST replace the `./styles.css` export with `./structure.css`, pointing at
  `src/structure.css`, and MUST list `src/structure.css` in `files`.
- The deleted `styles.css` MUST NOT exist and MUST NOT be referenced by any package export, the
  `files` list, or any source/test outside `demos/`.

#### Scenario: The CSS export resolves to structure.css

- **GIVEN** the built package and its `package.json`
- **WHEN** the `exports` map is inspected
- **THEN** the only CSS subpath is `./structure.css` → `./src/structure.css`, `./styles.css` is
  absent, and `src/styles.css` does not exist on disk.

## Design

### Approach

- Delete `packages/chat/src/styles.css` (the 1244-line theme stylesheet).
- Add `packages/chat/src/structure.css` carrying ONLY: the `@keyframes` (`chat-spin`,
  `chat-lightbox-fade`); the active-affordance + completion spinner `animation`; the
  `.chat-input-field` / `.chat-input-overlay` / `.chat-input-textarea` alignment box; the
  `.chat-lightbox` / `.chat-lightbox-dialog` / `.chat-lightbox-image` / `.chat-lightbox-close`
  fixed-overlay positioning; the `.chat-completion-popup` / `.chat-completion-scroll` placement; and
  the `@media (prefers-reduced-motion)` guard.
- `package.json`: replace the `./styles.css` export with `./structure.css` → `./src/structure.css`;
  list `src/structure.css` in `files`.
- Headless primitives (`registry/headless/primitives.tsx`) become unstyled semantic HTML carrying the
  stable `.chat-*` hooks; the visual look is host-supplied via `classNames`.
- Rewrite `smoke.test.ts` to assert the headless reality (export → structure.css; mechanics present;
  visual theme absent) instead of the deleted theme contract.

### Decisions

- **Decision**: Ship NO visual theme; host supplies all styling via `classNames`.
  - **Why**: the design-system-agnostic contract is best served by zero shipped look. A large default
    theme coupled the package to one design and forced hosts to override it.
- **Decision**: Keep a small `structure.css` rather than shipping zero CSS.
  - **Why**: `@keyframes`, the two-layer mention-overlay alignment box, and fixed-overlay positioning
    cannot be expressed as per-element host utility classes, so the package's own
    composer/lightbox/spinners need them to work out of the box. It stays OPTIONAL.
- **Decision**: Name the export `./structure.css` (not keep `./styles.css`).
  - **Why**: the name signals that it is layout mechanics, not a theme; the rename is the seam that
    lets the smoke test pin "no visual CSS shipped".

### Non-Goals

- No change to the message model, the render-layer structure/semantics, the grouping policy, or the
  block dispatch. The change is the addition of the `classNames` injection seam, the removal of
  shipped visuals, and the CSS-export rename.
- No new registry slot, primitive, or icon.

## Tasks

- [x] Delete `src/styles.css`; add `src/structure.css` (layout mechanics only; no theme)
- [x] `package.json`: replace `./styles.css` export with `./structure.css`; list `src/structure.css`
      in `files`
- [x] Headless primitives become unstyled semantic HTML on the stable `.chat-*` hooks
- [x] Rewrite `smoke.test.ts`: export → structure.css; mechanics present; visual theme absent; no
      `styles.css` reference outside `demos/`
- [x] Specs: architecture (CSS export → structure.css, no visual CSS), component-registry (classNames
      injection as the styling mechanism), message-rendering (transcript styling host-supplied),
      input-composer (composer mechanics in structure.css), demos (each pane supplies a classNames
      theme) + changelog rows
- [x] Index: sync `docs/index.yml` and `docs/index.md` with change 0013

## Changelog

- **2026-06-29** — Initial change: package goes fully headless; `styles.css` deleted; `structure.css`
  ships layout mechanics only; styling host-supplied via the `classNames` API; `./styles.css` export
  replaced by `./structure.css`.

## Open Questions

- [ ] Whether to publish a reference `classNames` theme as a separate optional package so hosts have a
      ready-made starting look without shipping it inside `@fx/chat`.

## References

- Spec: [architecture](../specs/architecture/), [component-registry](../specs/component-registry/),
  [message-rendering](../specs/message-rendering/), [input-composer](../specs/input-composer/),
  [demos](../specs/demos/)
- Related: [0003-component-registry](./0003-component-registry.md),
  [0009-visual-density-parity](./0009-visual-density-parity.md)
