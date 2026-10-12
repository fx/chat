# @fx-/chat

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
packages/core/   @fx-/chat-core — renderer-agnostic model, transcript logic, DOM-free hooks
packages/chat/   @fx-/chat — the published React-DOM renderers (re-exports core)
packages/agent/  @fx-/chat-agent — UI-free OpenAI-compatible agent runtime, built-in tools, conversation controller (optional)
packages/ink/    @fx-/chat-ink — terminal (Ink) renderer
packages/shadcn/ @fx-/chat-shadcn — optional ready-made shadcn/ui look (registry + classNames + tokens)
apps/mobile/     Android reference app (Tauri v2)
apps/tui/        `tx chat` terminal reference app (tx plugin; .tx/config.json)
demos/chat-demo/  static Vite + React demo (deployed to GitHub Pages under /chat/)
docs/             specs and change documents
scripts/          repository checks (no internal references)
```

## Development

This is a [Bun](https://bun.sh) workspaces monorepo.

```sh
bun install              # install all workspaces from one lockfile

bun run build            # build the library (@fx-/chat) → ESM + .d.ts in dist/
bun run build:demo       # build the static demo → demos/chat-demo/dist
bun run typecheck        # strict TypeScript project-references build
bun run check            # Biome lint + format check
bun run check:fix        # Biome lint + format with auto-fix
bun run test             # Vitest unit tests with 100% coverage gate
bun run check:no-internal-refs  # fail on any private-application reference
```

## Releases

The `@fx-/chat*` packages are published to npm in lockstep by
[release-please](https://github.com/googleapis/release-please): conventional commits on `main`
keep a release pull request up to date, and merging it tags the release and publishes every
package at the same version (npm trusted publishing, with provenance).

```sh
npm install @fx-/chat
```

Each release also carries the Android reference app: download `fx-chat-<version>.apk` from the
release's assets on GitHub, open it on the phone and allow installs from that source when Android
asks. Every release is signed with the same key, so a newer APK installs over an older one and
keeps its data. The release app id is `dev.fx.chat`, so it installs alongside the `.debug` build.

## Public entry points

`@fx-/chat` exposes three subpath exports:

- `@fx-/chat` — the root surface (provider, renderers, composer, hooks, types).
- `@fx-/chat/headless` — the default unstyled registry, with zero design-system dependencies.
- `@fx-/chat/structure.css` — optional layout-only stylesheet (animation keyframes, the
  mention-overlay alignment box, and the lightbox/completion positioning). It carries NO theme;
  a host that uses only the transcript and supplies a full `classNames` theme needs none of it.

The package is **headless**: it ships no visual CSS. All styling — colors, fonts, spacing,
radius, density, the whole transcript look — is supplied by the host through the `classNames`
prop on `<ChatProvider>`, applied onto the stable `.chat-*` DOM hooks. React (`react`,
`react-dom`) is a peer dependency; the package supports React 18 and 19 and bundles no UI kit,
icon set, or markdown engine.

### A ready-made look: `@fx-/chat-shadcn`

For a sensible default instead of a custom design system, `@fx-/chat-shadcn` supplies one host
layer whole — the shadcn/ui component registry (Radix primitives, lucide icons, react-markdown
with GFM and network-inert images), the `classNames` theme (Tailwind v4), and the design tokens.
It is just another host: `@fx-/chat` itself stays headless.

```tsx
import '@fx-/chat/structure.css'
import { ChatProvider } from '@fx-/chat'
import { shadcnClassNames, shadcnComponents } from '@fx-/chat-shadcn'

<ChatProvider components={shadcnComponents} classNames={shadcnClassNames}>…</ChatProvider>
```

```css
@import "tailwindcss";
@import "@fx-/chat-shadcn/theme.css"; /* tokens + @source for the package's classes */
```

Dark mode follows the system; a `.dark`/`.light` class on any element forces a scheme for its
subtree. `createShadcnComponents({ touch, tooltipDelay, copyResetMs })` tunes the registry (the
Android app uses `touch: true`); spread your own keys over `shadcnClassNames` to override.

## License

MIT
