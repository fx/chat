# 0006: Three-Registry Static Demo on GitHub Pages

## Summary

Build the static demo site: one app rendering the same fixture conversations through three
registries (`fx-ui`, `shadcn`, `headless`), switchable in place and viewable side-by-side, with
a compact controls strip, polished light/dark styling, and a GitHub Pages deployment. No
marketing copy.

**Spec:** [demos](../specs/demos/)
**Status:** complete
**Depends On:** 0004, 0005

## Motivation

The demos are the falsifiability test for design-system agnosticism and the public showcase.
They prove the same library renders through three design systems unchanged, and give users a
slick, functional reference.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[architecture › Testing](../specs/architecture/index.md#testing)). CI enforces these as merge
gates:

- A test MUST render each fixture through all three registries and assert no library code path
  differs (only the injected registry).
- A test/lint check MUST assert the demo makes no runtime network request and contains no
  private-application references.
- A check MUST assert the demo build is base-path-aware (assets resolve under the Pages
  subpath).
- The demo build MUST be part of CI and MUST block merge on failure.
- No `.only`/`.skip`.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not
in the rule.

### Single Site, Three Registries

- One static app MUST render the chat surface through `fx-ui`, `shadcn`, and `headless`
  registries, switchable in place and side-by-side, with identical library/model/fixtures
  across all three. All data MUST be local fixtures; no backend.

#### Scenario: Same fixture, three registries

- **GIVEN** the side-by-side view
- **WHEN** a fixture renders through all three registries
- **THEN** messages/blocks/tool-calls/grouping match, differing only in presentation.

### Content, Tone & Polish

- Copy MUST be functional only — no marketing/sales language.
- Fixtures MUST exercise: user text + attachments, assistant markdown, reasoning, a multi-tool
  grouped turn with `+N`, an error tool call, a streaming/active state, and the composer with
  the reference provider.
- The UI MUST be polished, compact, responsive, with polished interactive states and
  reduced-motion-aware streaming.

#### Scenario: No marketing copy

- **GIVEN** the rendered demo
- **WHEN** its text is reviewed
- **THEN** only functional/demonstrative labels appear.

### GitHub Pages

- The demo MUST build static with base-path-aware assets and deploy to Pages on merge to the
  default branch via the workflow from 0001.

## Design

### Approach

- Add `demos/` Vite app: `fixtures/` (ChatMessage[]), `registries/{fx-ui,shadcn,headless}.tsx`,
  `App.tsx` (controls strip + single/side-by-side panes), `main.tsx`.
- Each registry is a thin `ChatComponents` mapping (fx/ui + its icons; shadcn/ui + lucide;
  headless re-export). Demos MAY wire a real markdown engine via the `Markdown` slot.
- Drive the streaming fixture from synthetic timestamps through the library timing hooks.
- Finalize the `pages.yml` deploy (base path) added in 0001.

### Decisions

- **Decision**: In-place switch first, then side-by-side compare.
  - **Why**: in-place is simplest and already proves the seam; side-by-side is additive.
  - **Alternatives considered**: three separate builds (rejected — duplicates shell, weaker
    comparison).
- **Decision**: Per-registry theme; headless uses the package CSS variables.
  - **Why**: shows each design system honestly.
  - **Alternatives considered**: one shared token set (rejected — hides per-kit differences).

### Non-Goals

- No marketing site, analytics, or backend.
- No demonstration of out-of-scope blocks (job/wake/generative-UI).

## Tasks

- [x] Scaffold the Vite demo app, fixtures (covering all required surfaces), and base-path
      config
- [x] Implement the three registry adapters (fx-ui, shadcn, headless) as thin mappings, each
      with icons (+ optional markdown engine)
- [x] Implement `App.tsx`: controls strip (registry, single/side-by-side, theme, grouped/flat,
      verbose) + panes wrapping `ChatProvider` → `MessageLog` + `ChatInput`
- [x] Wire the streaming fixture through the library timing hooks (reduced-motion aware)
- [x] Add the cross-registry parity test, the no-network/no-private-refs check, and finalize the
      Pages deploy workflow

## Open Questions

- [ ] Side-by-side scope if it proves more than trivial
- [ ] Which markdown engine to wire for the styled panes

## References

- Spec: [demos](../specs/demos/)
- Related: [0004-message-rendering](./0004-message-rendering.md),
  [0005-input-composer](./0005-input-composer.md)
