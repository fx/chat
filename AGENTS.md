## Toolchain: mise first

**Use mise for every tool it can install.** `mise.toml` at the repo root pins the toolchain (bun, node, tx, Java, Rust with the Android targets) and sets the Android/Gradle/Cargo environment. Run `mise install`, then run commands through mise (`mise exec -- <cmd>`, `mise run <task>`, or a mise-activated shell).

- Add or bump a tool by editing `mise.toml` — never with curl-pipe installers, `rustup` invocations, global `npm i -g`, or ad-hoc downloads.
- Only what mise cannot manage goes elsewhere: the Android SDK/NDK/emulator are installed by `mise run android:setup` into `.toolchain/` (gitignored, survives `$HOME` wipes); system shared libraries come from the OS package manager.
- Tasks: `mise run android:setup`, `mise run android:build`, `mise run android:emulator`, `mise run tui:install`.

## Task Tracking

**You MUST load the `/project-management` skill before creating, modifying, or completing any task.** It owns all task-tracking rules and knows where tasks belong. Do not manage tasks without it.

## Code Review Rules

Read `REVIEW.md` at the repository root and apply it in full as the review rules for this repo. It is the canonical review-conventions file.
