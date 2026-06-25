# 0001: Bootstrap Monorepo, Build, and CI

## Summary

Stand up the `@fx/chat` monorepo: the library package skeleton, the demo app skeleton, shared
tooling (TypeScript, linter/formatter, test runner), the library and demo build pipelines, and
CI with a GitHub Pages deploy. No chat features yet — this establishes the ground the other
changes build on.

**Spec:** [architecture](../specs/architecture/)
**Status:** draft
**Depends On:** —

## Motivation

Every other change needs a buildable, testable, lintable workspace that publishes ESM + types
and deploys a static demo. The repository currently contains only a README. This change creates
the structure and gates defined in the architecture spec.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[architecture › Testing](../specs/architecture/index.md#testing)). CI enforces these as merge
gates:

- Unit tests MUST run via the chosen runner (Vitest RECOMMENDED) and MUST block merge on
  failure.
- The bootstrapping change MUST set a concrete coverage threshold and wire it into CI.
- Committed tests MUST contain no `.only` or `.skip`.
- CI MUST run type-check, lint, unit tests, library build, and demo build on every PR.
- A smoke test MUST assert the library's public entry points are importable and the headless
  registry resolves with no UI-kit dependency.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not
in the rule.

### Repository & Package Skeleton

- The repository MUST be a workspace monorepo with one lockfile.
- The library MUST live under `packages/chat/` and publish as `@fx/chat` with an `exports` map
  exposing `.`, `./headless`, and `./styles.css`.
- React MUST be a peer dependency; no UI kit, icon set, or markdown engine in deps/peerDeps.

#### Scenario: Public entry points importable

- **GIVEN** the built library
- **WHEN** a smoke test imports `@fx/chat` and `@fx/chat/headless`
- **THEN** both resolve and the headless import pulls in no UI-kit dependency.

### Build & Distribution

- The library build MUST emit ESM + `.d.ts` via a single command.
- The demo MUST build as a static site with a base-path-aware config for GitHub Pages.

### CI/CD

- A PR workflow MUST run type-check, lint, tests, library build, demo build.
- A deploy workflow MUST publish the demo to GitHub Pages on merge to the default branch.

#### Scenario: Failing type-check blocks merge

- **GIVEN** a PR that fails type-check
- **WHEN** CI runs
- **THEN** the PR is red and not mergeable on green.

## Design

### Approach

- Initialize a workspace (npm/pnpm/bun workspaces) with `packages/chat` and `demos/` (demo app
  added in 0006; a placeholder is fine here).
- Configure strict TypeScript, a single linter/formatter, and the test runner with fake-timer
  support.
- Configure `tsdown` (or `tsup`) for the library; Vite for the demo with `base` set for Pages.
- Add GitHub Actions: `ci.yml` (PR gates) and `pages.yml` (deploy).
- Add a "no private-application references" check (lint rule or test) over source + demos.

### Decisions

- **Decision**: Monorepo with library + demos sharing one lockfile.
  - **Why**: demos must consume the public package and act as the agnosticism test harness.
  - **Alternatives considered**: separate repos (rejected — slower feedback, harder to keep the
    demos honest against the library).
- **Decision**: ESM-first with `tsdown`.
  - **Why**: clean ESM + `.d.ts`, fast.
  - **Alternatives considered**: `tsup`, `unbuild` (kept as open question in the spec).

### Non-Goals

- No chat components, model, registry, or composer (later changes).
- No real markdown engine or icon set in the library.

## Tasks

- [ ] Initialize workspace monorepo, lockfile, `packages/chat` package manifest with `exports`
      map and React peerDeps
- [ ] Configure strict TypeScript, linter/formatter, and test runner (fake timers enabled)
- [ ] Configure library build (`tsdown`/`tsup`) emitting ESM + `.d.ts`; add placeholder entry
      points (`.`, `./headless`, `./styles.css`) with a smoke test
- [ ] Configure Vite demo skeleton with base-path-aware config (full demo in 0006)
- [ ] Add `ci.yml` (type-check, lint, test+coverage threshold, lib build, demo build) and
      `pages.yml` (deploy on default branch)
- [ ] Add automated "no private-application references" check over source + demos

## Open Questions

- [ ] Package manager / workspace tool — pnpm vs bun vs npm workspaces
- [ ] Coverage threshold value to enforce in CI

## References

- Spec: [architecture](../specs/architecture/)
