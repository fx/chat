# Documentation

## Specs

| Spec | Description | Status |
|------|-------------|--------|
| [Architecture](specs/architecture/) | Project-level concerns — identity, layout, build, distribution, CI, testing conventions | active |
| [Component Registry](specs/component-registry/) | Design-system-agnostic injection contract — provider, primitives, icons, markdown slot, classNames styling injection | active |
| [Demos](specs/demos/) | Static three-registry GitHub Pages demo proving design-system agnosticism | active |
| [Input Composer](specs/input-composer/) | Headless message composer, completion-provider contract, completion popup, mentions | active |
| [Message Model](specs/message-model/) | Normalized transport-agnostic message/content-block model and codec | active |
| [Message Rendering](specs/message-rendering/) | Message log, block renderers, streaming/timing hooks, auxiliary-block grouping, affordances | active |

## Changes

| # | Change | Spec | Status | Depends On |
|---|--------|------|--------|------------|
| 0001 | [Bootstrap Monorepo](changes/0001-bootstrap-monorepo.md) | [Architecture](specs/architecture/) | complete | — |
| 0002 | [Message Model](changes/0002-message-model.md) | [Message Model](specs/message-model/) | complete | 0001 |
| 0003 | [Component Registry](changes/0003-component-registry.md) | [Component Registry](specs/component-registry/) | complete | 0001 |
| 0004 | [Message Rendering](changes/0004-message-rendering.md) | [Message Rendering](specs/message-rendering/) | complete | 0002, 0003 |
| 0005 | [Input Composer](changes/0005-input-composer.md) | [Input Composer](specs/input-composer/) | complete | 0002, 0003 |
| 0006 | [Demos](changes/0006-demos.md) | [Demos](specs/demos/) | complete | 0004, 0005 |
| 0007 | [Render Extensibility](changes/0007-render-extensibility.md) | [Message Rendering](specs/message-rendering/) | complete | 0003, 0004 |
| 0008 | [Attachment Rendering](changes/0008-attachment-rendering.md) | [Message Rendering](specs/message-rendering/) | complete | 0002, 0004 |
| 0009 | [Theming & Layout Parity](changes/0009-visual-density-parity.md) | [Component Registry](specs/component-registry/) | complete | 0003, 0004 |
| 0010 | [Single-Caret Disclosure Ownership](changes/0010-single-caret-disclosure.md) | [Message Rendering](specs/message-rendering/) | complete | 0003, 0004 |
| 0011 | [Minimal / Density Mode](changes/0011-minimal-density-mode.md) | [Message Rendering](specs/message-rendering/) | complete | 0004, 0007 |
| 0012 | [Per-Block Timestamp Gutter](changes/0012-timestamp-gutter.md) | [Message Rendering](specs/message-rendering/) | complete | 0004, 0009 |
| 0013 | [Headless Styling](changes/0013-headless-styling.md) | [Component Registry](specs/component-registry/) | complete | 0003, 0009 |
| 0014 | [Footer Streaming/Empty Gate](changes/0014-footer-streaming-empty-gate.md) | [Message Rendering](specs/message-rendering/) | complete | 0004 |
| 0015 | [Tenth-Second Timers](changes/0015-timer-tenths.md) | [Message Rendering](specs/message-rendering/) | complete | 0004 |
| 0016 | [Live Reasoning Timer & Tokens/Sec](changes/0016-live-reasoning-timer-and-tokens.md) | [Message Rendering](specs/message-rendering/) | complete | 0004, 0015 |
| 0017 | [Custom-Block Summary Label](changes/0017-custom-block-summary-label.md) | [Message Rendering](specs/message-rendering/) | complete | 0007 |
| 0018 | [Timeline-Item Gutter Timestamps](changes/0018-timeline-item-gutter-timestamps.md) | [Message Rendering](specs/message-rendering/) | complete | 0007, 0012 |
