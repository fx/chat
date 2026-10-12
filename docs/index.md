# Documentation

## Specs

| Spec | Description | Status |
|------|-------------|--------|
| [Architecture](specs/architecture/) | Project-level concerns — identity, layout, build, distribution, CI, testing conventions | active |
| [Component Registry](specs/component-registry/) | Design-system-agnostic injection contract — provider, primitives, icons, markdown slot, classNames styling injection | active |
| [Demos](specs/demos/) | Static three-registry GitHub Pages demo proving design-system agnosticism | active |
| [Input Composer](specs/input-composer/) | Headless message composer, completion-provider contract, completion popup, mentions | active |
| [Message Model](specs/message-model/) | Normalized transport-agnostic message/content-block model and codec | active |
| [Chat Core](specs/chat-core/) | Renderer-agnostic core package — model, transcript logic, completion contract, DOM-free hooks | active |
| [Chat Agent](specs/chat-agent/) | UI-free OpenAI-compatible agent runtime — streaming into ChatMessages, tool loop, approval, cancellation | active |
| [Mobile App](specs/mobile-app/) | Android reference app (Tauri v2) — endpoint profiles, persisted conversations, agent chat, tools, injected theme | active |
| [Ink Renderer](specs/ink-renderer/) | Terminal renderer on Ink — injected theme roles, glyphs and markdown; live turns; keyboard composer | active |
| [Terminal App](specs/terminal-app/) | `tx chat` — terminal agent chat as a tx plugin: settings via tx config, tx theme, setup dialogs, slash commands | active |
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
| 0019 | [Core Extraction](changes/0019-core-extraction.md) | [Chat Core](specs/chat-core/) | complete | — |
| 0020 | [Agent Runtime](changes/0020-agent-runtime.md) | [Chat Agent](specs/chat-agent/) | complete | 0019 |
| 0021 | [Mobile App](changes/0021-mobile-app.md) | [Mobile App](specs/mobile-app/) | complete | 0019, 0020 |
| 0022 | [Ink Renderer](changes/0022-ink-renderer.md) | [Ink Renderer](specs/ink-renderer/) | complete | 0019, 0020 |
| 0023 | [Agent Activity Model](changes/0023-agent-activity-model.md) | [Message Model](specs/message-model/) | complete | 0022 |
| 0024 | [Plan Block](changes/0024-plan-block.md) | [Message Model](specs/message-model/) | complete | 0023 |
| 0025 | [Activity Planning](changes/0025-activity-planning.md) | [Message Rendering](specs/message-rendering/) | complete | 0023, 0024 |
| 0026 | [Loose Json](changes/0026-loose-json.md) | [Chat Core](specs/chat-core/) | complete | — |
| 0027 | [Shared Clock](changes/0027-shared-clock.md) | [Message Rendering](specs/message-rendering/) | complete | — |
| 0028 | [Ink Line Layout](changes/0028-ink-line-layout.md) | [Ink Renderer](specs/ink-renderer/) | complete | 0023, 0024, 0025, 0026, 0027 |
| 0029 | [Terminal Markdown](changes/0029-terminal-markdown.md) | [Ink Renderer](specs/ink-renderer/) | complete | 0028 |
| 0030 | [Ink Composer Fullscreen](changes/0030-ink-composer-fullscreen.md) | [Ink Renderer](specs/ink-renderer/) | complete | 0028 |
| 0031 | [Ink Mouse And Images](changes/0031-ink-mouse-and-images.md) | [Ink Renderer](specs/ink-renderer/) | complete | 0028, 0029 |
| 0032 | [Tui Fullscreen](changes/0032-tui-fullscreen.md) | [Terminal App](specs/terminal-app/) | complete | 0028, 0029, 0030, 0031 |
| 0033 | [Host Instances](changes/0033-host-instances.md) | [Ink Renderer](specs/ink-renderer/) | complete | 0028, 0029, 0030, 0031, 0032 |
| 0034 | [Activity Layout](changes/0034-activity-layout.md) | [Ink Renderer](specs/ink-renderer/) | complete | 0025, 0028, 0033 |
| 0035 | [Terminal Markdown Element](changes/0035-terminal-markdown-element.md) | [Ink Renderer](specs/ink-renderer/) | complete | 0029 |
| 0038 | [Android Local Network](changes/0038-android-local-network.md) | [Mobile App](specs/mobile-app/) | complete | 0021 |
