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
packages/chat/   @fx/chat — the published, ESM + .d.ts library
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
- `@fx/chat/styles.css` — optional base stylesheet defining default values for the package's
  `--chat-*` CSS custom properties; hosts may override every variable.

React (`react`, `react-dom`) is a peer dependency; the package supports React 18 and 19 and
bundles no UI kit, icon set, or markdown engine.

## License

MIT
