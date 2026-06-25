# Documentation

## Specs

| Spec | Description | Status |
|------|-------------|--------|
| [Architecture](specs/architecture/) | Project-level concerns — identity, layout, build, distribution, CI, testing conventions | active |
| [Component Registry](specs/component-registry/) | Design-system-agnostic injection contract — provider, primitives, icons, markdown slot, theme tokens | active |
| [Demos](specs/demos/) | Static three-registry GitHub Pages demo proving design-system agnosticism | active |
| [Input Composer](specs/input-composer/) | Headless message composer, completion-provider contract, completion popup, mentions | active |
| [Message Model](specs/message-model/) | Normalized transport-agnostic message/content-block model and codec | active |
| [Message Rendering](specs/message-rendering/) | Message log, block renderers, streaming/timing hooks, auxiliary-block grouping, affordances | active |

## Changes

| # | Change | Spec | Status | Depends On |
|---|--------|------|--------|------------|
| 0001 | [Bootstrap Monorepo](changes/0001-bootstrap-monorepo.md) | [Architecture](specs/architecture/) | complete | — |
| 0002 | [Message Model](changes/0002-message-model.md) | [Message Model](specs/message-model/) | complete | 0001 |
| 0003 | [Component Registry](changes/0003-component-registry.md) | [Component Registry](specs/component-registry/) | draft | 0001 |
| 0004 | [Message Rendering](changes/0004-message-rendering.md) | [Message Rendering](specs/message-rendering/) | draft | 0002, 0003 |
| 0005 | [Input Composer](changes/0005-input-composer.md) | [Input Composer](specs/input-composer/) | draft | 0002, 0003 |
| 0006 | [Demos](changes/0006-demos.md) | [Demos](specs/demos/) | draft | 0004, 0005 |
