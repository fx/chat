# Component Registry

## Overview

The component registry is the mechanism that makes `@fx/chat` design-system-agnostic. Every
visual atom (button, badge, tooltip, collapsible, code/JSON viewer, avatar, scroll container)
and every icon and the markdown renderer are **injected by the host** through a single
`ChatComponents` registry provided via `<ChatProvider>`. The package's renderers know the
*semantics* of each block but never hard-code a styled primitive or icon. The package MUST
ship a complete **headless default** registry so it renders with zero host configuration.

The package is fully HEADLESS (change 0013): it ships NO visual theme. All visual styling —
colors, fonts, spacing, radius, density, role bubbles, the whole transcript look — is supplied
by the host through the `classNames` injection map, applied onto the stable `.chat-*` DOM hooks
(see [classNames Injection](#classnames-injection)).

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

- New semantic icons MUST be added as OPTIONAL registry entries with a headless fallback, outside the
  original `IconName` set (as `OptionalIconName`), so host code typed against the earlier icon set
  (including `Record<IconName, …>` maps) keeps compiling and renders the fallback until it maps the
  new name. The `checklist` icon (plan blocks) is the first such icon.

### Markdown Contract

- The registry MUST include a `Markdown` slot: a component receiving at least
  `{ content: string; streaming?: boolean }`.
- The package MUST NOT depend on any markdown engine. The headless default `Markdown` MUST
  render content safely with a minimal built-in approach (e.g. escaped text with basic
  formatting) and MUST be overridable by a full engine (the demos MAY wire a real one).
- Assistant text and reasoning MUST render through `Markdown`; user text MUST render as plain
  text with mention highlighting (see input-composer), not through `Markdown`.

### classNames Injection (Styling Mechanism)

The package is HEADLESS (change 0013): it ships NO visual theme. The host supplies ALL visual
styling — colors, fonts, spacing, radius, density, role bubbles, the whole transcript look —
through the `classNames` injection map, applied onto the stable `.chat-*` DOM hooks. The
headless primitives are unstyled semantic HTML carrying those stable hooks.

- The package MUST expose a `ChatClassNames` map with one OPTIONAL key per stable `.chat-*`
  render hook (the `chat-` prefix stripped, camelCased; e.g. `text`, `message`, `gutterTime`,
  `lightbox`, `inputTextarea`). It is threaded through React context by the
  `<ChatProvider classNames={…}>` prop.
- Each render component MUST append its matching `classNames` value AFTER the stable `.chat-*`
  class so a host styles every element with its own design system WITHOUT losing the stable
  hooks. Every key MUST be OPTIONAL: an absent key appends nothing, leaving output
  byte-identical to the unstyled default.
- The key names MUST be generic and design-system-agnostic (no host/app coupling).
- Nested `<ChatProvider>`s MUST shallow-merge `classNames` (an inner provider overrides only
  the keys it supplies). With no `classNames`, the injected map MUST be empty and rendering
  MUST still be valid (unstyled semantic HTML on the stable hooks).
- Role styling (user/assistant bubbles), font, density, colors, radius, and focus rings are
  ALL host concerns supplied via `classNames` — the package MUST NOT ship any of them.

#### Scenario: Restyle without component overrides

- **GIVEN** a host using the headless registry
- **WHEN** the host passes a `classNames` map (e.g. `{ text: 'host-bubble', message: 'host-row' }`)
  to `<ChatProvider>`
- **THEN** each element carries both its stable `.chat-*` hook AND the host class, and an
  element whose key is absent carries only its stable hook — the host themes the surface with
  no registry/component change.

### Focus Visibility (a11y)

- Every focusable interactive control carries a stable `.chat-*` hook (buttons `.chat-button`,
  the copy control `.chat-copybutton`, the disclosure `<summary>` trigger
  `.chat-collapsible-header`, the attachment thumb/download affordances, and the lightbox close),
  and MUST be themeable via a `classNames` key so a host CAN style a visible `:focus-visible`
  indicator without overriding components.
- Because the package is headless (change 0013), the focus-ring VISUALS are a host concern
  supplied through `classNames` — the package ships no focus-ring CSS. The accessibility
  requirement is that the controls remain keyboard-operable and individually targetable so the
  host can paint a ring on each.
- Controls with a non-focus keyboard model are excluded: the completion popup options never
  take focus because focus remains in the textarea and the active option is tracked via
  `aria-activedescendant`.

#### Scenario: Host can paint a focus ring on every control

- **GIVEN** a host that supplies `classNames` for the focusable controls
- **WHEN** a keyboard user tabs to a button, the copy control, the disclosure summary, or an
  attachment download affordance
- **THEN** each control carries its stable `.chat-*` hook plus the host class, so the host's
  `:focus-visible` styling applies — with no registry/component change.

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
| 2026-06-28 | Required a visible, token-driven `:focus-visible` ring (via `--chat-accent`) on every focusable package control (button, copy, collapsible summary, attachment thumb/download, lightbox close); completion popup excluded (aria-activedescendant model) | [0009-visual-density-parity](../../changes/0009-visual-density-parity.md) |
| 2026-06-29 | Package goes fully headless: the styling mechanism is the `classNames` injection map onto the stable `.chat-*` hooks (not shipped CSS-var theme tokens). The default theme (font, role bubbles, density, focus rings) is removed; visual styling — including focus rings — is host-supplied via `classNames` | [0013-headless-styling](../../changes/0013-headless-styling.md) |
| 2026-10-10 | Optional icons with headless fallback; `checklist` | [0024-plan-block](../../changes/0024-plan-block.md) |
