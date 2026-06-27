# 0009: Theming & Layout Parity

## Summary

Bring the reference chat UI's default look closer to a polished host chat surface without
sacrificing the design-system-agnostic contract: default `--chat-font-family` to `inherit` so the
surface adopts the host page's font, add token-driven role bubbles (user/assistant) so a turn
reads as a conversation, and fix the body-portaled completion popup to paint in the composer's
resolved font now that the font token inherits.

**Spec:** [component-registry](../specs/component-registry/),
[message-rendering](../specs/message-rendering/), [input-composer](../specs/input-composer/)
**Status:** complete
**Depends On:** 0003, 0004

## Motivation

The default stylesheet forced a system font stack and rendered every message as an undifferentiated
column, so a host embedding the surface got a look that neither matched its app nor read as a chat.
Inheriting the host font and styling user/assistant bubbles (purely via CSS custom properties, no
component overrides) closes that gap while keeping every visual decision overridable through tokens.
Because the popup portals to `document.body`, an `inherit` font token would resolve against
`<body>` rather than the composer — so the popup must copy the textarea's resolved computed font.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[architecture › Testing](../specs/architecture/index.md#testing)). CI enforces these as merge
gates:

- The stylesheet contract MUST be unit-tested by parsing `styles.css`: `--chat-font-family`
  resolves to `inherit` in both `:root` and `[data-theme="light"]`; the override seam
  (`font-family: var(--chat-font-family)`) is still present; the new role-bubble tokens exist with
  light AND dark values; the `:root` vs `[data-theme="light"]` token sets stay identical (including
  the new tokens); and the `[data-role="user"]`/`[data-role="assistant"]` bubble rules exist and
  reference the bubble tokens.
- `MessageItem` MUST be tested to expose `data-role` for both `user` and `assistant`.
- The completion popup MUST be tested: a textarea whose computed `font-family` differs from
  `<body>` causes the popup's `style.fontFamily` to equal the textarea's, `--chat-font-family` is
  NOT set as an inline custom property, and the empty-font and no-view branches are covered.
- Additivity MUST hold: the change is token-driven and headless-only; renderer structure/semantics
  are unchanged (the cross-registry agnosticism test still passes).
- No `.only`/`.skip`; coverage at or above the configured threshold.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not in
the rule.

### Font Inheritance

- `--chat-font-family` MUST default to `inherit` in `:root` and `[data-theme="light"]` (the dark
  blocks omit it and inherit from `:root`). The `font-family: var(--chat-font-family)` declarations
  MUST remain on the headless primitives as the override seam.

### Role Bubbles

- The stylesheet MUST add `--chat-user-bubble-bg` (= `var(--chat-accent)`), `--chat-user-bubble-fg`
  (= `var(--chat-accent-fg)`), `--chat-assistant-bubble-bg` (light `#f3f4f6`, dark `#111827`),
  `--chat-assistant-bubble-fg` (= `var(--chat-fg)`), and `--chat-bubble-max-width` (`85%`), keeping
  the `:root` and `[data-theme="light"]` sets identical.
- `.chat-message[data-role="user"]` MUST be right-aligned (`margin-left:auto`/`align-self:flex-end`),
  capped at `--chat-bubble-max-width`, painted with the user-bubble tokens, with `--chat-radius` and
  token-derived padding. `.chat-message[data-role="assistant"]` MUST be left-aligned with the
  assistant-bubble tokens and the same radius/padding/max-width. A `system` message MUST get no
  bubble.
- The user-bubble footer metrics MUST be re-toned so they keep WCAG AA contrast on the accent
  surface.

#### Scenario: A turn renders as bubbles

- **GIVEN** a user message and an assistant message rendered with the package stylesheet
- **WHEN** the log renders
- **THEN** the user wrapper is right-aligned on the user-bubble surface and the assistant wrapper is
  left-aligned on the assistant-bubble surface, both token-driven.

### Completion Popup Font

- The completion popup MUST drop `--chat-font-family` from its copied THEMED_TOKENS list and instead
  read the textarea's RESOLVED computed `font-family`, emitting it as a real `fontFamily` CSS
  property on the portaled popup root (only when non-empty).

#### Scenario: Popup matches the composer font

- **GIVEN** a composer whose textarea resolves a font different from `<body>`
- **WHEN** the completion popup opens
- **THEN** the popup root's `style.fontFamily` equals the textarea's resolved font and no
  `--chat-font-family` inline custom property is set.

## Design

### Approach

- `styles.css`: flip `--chat-font-family` to `inherit` in the light token sets; add the five bubble
  tokens to `:root`/`[data-theme="light"]` (identical) plus the dark assistant surface to both dark
  hooks; add `.chat-message[data-role="user"|"assistant"]` bubble rules and the user-bubble
  metrics re-tone.
- `CompletionPopup.tsx`: remove `--chat-font-family` from `THEMED_TOKENS`; in `resolveThemedTokens`
  also read `getComputedStyle(el).fontFamily` and emit it as `fontFamily` when non-empty; it is
  spread onto the popup root style alongside the copied tokens.

### Decisions

- **Decision**: Default the font token to `inherit` rather than a system stack.
  - **Why**: an embedded surface should match the host app's typography by default; hosts still
    override via the single token.
- **Decision**: Copy the popup font as a resolved computed value, not the token.
  - **Why**: `inherit` resolves against `<body>` once portaled, losing a wrapper-scoped host font;
    the resolved computed value mirrors how `caret.ts` already copies font metrics.
- **Decision**: Style only `user`/`assistant` as bubbles; leave `system` unbubbled.
  - **Why**: there is no `agent` role, and system notices should stay visually distinct.

### Non-Goals

- No new component, registry slot, or icon.
- No change to grouping, block dispatch, or renderer structure.

## Tasks

- [x] styles.css: `--chat-font-family: inherit` in `:root` + `[data-theme="light"]`
- [x] styles.css: add role-bubble tokens (light + dark) and the user/assistant bubble rules +
      AA-safe user-bubble metrics
- [x] CompletionPopup: drop the font token from THEMED_TOKENS; copy the resolved computed
      `font-family` as a real property
- [x] Specs: component-registry (tokens + font-inherit), message-rendering (role styling),
      input-composer (popup computed-font read) + changelog rows
- [x] Tests: styles parse, CompletionPopup font copy (+ empty/no-view branches), MessageItem
      data-role

## Open Questions

- [ ] Whether to also bubble a `system` role behind an opt-in token (current default: no bubble)

## References

- Spec: [component-registry](../specs/component-registry/),
  [message-rendering](../specs/message-rendering/), [input-composer](../specs/input-composer/)
- Related: [0003-component-registry](./0003-component-registry.md),
  [0004-message-rendering](./0004-message-rendering.md)
