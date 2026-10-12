# 0047: npm Publishing

## Summary

The five libraries move to the `@fx-` npm scope and are published publicly to npm in lockstep by release-please: `@fx-/chat-core`, `@fx-/chat`, `@fx-/chat-agent`, `@fx-/chat-ink` and `@fx-/chat-shadcn`. The GitHub Packages workflow that published a `0.0.0-<sha>` build on every push to `main` is replaced by `release.yml`: release-please keeps a release pull request open, and merging it tags the release and publishes every package at the same version through npm trusted publishing, with provenance.

**Spec:** [architecture](../specs/architecture/)
**Status:** complete
**Depends On:** 0036

## Motivation

1. The libraries were published only to GitHub Packages under `@fx`, which requires every consumer to authenticate against that registry and configure the scope by hand.
2. Every push to `main` published a commit-pinned prerelease; there were no real versions, no changelog and no release a consumer could pin to.
3. `@fx/chat-shadcn` was never published (0036 deferred it).

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[Architecture § Testing](../specs/architecture/index.md#testing)). CI enforces these as merge gates.

### Functional requirements

- The published libraries are named `@fx-/chat-core`, `@fx-/chat`, `@fx-/chat-agent`, `@fx-/chat-ink` and `@fx-/chat-shadcn`; every import, dependency, script, test, spec and the README use the new names. `@fx/ui` and `@fx/tx` keep the `@fx` scope on GitHub Packages.
- Each library's `publishConfig` is `access: public` with `provenance: true`, and names no registry (the public npm registry is the default).
- `release-please-config.json` defines one root component (`release-type: node`, tags `vX.Y.Z`) whose `extra-files` set `$.version` in all five `packages/*/package.json`, so the five always share one version. `.release-please-manifest.json` starts at `0.0.0`.
- `.github/workflows/release.yml` runs on every push to `main`:
  - **release-please** acts through a GitHub App token (`RELEASE_PLEASE_APP_ID` variable, `RELEASE_PLEASE_PRIVATE_KEY` secret), so the release pull request triggers CI like any other pull request.
  - **publish** runs only when a release was created. It checks out the release tag, runs the CI quality gates (`check:no-internal-refs`, `check`, `build`, `typecheck`, `test`), then for each package in dependency order (core, chat, agent, ink, shadcn) packs it with `bun pm pack` (which pins `workspace:*` to the released version) and publishes the tarball with `npm publish` over OIDC. A version already on the registry is skipped, so a failed run can be re-run.
- `.github/workflows/publish.yml` is removed.

## Design

### Decisions

- **Lockstep, one component.** The packages depend on each other at `workspace:*` and are released together; one version and one changelog avoid a matrix of compatible versions.
- **Pack with bun, publish with npm.** `npm publish` does not rewrite the `workspace:` protocol; `bun pm pack` does. npm is still the publisher because trusted publishing and provenance are npm features.
- **Trusted publishing, no token.** The publish job holds `id-token: write`; no npm token is stored in the repository.
- **Publish only from a tag.** Merging the release pull request is the human action that authorizes a release; the publish job runs from the tag it created.
- **Internal dependencies pinned exactly.** A published package depends on the exact same version of its siblings (including `@fx-/chat-shadcn`'s peer dependency on `@fx-/chat`), matching the lockstep release.

### One-time npm bootstrap

Trusted publishers can only be added to a package that already exists, so the maintainer does this once before the first release:

1. Publish each package once by hand, in dependency order (`packages/core`, `packages/chat`, `packages/agent`, `packages/ink`, `packages/shadcn`), at the placeholder version `0.0.0`. Run `bun run build` once at the repository root, then in each package directory run `bun pm pack` and `npm publish <tarball> --access public`. Never publish by hand at a version release-please will produce, or the release job would skip it as already published.
2. On npmjs.com, add a trusted publisher to each of the five packages: GitHub Actions, repository `fx/chat`, workflow `release.yml`, no environment.
3. In the repository settings, add the variable `RELEASE_PLEASE_APP_ID` and the secret `RELEASE_PLEASE_PRIVATE_KEY`, and install the release-please GitHub App on `fx/chat`.

### Migration for consumers

Consumers switch from `@fx/chat*` on GitHub Packages to `@fx-/chat*` on npm: replace the dependency names and imports, and drop any `@fx` registry configuration that existed only for these packages.

### Non-Goals

Moving `@fx/ui` or `@fx/tx` off GitHub Packages; publishing the apps or the demo; commit-pinned prerelease builds; rewriting historical change documents to the new names.

## Tasks

- [x] Rename the libraries to the `@fx-` scope across packages, apps, demo, scripts, tests, specs, README and `bun.lock`
- [x] `publishConfig` public with provenance; release-please config and manifest
- [x] Replace `publish.yml` with `release.yml` (release-please, quality gates, `bun pm pack` + `npm publish` over OIDC)
- [x] Architecture spec, README releases section, this change document and indexes
