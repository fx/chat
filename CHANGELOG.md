# Changelog

## [0.1.2](https://github.com/fx/chat/compare/v0.1.1...v0.1.2) (2026-10-12)


### Bug Fixes

* **tui:** install the tx plugin from the published libraries ([#49](https://github.com/fx/chat/issues/49)) ([5af6f41](https://github.com/fx/chat/commit/5af6f418e52e71e1f6960a15acd197fb18d0d046))

## [0.1.1](https://github.com/fx/chat/compare/v0.1.0...v0.1.1) (2026-10-12)


### Bug Fixes

* **release:** pin internal dependencies to the released version ([#47](https://github.com/fx/chat/issues/47)) ([22f15ac](https://github.com/fx/chat/commit/22f15ac48d492a6a89cd7d0f28b84cbb7285f860))

## 0.1.0 (2026-10-12)


### ⚠ BREAKING CHANGES

* the packages are now @fx-/chat, @fx-/chat-core, @fx-/chat-agent, @fx-/chat-ink and @fx-/chat-shadcn on npm.

### Features

* activity layout polish (placement, footer activity, earlier row, spacing, spinner, glyphs, group headers) ([#29](https://github.com/fx/chat/issues/29)) ([27ae2a5](https://github.com/fx/chat/commit/27ae2a51e3d4f1347eaebe48e154b66fce7dba71))
* add component registry, provider and headless defaults ([#4](https://github.com/fx/chat/issues/4)) ([2b7f5eb](https://github.com/fx/chat/commit/2b7f5eb7cea0dde129c031b0bc4842acf2f09095))
* add headless composer, completion providers and completion popup ([#6](https://github.com/fx/chat/issues/6)) ([9f057f6](https://github.com/fx/chat/commit/9f057f639f512e3636203e6b167e21a3f441dad2))
* add message log, block renderers, streaming and timeline grouping ([#5](https://github.com/fx/chat/issues/5)) ([44ce15e](https://github.com/fx/chat/commit/44ce15eef22b4cce1b4140e707facc211c5c968e))
* add normalized message model and codec ([#3](https://github.com/fx/chat/issues/3)) ([a8db419](https://github.com/fx/chat/commit/a8db4194bf6f6f452532bc40cfb5d4fa0a27c978))
* add render-layer extensibility for custom block and tool renderers ([#12](https://github.com/fx/chat/issues/12)) ([c89cbe8](https://github.com/fx/chat/commit/c89cbe881ca0426331aa4266d37f8364751db1b3))
* add three-registry static demo with GitHub Pages deploy ([#7](https://github.com/fx/chat/issues/7)) ([fef49a3](https://github.com/fx/chat/commit/fef49a37ddf653c4fdf1c9ba4ef09ecb124c3f0a))
* **agent:** add @fx/chat-agent, an OpenAI-compatible agent runtime ([#25](https://github.com/fx/chat/issues/25)) ([7de9388](https://github.com/fx/chat/commit/7de93886ae7e8153ecf496d339b4b39d3fcfe6fa))
* **agent:** add ChatController and run the mobile app and tx chat on it ([#34](https://github.com/fx/chat/issues/34)) ([952d598](https://github.com/fx/chat/commit/952d598e3ae396f0a0993e2ec68f00cee52061d5))
* **agent:** honour model tool support and send tool history as text ([#36](https://github.com/fx/chat/issues/36)) ([f31001f](https://github.com/fx/chat/commit/f31001faccaf7a3e654493a7dca67031dd3d5ee8))
* **agent:** keep the standard model listing fields ([#39](https://github.com/fx/chat/issues/39)) ([b251562](https://github.com/fx/chat/commit/b2515622c9a6ccd7ce05f2968d09236b8f7cc8b2))
* **chat:** add headless activity summaries, footer activity and message details ([#33](https://github.com/fx/chat/issues/33)) ([f9db8b1](https://github.com/fx/chat/commit/f9db8b16973a0f407649ecf35200af8868becd3a))
* **core:** extract @fx/chat-core and share render planning with @fx/chat ([#24](https://github.com/fx/chat/issues/24)) ([341c9b6](https://github.com/fx/chat/commit/341c9b6014c58c8cf829b42aec55874e1cca1bbc))
* headless styling via classNames injection; ship structure.css, drop the visual stylesheet ([#15](https://github.com/fx/chat/issues/15)) ([cfaac37](https://github.com/fx/chat/commit/cfaac3793249b7f81f6bb13f5fc3d1fba633cfb5))
* **ink:** add @fx/chat-ink, a terminal renderer with injected React and Ink ([#27](https://github.com/fx/chat/issues/27)) ([e17aa9c](https://github.com/fx/chat/commit/e17aa9cebce570bbc1ab2d088b234b5b74a95591))
* **ink:** add a TerminalMarkdown element and drop marked from tx chat ([#31](https://github.com/fx/chat/issues/31)) ([31e6129](https://github.com/fx/chat/commit/31e6129efc3ea7b6b1704caa723f4eecf4361a50))
* **mobile:** add a searchable model picker and a default model across endpoints ([#40](https://github.com/fx/chat/issues/40)) ([0cf17a5](https://github.com/fx/chat/commit/0cf17a58b695120dadb0a770d43fba963ebfe07f))
* **mobile:** add the Android reference app on Tauri v2 ([#26](https://github.com/fx/chat/issues/26)) ([31507ca](https://github.com/fx/chat/commit/31507ca7593f26307d092421db37b2519653d98b))
* **mobile:** be selectable as the digital assistant, with settings sub-menus ([#38](https://github.com/fx/chat/issues/38)) ([f7fdd21](https://github.com/fx/chat/commit/f7fdd21de33fa9498892a5fa0557288af1b59199))
* **mobile:** show activity as tiles with finished activity in the footer ([#37](https://github.com/fx/chat/issues/37)) ([1a7cfae](https://github.com/fx/chat/commit/1a7cfaeb596e9a20cdac7a45384abd5287c48390))
* publish the libraries to npm under the [@fx](https://github.com/fx)- scope ([#42](https://github.com/fx/chat/issues/42)) ([e7b60cc](https://github.com/fx/chat/commit/e7b60ccc0180a75d0a3fc3142b0c507b50645256))
* render user message attachments with image grid and lightbox ([#11](https://github.com/fx/chat/issues/11)) ([a16fccc](https://github.com/fx/chat/commit/a16fccc1d126cde5129d7b604bedabb5b654bfc1))
* **render:** custom-block summary labels and timeline-item gutter timestamps ([#21](https://github.com/fx/chat/issues/21)) ([61ba8b2](https://github.com/fx/chat/commit/61ba8b2120ade083e8a9058aea8c69b024b24d21))
* **render:** live metrics on active rows — reasoning timer and tokens/sec ([#20](https://github.com/fx/chat/issues/20)) ([44964cf](https://github.com/fx/chat/commit/44964cfdb38a78d303e2cea53f2de54cfc147e10))
* **shadcn:** add @fx/chat-shadcn, a ready-made shadcn look for @fx/chat ([#32](https://github.com/fx/chat/issues/32)) ([81e37fc](https://github.com/fx/chat/commit/81e37fc951448059a022825a4ecd50a8aee85bc4))
* **shadcn:** add touch presenters for activity tiles and message details ([#35](https://github.com/fx/chat/issues/35)) ([b49291d](https://github.com/fx/chat/commit/b49291d2f7fce0a4be9881a1b886f951acae50c9))
* **tui:** add tx chat, a terminal agent chat plugin for tx ([#28](https://github.com/fx/chat/issues/28)) ([41187fc](https://github.com/fx/chat/commit/41187fcb03b76e75a428362056323e743fb6f5bc))
* visual density — host font, role bubbles, single-caret disclosure, minimal mode, timestamp gutter ([#14](https://github.com/fx/chat/issues/14)) ([3fc0d67](https://github.com/fx/chat/commit/3fc0d67d1e8dca7fd20cdc589fc9082aafd2e4ac))


### Bug Fixes

* add non-color signal to tool errors and pointer cursor on disclosures ([#8](https://github.com/fx/chat/issues/8)) ([f0e5751](https://github.com/fx/chat/commit/f0e5751b55393ea4d315c28b62f5507258bbdf8b))
* correct headless spec/render details from Copilot review ([#16](https://github.com/fx/chat/issues/16)) ([e483dd5](https://github.com/fx/chat/commit/e483dd5216f7a1342f27ae3076e8939e21211063))
* make explicit data-theme win over prefers-color-scheme ([#9](https://github.com/fx/chat/issues/9)) ([0a60b29](https://github.com/fx/chat/commit/0a60b29f75eb729ab5679439c7b7da4dd35b93d2))
* **mobile:** ask for local-network access on Android 17+ ([#30](https://github.com/fx/chat/issues/30)) ([f94a4d2](https://github.com/fx/chat/commit/f94a4d2f24381d0888adcfd65aeda0859464b7e2))
* **mobile:** say when a picked image cannot be read ([#41](https://github.com/fx/chat/issues/41)) ([a1b0aae](https://github.com/fx/chat/commit/a1b0aaec123b9780e6689dd3ed96b8d830b1f7c7))
* **render:** empty and streaming assistant chrome — footer gate plus live pending status row ([#19](https://github.com/fx/chat/issues/19)) ([46b2185](https://github.com/fx/chat/commit/46b2185497752a3e0b1aa7de28486de5e7d61779))
* **render:** gate the message footer on content, not any block ([#22](https://github.com/fx/chat/issues/22)) ([dfb8d85](https://github.com/fx/chat/commit/dfb8d85bfa9d19b8393edd2cc755f0842625c1e5))
