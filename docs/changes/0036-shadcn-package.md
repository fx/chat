# 0036: Shadcn Package

## Summary

Add `@fx/chat-shadcn` (`packages/shadcn`), a ready-made shadcn/ui host layer for `@fx/chat`: the component registry (Radix-backed primitives, lucide icons, a hardened react-markdown slot, code views), the `classNames` theme (Tailwind v4 utilities) and the design tokens (`theme.css`). The chat demo's shadcn registry and the Android app, which each carried a copy of this layer, now consume the package. `@fx/chat` stays headless; this is just another host.

**Spec:** [architecture](../specs/architecture/), [component-registry](../specs/component-registry/), [demos](../specs/demos/), [mobile-app](../specs/mobile-app/)
**Status:** complete
**Depends On:** 0006, 0013, 0021

## Motivation

The Android app (`apps/mobile/src/chat/`) and the demo (`demos/chat-demo/src/registries/shadcn*`, `shared/`) each held the same shadcn layer: primitives, the lucide icon map, the markdown slot, code views and the Tailwind `classNames` theme. Two copies drift, and anyone wanting a sensible default look had to copy it a third time. One package gives both a single source and makes the look adoptable whole, without putting any visual decision into `@fx/chat`.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[Architecture § Testing](../specs/architecture/index.md#testing)). CI enforces these as merge gates.

### Functional requirements

- New workspace package `@fx/chat-shadcn` (ESM + `.d.ts` via tsdown; `./theme.css` export; peer `@fx/chat`, React 18/19, Tailwind v4). It imports `@fx/chat` only through its public exports.
- `createShadcnComponents({ touch, tooltipDelay, copyResetMs })` and the default `shadcnComponents` registry. `touch` keeps 44px disclosure rows and drops the hover tint.
- `shadcnClassNames`: the `classNames` theme, unchanged from both copies.
- `MarkdownView`: the app's hardened markdown slot (GFM, raw HTML skipped, remote images inert), which the demo now gets too.
- `theme.css`: shadcn tokens, system dark mode with `.dark`/`.light` subtree overrides, a `dark` variant covering both, and `@source` for the package's bundle so consumers generate its utilities.
- The primitives (`Button`, `Badge`, `Avatar`, `Collapsible`, `ScrollArea`, `Tooltip`), `cn`, `lucideIcons`, `CodeBlock` and `JsonView` are exported so an app shell can share them.
- The Android app uses `createShadcnComponents({ touch: true, tooltipDelay: 300 })`, `shadcnClassNames` and `theme.css`; its local copy is removed.
- The demo's shadcn pane uses `shadcnComponents`; every pane uses `shadcnClassNames`; the fx-ui adapter reuses the package's code, markdown and icon slots. Each pane carries `.light`/`.dark` and the page is pinned light.
- The root `build` builds `@fx/chat-shadcn` after `@fx/chat`; the root `tsconfig.json` and `vitest.config.ts` include it (100% coverage applies). The README describes it.

## Design

### Decisions

- **A host layer, not part of `@fx/chat`.** The package depends on `@fx/chat`'s public API the same way an app does; `@fx/chat`, `@fx/chat-core` and `@fx/chat-agent` gain nothing.
- **Tokens ship as source CSS.** Tailwind v4 does not scan `node_modules`, so `theme.css` points `@source` at the package's built bundle; consumers import it after Tailwind.
- **Touch is an option, not a fork.** One registry factory serves pointer (demo) and touch (app) hosts.

### Non-Goals

Publishing `@fx/chat-shadcn` to GitHub Packages (the publish workflow is unchanged); any visual redesign of the moved layer.

## Tasks

- [x] `packages/shadcn`: registry factory, `classNames`, markdown, code views, icons, primitives, `theme.css`, build and tests
- [x] Android app consumes `@fx/chat-shadcn` (touch mode); local copy removed
- [x] Demo consumes `@fx/chat-shadcn`; local shadcn and shared copies removed; panes pinned light/dark
- [x] Root build, tsconfig and vitest wiring; README; specs and indexes
