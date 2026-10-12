# Architecture

## Overview

`@fx-/chat` is a framework-light, **design-system-agnostic** React component library for
rendering and composing LLM chat conversations — messages, reasoning, tool calls, status
lifecycle, and a headless input composer. The package MUST NOT depend on any particular UI
kit (no `@fx/ui`, no shadcn/ui, no Material, etc.), MUST NOT reference any consuming
application's data layer, routes, stores, or server, and MUST render correctly when given
only its own primitives. Every visual atom and icon is supplied by the host through an
injected component registry (see [component-registry](../component-registry/)).

This spec covers **project-level concerns only**: identity, repository layout, build and
distribution, entry points, tooling, and the testing conventions that every change document
references. Feature behavior lives in the feature specs.

## Background

The package originates as an extraction of a working chat UI from a private application. The
goals of the extraction are:

- **Primitive, not product** — ship the rendering and composition primitives, leave product
  glue (data fetching, routing, persistence, auth, model/tool pickers, generative-UI,
  job/wake timelines) to the host.
- **Open-source clean** — the published package and its demos MUST contain no reference to
  any internal/private application: no internal names, routes, endpoints, schema, or
  domain concepts. This is a hard requirement, enforced in review.
- **Swappable design system** — the same conversation MUST render through `@fx/ui`, through
  shadcn/ui, and through the package's own unstyled defaults, with no change to the package
  itself. The three demos (see [demos](../demos/)) are the falsifiability test for this.

Related specs:
- [message-model](../message-model/) — the normalized, transport-agnostic data model.
- [component-registry](../component-registry/) — the injection/theming contract.
- [message-rendering](../message-rendering/) — block renderers, streaming, timeline grouping.
- [input-composer](../input-composer/) — headless composer + completion providers.
- [demos](../demos/) — the three static GitHub Pages demos.

## Requirements

### Package Identity

- The published package MUST be named `@fx-/chat`.
- The package MUST be distributed as ESM. It MAY additionally ship CJS, but ESM is REQUIRED.
- The package MUST ship type declarations (`.d.ts`) for every public entry point.
- React MUST be a peer dependency (`react`, `react-dom`), not a bundled dependency. The
  package MUST support React 18 and 19.
- The package MUST NOT bundle or peer-depend on any UI component kit, icon set, or markdown
  engine. Such things are supplied by the host via the registry or as injected slots.
- The package MUST NOT import from any non-published module path of a consuming application
  (no deep imports, no `@/…` aliases, no server modules).

#### Scenario: No design-system dependency leaks

- **GIVEN** the built package and its `package.json`
- **WHEN** its `dependencies` and `peerDependencies` are inspected
- **THEN** no UI kit (`@fx/ui`, shadcn/ui packages, MUI, etc.), no icon set, and no markdown
  engine appears in either list.

#### Scenario: No private-application references

- **GIVEN** the entire published source and the demo sources
- **WHEN** they are grep'd for internal application names, routes, or schema identifiers
- **THEN** zero matches are found.

### Entry Points

- The package MUST expose a small number of named entry points via the `exports` map. At
  minimum:
  - `.` — the root: provider, message log, block renderers, composer, hooks, types.
  - `./headless` — the default unstyled component registry (zero design-system deps).
  - `./structure.css` — a small stylesheet shipping ONLY layout mechanics (animation
    `@keyframes`, the mention-overlay alignment box, the lightbox + completion-popup
    fixed-overlay positioning, a `prefers-reduced-motion` guard). It carries NO visual theme.
    The package MUST ship this entry; importing it is OPTIONAL for hosts (the headless registry
    renders without it, and a host that uses only the transcript with its own composer/lightbox
    and a full `classNames` theme needs none of it).
- The package MUST ship NO visual theme CSS. All visual styling (colors, fonts, spacing, radius,
  density, role bubbles, the whole transcript look) is host-supplied through the `classNames`
  injection map (see [component-registry](../component-registry/)) applied onto the stable
  `.chat-*` DOM hooks.
- Every entry point MUST be tree-shakeable; importing the composer MUST NOT pull in unrelated
  modules.
- The package MUST NOT expose any block type, hook, or helper that is specific to a consuming
  application's domain (e.g. job/wake timelines, generative-UI). Such concepts are explicitly
  out of scope (see Non-Goals in the relevant change documents).

#### Scenario: Headless import has no UI-kit deps

- **GIVEN** a consumer importing only from `@fx-/chat/headless`
- **WHEN** the dependency graph of that import is resolved
- **THEN** it contains no third-party UI kit or icon set.

### Repository Layout

- The repository MUST be a monorepo containing the libraries, the demo, and the reference
  applications, sharing one lockfile.
- Each published library MUST live under its own directory in `packages/`: `packages/core/`
  (`@fx-/chat-core`, see [chat-core](../chat-core/)), `packages/chat/` (`@fx-/chat`, the React-DOM
  renderers), `packages/agent/` (`@fx-/chat-agent`, see [chat-agent](../chat-agent/)),
  `packages/ink/` (`@fx-/chat-ink`, see [ink-renderer](../ink-renderer/)), and `packages/shadcn/`
  (`@fx-/chat-shadcn`, an optional shadcn/ui host layer for `@fx-/chat`: registry, `classNames`
  theme and design tokens). `@fx-/chat-shadcn` is a consumer of `@fx-/chat`'s public exports, like
  an app; the design-system rules above bind `@fx-/chat`, `@fx-/chat-core` and `@fx-/chat-agent`,
  not it.
- Reference applications MUST live under `apps/`: the Android app (see [mobile-app](../mobile-app/))
  and the terminal app, a `tx` plugin declared by the root `.tx/config.json` marketplace manifest
  (see [terminal-app](../terminal-app/)).
  They are product code: they MAY carry features the libraries deliberately do not, MUST consume the
  libraries only through their public package names, and MUST NOT be published to npm.
- The demo MUST be a **single** static application living under `demos/` (or `apps/`). It MUST
  render the same fixtures through three interchangeable registries supplied as per-design-system
  adapter modules (e.g. `registries/{fx-ui,shadcn,headless}.tsx`), switchable in place and
  side-by-side — not three separate demo directories. See [demos](../demos/).
- The demo MUST consume the library through its public package name (workspace link), never via
  deep relative imports into the library source.
- Documentation MUST live under `docs/` following the spec/change structure described in this
  repository.

#### Scenario: Demo consumes the public surface only

- **GIVEN** the demo application
- **WHEN** its imports of the library are inspected
- **THEN** every import resolves through `@fx-/chat` (or a declared subpath export), and none
  reaches into the library's internal files.

### Build & Distribution

- The library MUST be built by a bundler that emits ESM + `.d.ts` (e.g. `tsdown`/`tsup`).
- The library build MUST be reproducible from a clean checkout with a single command.
- The demos MUST be built as **fully static** sites (e.g. Vite) with no server runtime and no
  backend calls at runtime — all demo conversation data MUST be local fixtures.
- The demo build MUST be deployable to GitHub Pages from a subpath base (the repository's
  Pages URL), i.e. asset paths MUST be base-path aware.

#### Scenario: Static demo build

- **GIVEN** a clean checkout
- **WHEN** the demo build command runs
- **THEN** it produces a static bundle that loads and renders conversations with no network
  requests to any backend.

### Tooling & Code Style

- TypeScript MUST be in strict mode.
- The repository MUST use a single linter/formatter and enforce it in CI.
- The repository MUST NOT depend on any private/internal tooling, registries, or skills to
  build, test, or release.

### Continuous Integration & Deployment

- CI MUST run, on every pull request: type-check, lint, unit tests, library build, and demo
  build.
- A deploy workflow MUST publish the demo build to GitHub Pages on merge to the default
  branch.
- CI MUST fail the PR if any of type-check, lint, tests, or builds fail.

#### Scenario: PR gate

- **GIVEN** a pull request that breaks the type-check
- **WHEN** CI runs
- **THEN** the PR is marked failing and cannot be merged on green.

## Design

### Architecture

```
@fx-/chat-core (packages/core)  pure model, transcript logic, completion contract, DOM-free hooks
        ▲            ▲                    ▲
@fx-/chat (DOM)     @fx-/chat-ink (terminal)   @fx-/chat-agent (OpenAI-compatible runs, tools)
        ▲                  ▲                        ▲
@fx-/chat-shadcn            │                        │
 (packages/shadcn,         │                        │
  optional shadcn/ui look) │                        │
        ▲                  ▲                        ▲
   apps/mobile (Tauri v2 Android)   apps/tui (`tx chat` plugin) — both use the agent

Inside @fx-/chat (modules marked * now live in @fx-/chat-core and are re-exported):
@fx-/chat (packages/chat)
├── model*      normalized Message / ContentBlock / ToolInvocation types + codec
│              (pure, no React, no DOM)                       → message-model spec
├── registry   <ChatProvider>, ChatComponents contract,
│              default headless component set, classNames seam → component-registry spec
├── render     <MessageLog>, block renderers, streaming hooks,
│              timeline grouping                              → message-rendering spec
└── input      headless composer, completion-provider API,
               completion popup, mention parsing             → input-composer spec

demos/ (one static app; design system switchable in place / side-by-side)  → demos spec
└── registries/
    ├── fx-ui     ChatComponents mapped to @fx/ui + its icons
    ├── shadcn    @fx-/chat-shadcn's registry (shadcn/ui + lucide)
    └── headless  the package's own unstyled defaults
```

Layering rule: `@fx-/chat-core` depends on nothing in this repository; renderers and the agent
depend on core; apps depend on public packages only. Within `@fx-/chat`: `model` depends on nothing; `registry` depends on `model`; `render` and
`input` depend on `model` + `registry`; demos depend on the public package only. No layer
may import a host application module.

### Public Surface (high level)

The root entry point exports:
- `ChatProvider`, the `ChatComponents` registry type, and `useChatComponents`.
- `MessageLog` and the individual block renderers.
- `ChatInput` (headless composer) and the completion-provider types + reference provider.
- The model types and codec from [message-model](../message-model/).
- Streaming/util hooks documented in [message-rendering](../message-rendering/).

Exact signatures are defined in the feature specs, which are the authority for their surface.

### Dependency Policy

- `dependencies`: only tiny, framework-agnostic utilities (e.g. a `clsx`-style class joiner).
  Prefer vendoring trivial helpers to avoid runtime deps.
- `peerDependencies`: `react`, `react-dom`.
- Markdown rendering, icons, and all visual primitives: **injected**, never depended upon.

## Testing

This section is the authoritative source for the project's testing conventions. Every change
document's `### Testing Requirements` subsection MUST reference this section.

- The library MUST be tested with a single unit-test runner (Vitest RECOMMENDED) plus
  `@testing-library/react` for component tests.
- Every exported component, hook, and codec function MUST have unit tests covering its
  documented behavior and its GIVEN/WHEN/THEN scenarios.
- Streaming/timing logic MUST be tested with fake timers — no real-clock sleeps in tests.
- Tests MUST NOT contain `.only` or `.skip` in committed code.
- CI MUST run the full suite on every PR and MUST block merge on any failure.
- Coverage: the project SHOULD maintain high coverage on `model`, `registry`, `render`, and
  `input`; a concrete threshold MUST be set in the bootstrapping change and enforced in CI.
- The design-system-agnostic guarantee MUST have an automated test: at least one rendering
  test MUST run the same fixture conversation through two distinct registries (headless +
  one styled stub) and assert structural/semantic output, not pixels.
- The "no private-application references" guarantee SHOULD be enforced by an automated check
  (lint rule or test) over source and demos.

Weakening or skipping any of these rules to land a PR MUST be treated as a defect in the PR,
not in the rule.

## Constraints

- **Browser + SSR safety**: rendering modules MUST be safe to import in an SSR pass; modules
  that touch the DOM (caret measurement, clipboard, scroll) MUST guard for the absence of
  `window`/`document` or be confined to effect/event code paths.
- **No Node-only APIs in client modules**: the library MUST NOT use `node:*`, `fs`,
  `process.env`, or server-only crypto in any module reachable from a browser bundle.
- **Accessibility**: interactive elements (collapsibles, completion popup, composer) MUST be
  keyboard-operable and expose appropriate ARIA roles/attributes.
- **Reduced motion**: animations MUST honor `prefers-reduced-motion`.

## Open Questions

- **Bundler choice** — `tsdown` vs `tsup` vs `unbuild`.
  - Options: `tsdown` (fast, esbuild/rolldown), `tsup` (mature), `unbuild`.
  - Current default: `tsdown` for speed and clean ESM + `.d.ts`, revisit if dual-CJS needed.
- **CSS delivery** — ship a default visual theme vs ship no look at all.
  - Current default (change 0013): the package ships NO visual theme. It ships `./structure.css`
    with layout mechanics only (required); importing it is optional. All visual styling is
    host-supplied via the `classNames` injection map onto the stable `.chat-*` hooks.
- **Markdown contract** — inject a `Markdown` component slot vs accept a render function.
  - Current default: a `Markdown` slot on the registry (see component-registry), so the
    package never depends on a markdown engine.

## References

- [message-model](../message-model/)
- [component-registry](../component-registry/)
- [message-rendering](../message-rendering/)
- [input-composer](../input-composer/)
- [demos](../demos/)
- RFC 2119 — requirement keyword definitions.

## Changelog

| Date | Change | Document |
|------|--------|----------|
| 2026-06-25 | Initial spec created | [0001-bootstrap-monorepo](../../changes/0001-bootstrap-monorepo.md) |
| 2026-06-29 | Package goes fully headless: ships NO visual theme CSS (host-supplied via the `classNames` map onto `.chat-*` hooks); the `./styles.css` export is replaced by `./structure.css` (layout mechanics only) | [0013-headless-styling](../../changes/0013-headless-styling.md) |
| 2026-10-10 | Two-package layout: `@fx-/chat-core` extracted from `@fx-/chat` | [0019-core-extraction](../../changes/0019-core-extraction.md) |
| 2026-10-10 | `@fx-/chat-agent` added | [0020-agent-runtime](../../changes/0020-agent-runtime.md) |
| 2026-10-10 | `apps/` reference applications: the Android app (`apps/mobile`) | [0021-mobile-app](../../changes/0021-mobile-app.md) |
| 2026-10-10 | `@fx-/chat-ink` and the `tx chat` terminal app (`apps/tui`, root `.tx/config.json`) added | [0022-ink-renderer](../../changes/0022-ink-renderer.md) |
| 2026-10-11 | `@fx-/chat-shadcn` added (`packages/shadcn`); the demo's shadcn registry and the Android app consume it | [0036-shadcn-package](../../changes/0036-shadcn-package.md) |
