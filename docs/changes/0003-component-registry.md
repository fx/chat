# 0003: Component Registry, Provider & Headless Defaults

## Summary

Implement `<ChatProvider>`, the `ChatComponents` registry contract (primitives + icons +
`Markdown` slot), the `useChatComponents()` hook with partial-override merge semantics, the
complete headless default registry (zero UI-kit/icon/markdown deps), and the CSS custom-property
theme tokens.

**Spec:** [component-registry](../specs/component-registry/)
**Status:** draft
**Depends On:** 0001

## Motivation

This is the seam that makes the package design-system-agnostic. Renderers (0004) and the
composer (0005) read every visual atom and icon from this registry. Without it they would
hard-code a UI kit.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[architecture › Testing](../specs/architecture/index.md#testing)). CI enforces these as merge
gates:

- Component tests via `@testing-library/react` MUST cover provider merge semantics, partial
  overrides, and headless defaults.
- A test MUST assert the headless registry import introduces no UI-kit/icon/markdown
  dependency.
- All headless components MUST be tested as SSR-safe (render without `window`).
- No `.only`/`.skip`; coverage at or above the configured threshold.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not
in the rule.

### Provider & Hook

- The package MUST export `ChatProvider`, `useChatComponents`, and the `ChatComponents` type.
- A partial registry MUST shallow-merge over the **inherited** registry — the parent provider's
  effective registry when nested, or the headless defaults at the root — including a deep merge
  of the `icons` map; nested providers MUST override only supplied keys and MUST preserve outer
  overrides.

#### Scenario: Partial override

- **GIVEN** a provider supplying only `Button`
- **WHEN** a renderer needs `Badge`
- **THEN** the headless `Badge` is used.

### Primitive, Icon, Markdown Contracts

- The package MUST define the primitive slot interfaces, the `icons` map with all semantic
  icon names, and the `Markdown` slot per the spec.
- Renderers/composer MUST consume these only via context (enforced by a lint rule/test that no
  styled primitive or icon set is imported in render/input modules).

### Headless Defaults & Theme

- The package MUST export `@fx/chat/headless`: every primitive, an inline-SVG icon set, and a
  minimal safe `Markdown`.
- The headless visuals MUST be driven by documented CSS custom properties with light/dark
  defaults; the package MUST ship `@fx/chat/styles.css` with those default values, and importing
  it MUST be OPTIONAL for hosts (the headless registry renders without it).

#### Scenario: Restyle via variables

- **GIVEN** the headless registry
- **WHEN** a host redefines the CSS custom properties
- **THEN** the surface restyles with no component overrides.

## Design

### Approach

- Add `packages/chat/src/registry/`: `context.tsx` (provider + hook + merge), `contract.ts`
  (types), `headless/` (primitives, icons, markdown), `styles.css` (tokens).
- Implement headless primitives with semantic HTML (`button`, `details`/`summary` for
  Collapsible, `pre` for CodeBlock) styled by CSS variables.
- Implement an inline-SVG icon set covering every `IconName`.
- Implement a minimal safe `Markdown` (escape + paragraphs, code fences, inline code, links).

### Decisions

- **Decision**: Headless `Tooltip`/`Avatar` MAY be passthroughs but MUST satisfy the contract.
  - **Why**: keep zero-dep baseline while allowing rich adapters.
  - **Alternatives considered**: omit them (rejected — adapters need stable slots).
- **Decision**: Theme via CSS custom properties, not a JS theme object.
  - **Why**: hosts restyle without re-rendering or prop drilling.
  - **Alternatives considered**: JS theme context (rejected — heavier, less CSS-native).

### Non-Goals

- No block renderers or composer (later changes).
- No real markdown engine or third-party icons in the library.

## Tasks

- [ ] Implement `registry/context.tsx` (`ChatProvider`, `useChatComponents`, merge semantics)
      with tests
- [ ] Implement `registry/contract.ts` (primitive/icon/Markdown interfaces, `IconName`)
- [ ] Implement headless primitives (Button, Badge, Tooltip, Collapsible, CodeBlock, JsonView,
      ScrollArea, Avatar, CopyButton) + minimal `Markdown`, SSR-safe, with tests
- [ ] Implement inline-SVG icon set covering all icon names
- [ ] Implement `styles.css` CSS-variable theme (light/dark) and document the variables
- [ ] Add lint rule/test forbidding direct primitive/icon imports in render/input layers and a
      no-UI-kit-dependency test for the headless import

## Open Questions

- [ ] Final required vs optional slot list (e.g. ScrollArea/Avatar)
- [ ] Headless `Markdown` formatting fidelity

## References

- Spec: [component-registry](../specs/component-registry/)
- Related: [0004-message-rendering](./0004-message-rendering.md),
  [0005-input-composer](./0005-input-composer.md)
