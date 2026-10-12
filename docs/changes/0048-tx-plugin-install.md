# 0048: tx Plugin Install

## Summary

`tx marketplace add fx/chat` installs the `tx chat` plugin. `apps/tui` leaves the bun workspace and installs the published `@fx-/chat-core`, `@fx-/chat-agent` and `@fx-/chat-ink` from npm, pinned at the release version and bumped by release-please with the libraries. It stays a reference application, not a package.

**Spec:** [terminal-app](../specs/terminal-app/), [architecture](../specs/architecture/)
**Status:** complete
**Depends On:** 0022, 0047

## Motivation

tx installs a marketplace plugin by cloning the repository and running `bun install` beside the plugin entry. `apps/tui` was a workspace member, so bun installed the whole monorepo from the root and failed: the `workspace:*` links point at `packages/`, which tx's sparse clone does not contain, and `@fx/tx` (and, in a full clone, the demo's `@fx/ui`) sit behind GitHub Packages authentication.

## Requirements

- `apps/tui` is not a workspace member. Its `package.json` pins `@fx-/chat-core`, `@fx-/chat-agent` and `@fx-/chat-ink` at the current release version, plus `fast-png` and `jpeg-js`, and depends on nothing behind registry authentication.
- React, Ink and `@fx/tx` are not dependencies of the plugin: tx injects React and Ink, and `@fx/tx` is imported for types only. None of the plugin's library imports loads React at module level.
- release-please bumps the three pins with every release.
- The repository's tests and typecheck still exercise `apps/tui` against the local libraries: the root links them (`workspace:*` dev dependencies) and carries `@fx/tx`, `fast-png` and `jpeg-js` as dev dependencies.
- `mise run tui:install` adds the checkout as a live marketplace and links the local library builds over the published copies tx installs.

## Design

- **Standalone, not published.** The TUI is tx glue around `@fx-/chat-ink` and `@fx-/chat-agent`; publishing it as a package was rejected because the reference applications are not packages.
- **Exact pins.** The plugin installs the same release it was released with. Between a release pull request merging and its packages reaching npm, a fresh install of `main` can briefly fail to find the new version.
- **No committed lockfile.** `apps/tui/bun.lock` is ignored: tx resolves the plugin's dependencies fresh, and a committed lockfile would go stale with every release bump.

## Tasks

- [x] Drop `apps/tui` from the workspaces; pin the published libraries in its `package.json`
- [x] Root dev dependencies for the TUI's tests and typecheck
- [x] release-please `extra-files` for the three pins
- [x] `tui:install` links the local builds over the published copies
- [x] terminal-app and architecture specs, `apps/tui` README
