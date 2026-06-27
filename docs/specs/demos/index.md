# Demos

## Overview

The demos are a single, fully static site that showcases `@fx/chat` rendered through three
interchangeable design systems — `@fx/ui`, shadcn/ui, and the package's own headless defaults
— switchable in place and viewable side-by-side. The site MUST deploy to GitHub Pages, MUST be
purely demonstrative (no marketing, no sales copy), and MUST look polished and compact. Its
primary job is to **prove design-system agnosticism**: the same fixture conversations render
through each registry with no change to the library.

## Background

Per [architecture](../architecture/), the package injects every visual primitive, icon, and
the markdown renderer via the [component-registry](../component-registry/). The three demos are
the falsifiability test: if any conversation cannot render through all three registries without
touching the library, the registry seam is in the wrong place. The demo requirements are: three
registries (fx/ui, shadcn/ui, defaults), toggleable in place to compare or render side-by-side
(whichever is simpler to build well); deployed to GitHub Pages; slick and compact; explicitly
**not** a marketing page.

## Requirements

### Single Static Site, Three Registries

- The demo MUST be one static application (no backend) that can render the chat surface
  through each of three registries: `fx-ui`, `shadcn`, and `headless`.
- The active design system MUST be switchable in place (a control that swaps the registry
  without reloading) AND the demo MUST offer a side-by-side comparison view rendering the
  same conversation through two or three registries at once.
- Switching the design system MUST change only the injected registry; the library code,
  fixtures, and message model MUST be identical across all three.
- All conversation data MUST come from local fixtures bundled at build time. The demo MUST
  make no runtime network request to any backend.

#### Scenario: Same fixture, three registries

- **GIVEN** the side-by-side view with a selected fixture conversation
- **WHEN** it renders through `fx-ui`, `shadcn`, and `headless`
- **THEN** all three render the same messages, blocks, tool calls, and grouping, differing
  only in visual presentation supplied by each registry.

#### Scenario: In-place switch

- **GIVEN** the single-pane view showing the `headless` registry
- **WHEN** the user switches to `shadcn`
- **THEN** the same conversation re-renders with shadcn primitives and icons, with no library
  change and no page reload.

### Content & Tone

- The site MUST contain no marketing, persuasion, or sales language. Copy MUST be limited to
  concise, functional labels (component/feature names, fixture names, registry names, short
  captions).
- The site SHOULD demonstrate the breadth of the surface: at minimum a conversation exercising
  user text + attachments, assistant markdown, reasoning, a multi-tool grouped turn (with a
  `+N` collapsed disclosure), an error tool call, a streaming/active state, and the composer
  with the reference completion provider.
- The site SHOULD include a compact controls strip to toggle: registry, single vs side-by-side,
  light/dark, grouped vs flat, verbose/expanded, and minimal/density.

#### Scenario: No marketing copy

- **GIVEN** the rendered demo
- **WHEN** its text content is reviewed
- **THEN** it contains only functional/demonstrative labels and captions — no slogans,
  value-propositions, or calls to action.

### Polish

- The demo MUST be visually polished and compact: deliberate spacing, alignment, typography,
  and a coherent light/dark theme per registry.
- The demo MUST be responsive and usable on small viewports (side-by-side MAY collapse to a
  stacked/switchable layout on narrow screens).
- Interactive states (hover, focus-visible, active, disabled, loading, empty) MUST be polished
  across all three registries.
- The streaming demo MUST animate using the library's timing hooks and MUST honor
  `prefers-reduced-motion`.

#### Scenario: Responsive side-by-side

- **GIVEN** the side-by-side view on a narrow viewport
- **WHEN** it renders
- **THEN** it remains usable (e.g. stacks or exposes a switcher) without horizontal overflow.

### GitHub Pages Deployment

- The demo build MUST be a static bundle deployable to GitHub Pages under the repository's
  Pages subpath, with base-path-aware asset URLs.
- A CI workflow MUST build and publish the demo to GitHub Pages on merge to the default
  branch.
- The deployed site MUST load and run with no backend and no external API calls.

#### Scenario: Subpath base

- **GIVEN** the demo deployed at a repository Pages subpath
- **WHEN** the page loads
- **THEN** all assets resolve correctly under the subpath and the app renders.

### Real Markdown & Icons (Demo Wiring)

- Each demo registry MUST supply a real icon set (e.g. fx/ui's icons, lucide for shadcn) and
  MAY wire a real markdown engine via the registry `Markdown` slot, demonstrating that these
  are host-injected and not library dependencies.
- The `headless` registry in the demo MUST use the package's built-in defaults to show the
  zero-dependency baseline.

## Design

### Architecture

```
demo (static Vite app)
├── fixtures/         local ChatMessage[] conversations (no backend)
├── registries/
│   ├── fx-ui.tsx     ChatComponents mapped to @fx/ui + its icons
│   ├── shadcn.tsx    ChatComponents mapped to shadcn/ui + lucide
│   └── headless.tsx  re-export of @fx/chat/headless
├── App.tsx           controls strip + single/side-by-side panes
└── deploy: GitHub Actions → Pages (base-path aware)
```

### UI Components

- A compact top controls strip (registry select, layout toggle, theme, grouped/flat, verbose,
  minimal/density).
- A pane component wrapping `<ChatProvider components={registry}>` around `MessageLog` +
  `ChatInput`, instantiated once (single) or two/three times (side-by-side).
- A fixture switcher.

### Business Logic

- Switching registry/layout/theme is local UI state; fixtures are static imports.
- The streaming fixture drives the library timing hooks from synthetic timestamps to show live
  timers/tokens-per-second without any backend.

## Constraints

- No backend, no runtime API calls, no analytics, no marketing.
- The demo MUST consume `@fx/chat` through its public package name only (per architecture).
- Demo registries are the canonical worked examples of adapters; they MUST stay thin mappings.

## Open Questions

- **Side-by-side vs in-place priority** — the user allowed "whichever is easier".
  - Current default: implement in-place switching first (simplest, proves the seam), then add a
    side-by-side compare view; ship both if side-by-side is cheap.
- **Markdown engine for demos** — which engine to wire for fx-ui/shadcn panes.
  - Current default: a small, popular React markdown renderer; headless stays on the built-in.
- **Theme source** — per-registry theme vs one shared token set.
  - Current default: each registry brings its own theme; headless uses the package CSS vars.

## References

- [architecture](../architecture/)
- [component-registry](../component-registry/)
- [message-rendering](../message-rendering/)
- [input-composer](../input-composer/)

## Changelog

| Date | Change | Document |
|------|--------|----------|
| 2026-06-25 | Initial spec created | [0006-demos](../../changes/0006-demos.md) |
| 2026-06-27 | Added a Minimal/density toggle to the controls strip, threaded to `MessageLog` across all three registries | [0011-minimal-density-mode](../../changes/0011-minimal-density-mode.md) |
