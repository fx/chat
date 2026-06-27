# 0010: Single-Caret Disclosure Ownership

## Summary

Make the registry `Collapsible` slot the SOLE owner of the disclosure caret. The shared
`CollapsibleRow` substrate stops emitting a caret affordance, and the CSS hack that hid the
headless Collapsible's built-in caret inside a `.chat-row` is removed. The result is exactly one
expand/collapse chevron in every registry — including host overrides whose `Collapsible` renders
its own chevron — instead of a doubled caret (substrate + slot) papered over by a `display:none`
hack that only worked for the headless default.

**Spec:** [message-rendering](../specs/message-rendering/),
[component-registry](../specs/component-registry/)
**Status:** draft
**Depends On:** 0003, 0004

## Motivation

`CollapsibleRow` rendered its own caret as an affordance icon AND the registry `Collapsible`
rendered one in its summary, so two carets appeared. The stylesheet hid the slot's caret with
`.chat-row .chat-collapsible-caret{display:none}`. That hack is registry-specific: a host override
whose `Collapsible` renders a chevron with a different class shows a doubled caret, and the headless
caret is hidden even when it is the more appropriate one to keep. Assigning sole caret ownership to
the `Collapsible` slot removes the ambiguity and the hack, and works uniformly across registries.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[architecture › Testing](../specs/architecture/index.md#testing)). CI enforces these as merge
gates:

- The substrate affordance precedence MUST be unit-tested: an idle bodied row keeps the `body`
  tone but renders NO `.chat-row-affordance-icon`; the filler case renders no icon
  (`data-affordance="filler"`); active → spinner icon and flash → success check icon still render.
- The single-caret guarantee MUST have an injection-safe test rendering a bodied collapsible row
  through (a) the headless registry → exactly one `.chat-collapsible-caret`, zero package affordance
  caret icon; and (b) a stub registry whose `Collapsible` renders its own chevron → exactly one host
  chevron, zero headless package caret.
- The headless `Collapsible` MUST still be tested to render its caret in open and closed states.
- The cross-registry agnosticism test MUST still pass unchanged (no renderer structure change).
- No `.only`/`.skip`; coverage at or above the configured threshold.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not in
the rule.

### Affordance Precedence

- `CollapsibleRow` affordance-icon precedence MUST become: active → spinner (tone `active`);
  flash → success check (tone `success`); otherwise → NO affordance icon, with the
  `.chat-row-affordance` span still rendered (empty filler) for layout. The bodied-idle case keeps
  the `body` tone for styling but emits no icon, exactly like `filler`.
- `CollapsibleRow` MUST NOT render a disclosure caret. There MUST be no `showCaret` contract prop.

### Caret Ownership & CSS

- The CSS rule `.chat-row .chat-collapsible-caret{display:none}` (and its comment) MUST be removed;
  the nearby affordance comment MUST state that `CollapsibleRow` owns only the spinner/check and the
  `Collapsible` slot owns the caret.
- `icons.caretDown`/`icons.caretRight` MUST remain in the icon set (used by the headless
  `Collapsible`).

#### Scenario: Exactly one caret in every registry

- **GIVEN** an idle bodied collapsible row
- **WHEN** it renders through the headless registry, and through a host registry whose `Collapsible`
  renders its own chevron
- **THEN** exactly one caret shows in each case and the substrate adds none.

## Design

### Approach

- `CollapsibleRow.tsx`: in the affordance branch, set `Affordance = undefined` for the `hasBody`
  (idle) case (keeping `affordanceTone = 'body'`); drop the now-unused `isOpen` local; update the
  module JSDoc + precedence comment.
- `styles.css`: delete the caret-hiding rule and rewrite the affordance comment.

### Decisions

- **Decision**: The `Collapsible` slot owns the caret; the substrate emits none.
  - **Why**: it is registry-uniform (the slot always renders the disclosure trigger) and removes the
    registry-specific `display:none` hack.
  - **Alternatives considered**: a `showCaret` contract prop (rejected — adds API surface for a
    decision the slot already implies); keep hiding the slot caret and let the substrate own it
    (rejected — breaks for host overrides with a different caret class).

### Non-Goals

- No change to grouping, summaries, timers, or block dispatch.
- No new or removed icons.

## Tasks

- [ ] CollapsibleRow: affordance precedence drops the caret (idle bodied → no icon); remove unused
      `isOpen`; update JSDoc/comments
- [ ] styles.css: delete `.chat-row .chat-collapsible-caret{display:none}` + comment; update
      affordance comment
- [ ] Specs: component-registry (Collapsible owns caret), message-rendering (affordance precedence +
      scenario) + changelog rows
- [ ] Tests: CollapsibleRow affordance (no body/filler icon; active/flash icons), injection-safe
      single-caret test, headless Collapsible caret open/closed

## Open Questions

- [ ] None.

## References

- Spec: [message-rendering](../specs/message-rendering/),
  [component-registry](../specs/component-registry/)
- Related: [0003-component-registry](./0003-component-registry.md),
  [0004-message-rendering](./0004-message-rendering.md)
