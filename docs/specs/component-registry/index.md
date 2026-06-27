# Component Registry

## Overview

The component registry is the mechanism that makes `@fx/chat` design-system-agnostic. Every
visual atom (button, badge, tooltip, collapsible, code/JSON viewer, avatar, scroll container)
and every icon and the markdown renderer are **injected by the host** through a single
`ChatComponents` registry provided via `<ChatProvider>`. The package's renderers know the
*semantics* of each block but never hard-code a styled primitive or icon. The package MUST
ship a complete **headless default** registry so it renders with zero host configuration.

## Background

In the extraction source the only design-system couplings were two primitives (`Button`,
`Badge`); everything else was hand-rolled utility classes and a fixed icon set. To support
`@fx/ui`, shadcn/ui, and an unstyled default from one codebase, those couplings — and the
icon set, and the markdown engine — MUST become injectable. The registry is the contract that
the three demos ([demos](../demos/)) exercise to prove agnosticism.

Related: [message-rendering](../message-rendering/) and [input-composer](../input-composer/)
consume the registry; [architecture](../architecture/) forbids depending on any UI kit.

## Requirements

### Provider

- The package MUST export a `ChatProvider` whose `components` prop is OPTIONAL and accepts a
  partial registry (`components?: Partial<ChatComponents>`, with a deep-partial `icons` map). It
  merges the supplied entries over the inherited registry (headless defaults at the root, or the
  parent provider's effective registry when nested) and makes the effective registry available
  to all descendant renderers via React context. Rendering `<ChatProvider>` with no `components`
  MUST be valid and MUST behave as the headless default.
- Renderers MUST read primitives, icons, and the markdown renderer exclusively from this
  context (via a `useChatComponents()` hook), never via direct import.
- A `ChatProvider` MUST be allowed to receive a **partial** registry; missing entries MUST
  fall back to the inherited registry (the parent provider's effective registry when nested, or
  the headless defaults at the root), so hosts override only what they care about.
- Nesting `ChatProvider`s MUST shallow-merge: an inner provider overrides only the keys it
  supplies.

#### Scenario: Partial override falls back to defaults

- **GIVEN** a `ChatProvider` supplied only a custom `Button`
- **WHEN** a renderer needs a `Badge`
- **THEN** the headless default `Badge` is used, and the custom `Button` is used wherever a
  button is needed.

#### Scenario: Renderers never import primitives directly

- **GIVEN** the rendering and input source modules
- **WHEN** their imports are inspected
- **THEN** no styled primitive or icon set is imported directly; all come from the registry.

### Primitive Contract

- `ChatComponents` MUST define a minimal, stable set of primitive slots. The set MUST be
  kept small (roughly ten) to keep adapters cheap. At minimum:
  - `Button` — pressable; supports `onClick`, `disabled`, an `aria-label`, and children.
  - `Badge` — small status/label chip.
  - `Tooltip` — wraps a trigger and shows content on hover/focus (MAY be a no-op passthrough
    in the headless default).
  - `Collapsible` — a disclosure with a header trigger and a body; controlled and
    uncontrolled use MUST both be supported. The `Collapsible` slot OWNS the disclosure
    caret/chevron: the headless default renders its own caret in the summary; a host override
    renders its own caret or none (a host override MAY legally omit a caret). The render-layer
    substrate (`CollapsibleRow`) MUST NOT render a disclosure caret — caret rendering is owned
    solely by the `Collapsible` slot, so the substrate never adds a second one regardless of the
    injected registry.
  - `CodeBlock` — renders preformatted code/text with OPTIONAL language.
  - `JsonView` — renders a (possibly large) JSON value in a collapsible/scrollable view;
    MAY be implemented on top of `CodeBlock`.
  - `ScrollArea` — a scroll container for the message log and popups.
  - `Avatar` — OPTIONAL role/author indicator.
  - `CopyButton` — copy-to-clipboard affordance with a copied state (MAY be composed from
    `Button` + an icon).
  - `Lightbox` (a.k.a. `ImageOverlay`) — OPTIONAL overlay slot that displays an enlarged image
    over the conversation for the attachment image grid (see
    [message-rendering › User Attachments](../message-rendering/)). It MUST receive at least
    `{ src; alt; open; onClose }`, MUST be keyboard-dismissable, MUST trap focus while open and
    restore it on close, and MUST honor `prefers-reduced-motion`. The headless default MUST
    implement a self-contained accessible overlay (no third-party dependency); hosts MAY
    override it with their own dialog/lightbox. (Proposed in
    [0008-attachment-rendering](../../changes/0008-attachment-rendering.md); not yet
    implemented.)
- Each primitive's props MUST be defined as a stable interface so adapters are pure mappings.
- Primitives MUST forward a `className` and/or accept style hooks so hosts can theme them, but
  the package MUST NOT require any particular class names.

#### Scenario: Adapter is a pure mapping

- **GIVEN** a host design system with its own `Button`
- **WHEN** the host writes a registry entry for `Button`
- **THEN** the entry is a thin function/component mapping the contract props to the host
  component, with no package-internal knowledge required.

### Icon Contract

- The registry MUST include an `icons` map covering every semantic icon the renderers use
  (e.g. `spinner`, `check`, `caretRight`, `caretDown`, `copy`, `wrench`, `brain`, `gear`,
  `regenerate`, `fork`, `reset`, `file`, `audio`, `video`, `send`, `stop`, `paperclip`,
  `close`, and — for attachment affordances — `download` and `expand`).
- Each icon slot MUST accept a `className` and a size, and MUST be replaceable by any icon
  library's component or an inline SVG.
- The headless default icon set MUST be self-contained (inline SVGs), introducing no icon
  dependency.

#### Scenario: Swapping icon libraries

- **GIVEN** the fx-ui demo using one icon set and the shadcn demo using another
- **WHEN** each supplies its own `icons` map
- **THEN** the same renderers display each demo's icons with no package change.

### Markdown Contract

- The registry MUST include a `Markdown` slot: a component receiving at least
  `{ content: string; streaming?: boolean }`.
- The package MUST NOT depend on any markdown engine. The headless default `Markdown` MUST
  render content safely with a minimal built-in approach (e.g. escaped text with basic
  formatting) and MUST be overridable by a full engine (the demos MAY wire a real one).
- Assistant text and reasoning MUST render through `Markdown`; user text MUST render as plain
  text with mention highlighting (see input-composer), not through `Markdown`.

### Theme Tokens

- The package's headless visuals MUST be driven by CSS custom properties (e.g.
  `--chat-fg`, `--chat-muted`, `--chat-accent`, `--chat-border`, `--chat-error`,
  `--chat-success`, `--chat-radius`), with sensible light/dark defaults.
- `--chat-font-family` MUST default to `inherit` so the chat surface adopts the host page's
  font rather than forcing a system stack. The `font-family: var(--chat-font-family)` override
  seam MUST remain on the headless primitives so a host can still restyle the whole surface by
  redefining the single token.
- The token set MUST include role-bubble tokens so a turn reads as a conversation:
  `--chat-user-bubble-bg` / `--chat-user-bubble-fg` (the user's sent bubble, defaulting to the
  accent surface), `--chat-assistant-bubble-bg` / `--chat-assistant-bubble-fg` (the assistant's
  received bubble on a subtle neutral surface), and `--chat-bubble-max-width`. They MUST have
  light AND dark defaults, and the `:root` and `[data-theme="light"]` token sets MUST stay
  identical (a smoke/parity test enforces this across the full token set).
- Hosts MUST be able to restyle the headless defaults entirely by redefining these variables,
  without overriding components.
- The package MUST ship `@fx/chat/styles.css` defining default variable values; importing it is
  OPTIONAL for hosts (the headless registry renders without it, and hosts MAY override every
  variable).

#### Scenario: Restyle without component overrides

- **GIVEN** a host using the headless registry
- **WHEN** the host redefines the CSS custom properties in its own stylesheet
- **THEN** the chat surface adopts the new colors/spacing with no registry changes.

### Headless Default Registry

- The package MUST export a complete default registry (`@fx/chat/headless`) implementing every
  primitive, icon, and the markdown slot with no third-party UI/icon/markdown dependency.
- `ChatProvider` used with no `components` prop MUST behave as if given the headless default.

#### Scenario: Zero-config render

- **GIVEN** `<ChatProvider><MessageLog messages={…} /></ChatProvider>` with no registry
- **WHEN** it renders
- **THEN** the conversation renders fully using headless defaults and no UI-kit dependency is
  pulled in.

## Design

### Architecture

```
<ChatProvider components={registry}>      ← merges registry over inherited (parent/headless)
  context: { ...primitives, icons, Markdown }
        ▲ useChatComponents()
  <MessageLog> / block renderers / <ChatInput>   ← read everything from context
```

### Data Models

Illustrative contract (authoritative slot set; prop details finalized in implementation):

```ts
interface ChatComponents {
  Button: ComponentType<{ onClick?: () => void; disabled?: boolean;
    'aria-label'?: string; className?: string; children?: ReactNode }>
  Badge: ComponentType<{ tone?: 'default' | 'error' | 'success';
    className?: string; children?: ReactNode }>
  Tooltip: ComponentType<{ content: ReactNode; children: ReactNode }>
  Collapsible: ComponentType<{ open?: boolean; defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void; header: ReactNode; children?: ReactNode }>
  CodeBlock: ComponentType<{ code: string; language?: string; className?: string }>
  JsonView: ComponentType<{ value: unknown; className?: string }>
  ScrollArea: ComponentType<{ className?: string; children?: ReactNode }>
  Avatar?: ComponentType<{ role: Role; className?: string }>
  CopyButton: ComponentType<{ value: string; className?: string }>
  Lightbox?: ComponentType<{ src: string; alt: string; open: boolean;
    onClose: () => void; className?: string }>   // attachment image overlay (0008)
  // `alt` is REQUIRED: callers MUST always pass an alt string, falling back to the
  // attachment `name` (or a generic label when unnamed) so the overlay is accessible.
  Markdown: ComponentType<{ content: string; streaming?: boolean }>
  icons: Record<IconName, ComponentType<{ className?: string; size?: number }>>
}

type IconName =
  | 'spinner' | 'check' | 'caretRight' | 'caretDown' | 'copy' | 'wrench'
  | 'brain' | 'gear' | 'regenerate' | 'fork' | 'reset' | 'file' | 'audio'
  | 'video' | 'send' | 'stop' | 'paperclip' | 'close' | 'download' | 'expand'
```

### Business Logic

- **Merge semantics** — `ChatProvider` merges its `components` over the **inherited** registry
  from context (which is the headless defaults at the root, or the parent provider's effective
  registry when nested), so nested providers override only the keys they supply and preserve
  outer overrides:
  `{ ...inherited, ...components, icons: { ...inherited.icons, ...components?.icons } }` where
  `inherited = useChatComponents() ?? headlessDefaults`.
- **No styled assumptions** — renderers pass only contract props; any visual nuance the host
  wants lives in the host's component, not in the package.

## Constraints

- The headless registry MUST add no runtime dependency beyond React.
- `Tooltip` and `Avatar` MAY be passthrough/no-op in headless mode but MUST still satisfy the
  type contract so adapters can enrich them.
- All registry components MUST be SSR-safe.

## Open Questions

- **Registry size** — exact final slot list (e.g. whether `ScrollArea`/`Avatar` are required
  or optional).
  - Current default: keep required slots ~10; `Avatar` optional.
- **Markdown default fidelity** — how much formatting the headless `Markdown` should support.
  - Current default: minimal safe rendering (paragraphs, code fences, inline code, links),
    with full engines supplied by hosts/demos.

## References

- [architecture](../architecture/)
- [message-rendering](../message-rendering/)
- [input-composer](../input-composer/)
- [demos](../demos/)

## Changelog

| Date | Change | Document |
|------|--------|----------|
| 2026-06-25 | Initial spec created | [0003-component-registry](../../changes/0003-component-registry.md) |
| 2026-06-26 | Added OPTIONAL `Lightbox`/`ImageOverlay` slot and `download`/`expand` icons for attachment rendering — not yet implemented | [0008-attachment-rendering](../../changes/0008-attachment-rendering.md) |
| 2026-06-27 | Defaulted `--chat-font-family` to `inherit` and added role-bubble theme tokens (`--chat-user-bubble-*`, `--chat-assistant-bubble-*`, `--chat-bubble-max-width`) with light/dark defaults | [0009-visual-density-parity](../../changes/0009-visual-density-parity.md) |
| 2026-06-27 | Clarified the `Collapsible` slot is the SOLE owner of the disclosure caret; the render substrate MUST NOT render one | [0010-single-caret-disclosure](../../changes/0010-single-caret-disclosure.md) |
