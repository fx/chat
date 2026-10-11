# @fx/chat

Framework-light, **design-system-agnostic** React component library for rendering and
composing LLM chat conversations — messages, reasoning, tool calls, status lifecycle, and a
headless input composer.

The library ships only rendering and composition primitives. Every visual atom, icon, and
markdown renderer is supplied by the host through an injected component registry, so the same
conversation can render through any design system with no change to the package.

> Bootstrap stage. This repository currently contains the monorepo scaffolding, build
> pipelines, tooling, and CI. The chat model, registry, renderers, and composer arrive in
> later changes. See [`docs/`](./docs/).

## Repository layout

```
packages/core/   @fx/chat-core — renderer-agnostic model, transcript logic, DOM-free hooks
packages/chat/   @fx/chat — the published React-DOM renderers (re-exports core)
packages/agent/  @fx/chat-agent — UI-free OpenAI-compatible agent runtime + built-in tools (optional)
apps/mobile/     Android reference app (Tauri v2)
demos/chat-demo/  static Vite + React demo (deployed to GitHub Pages under /chat/)
docs/             specs and change documents
scripts/          repository checks (no internal references)
```

## Development

This is a [Bun](https://bun.sh) workspaces monorepo.

```sh
bun install              # install all workspaces from one lockfile

bun run build            # build the library (@fx/chat) → ESM + .d.ts in dist/
bun run build:demo       # build the static demo → demos/chat-demo/dist
bun run typecheck        # strict TypeScript project-references build
bun run check            # Biome lint + format check
bun run check:fix        # Biome lint + format with auto-fix
bun run test             # Vitest unit tests with 100% coverage gate
bun run check:no-internal-refs  # fail on any private-application reference
```

## Public entry points

`@fx/chat` exposes three subpath exports:

- `@fx/chat` — the root surface (provider, renderers, composer, hooks, types).
- `@fx/chat/headless` — the default unstyled registry, with zero design-system dependencies.
- `@fx/chat/structure.css` — optional layout-only stylesheet (animation keyframes, the
  mention-overlay alignment box, and the lightbox/completion positioning). It carries NO theme;
  a host that uses only the transcript and supplies a full `classNames` theme needs none of it.

The package is **headless**: it ships no visual CSS. All styling — colors, fonts, spacing,
radius, density, the whole transcript look — is supplied by the host through the `classNames`
prop on `<ChatProvider>`, applied onto the stable `.chat-*` DOM hooks. React (`react`,
`react-dom`) is a peer dependency; the package supports React 18 and 19 and bundles no UI kit,
icon set, or markdown engine.

## License

MIT
