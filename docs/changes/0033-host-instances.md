# 0033: Host React/Ink Instances and Embedding Gaps

## Summary

Render `@fx/chat-ink` with the React and Ink a host hands in (`createChatInk({ React, ink })`, core hooks as `createCoreHooks(React)` on `@fx/chat-core/hooks`), move `tx chat` onto tx's injected instances, and close the gaps another tx plugin (rc) hit embedding the renderer: sibling text runs, a status-line idle label, footer extras, footer-only finished activity, viewport-driven image query, an optional JPEG decoder subpath, reactive composer history and a composer height helper.

**Spec:** [ink-renderer](../specs/ink-renderer/), [layout](../specs/ink-renderer/layout.md), [composer](../specs/ink-renderer/composer.md), [images](../specs/ink-renderer/images.md), [terminal-app](../specs/terminal-app/)
**Status:** draft
**Depends On:** —

## Motivation

tx gives every plugin its own React and Ink, and one tree renders with one instance of each. A plugin that renders its whole UI with tx's instances (rc) could not use `@fx/chat-ink`, which imported `react`, `ink` and `react/jsx-runtime` itself; `tx chat` only worked by shipping its own copies and being alone on screen. The product decision is that plugins use tx's instances only.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[Architecture § Testing](../specs/architecture/index.md#testing)). CI enforces these as merge gates.

### Functional requirements

The specs own the behavior. This change owns:

- **Breaking:** hosts call `createChatInk({ React, ink })` before rendering and share timers through `@fx/chat-ink`'s `ClockProvider` (the core `./react` provider is a different context).
- `tx chat` checks the injected Ink major version and refuses an Ink older than 8 with a message naming tx 2.0.

## Design

### Decisions

- **Live bindings, not a closure factory.** `runtime.ts` exports `let` bindings filled by `createChatInk`; modules read them at render time. One process binds once (a second, different binding throws). Rewriting every component as a closure would buy per-instance isolation nobody needs in one terminal process.
- **Classic JSX against the injected React**, by per-file pragmas plus `jsx: react` in the package's tsconfig, so neither TypeScript nor the bundlers emit a `react/jsx-runtime` import. The built entry imports no `react`, `ink` or `jsx-runtime`; the tx bundle of the plugin contains none of them.
- **Core hooks as a factory** in `src/hooks/` (type-only React imports, enforced by the React-free test); `./react` is the factory bound to `react`, so `@fx/chat` is unchanged.
- **Width measuring belongs to the host's Ink.** With injected Ink, a `string-width` patch in this repo no longer reaches Ink, so it was dropped. Measured in tmux with tx built from main: key echo during a stream ~95 ms; with tx caching `string-width`'s per-cluster widths and building React for production (tx's executable currently embeds React's development build), ~25–40 ms median. Both fixes landed in tx as `df48d7f` (fx/tx#84) and ship in tx 2.0.0, which this repository pins. `Bun.stringWidth` is not a substitute: it disagrees with `string-width` in hundreds of places, so this package's own default measure is `string-width` with a per-cluster cache (exact results), not Bun's function.
- **Lines as sibling runs.** Ink 8 squashes nested text into one string before measuring; runs are now sibling `Text` nodes in the row.
- **Mouse input stays on the raw stdin `data` tap.** Ink 8 drops mouse reports before its internal input emitter, so tapping that emitter (as rc did under Ink 7) would see nothing. Verified under Bun with tx 2 by writing SGR reports into the pane: drag-select copied. A check in foot on the handheld remains.

### Non-Goals

GIF/WebP decoding; per-instance isolation of two bindings in one process.

## Tasks

- [x] Core hooks factory and `./hooks` subpath; React-free guard extended
- [ ] `createChatInk` runtime binding, classic JSX, lazy registry context, `ClockProvider`
- [ ] `tx chat` on tx's instances; Ink version check; no React/Ink in the plugin bundle
- [ ] Sibling text runs; status-line idle label; footer extras; footer-only finished activity
- [ ] Viewport writes the image query and routes replies; JPEG decoder subpath
- [ ] Composer history follows the host's list; `composerRows`
- [ ] tmux verification with tx 2.0.0 (render, tool turn, Ink 7 refusal, mouse copy); specs/indexes

## References

- Feedback from the rc plugin's embedding attempt (relayed in session).
- tx 2.0.0 (fx/tx v2.0.0): `a46f01b` (Ink 8 / React 19.3 injected; marketplace versions and compatibility) and `df48d7f` (production React; cached `string-width` widths).
