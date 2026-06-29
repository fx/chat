# Input Composer

## Overview

This spec defines the headless message composer and its completion system. `@fx/chat` ships a
keyboard-first textarea composer with autosize, Enter-to-send, attachment hooks, a mention
highlight overlay, and a **pluggable completion-provider interface** with a portal-rendered
completion popup. The package MUST NOT ship any application-specific completion provider (no
agent/model/tool pickers, no server fetch); it ships only the provider *contract* and a
reference provider for demos/tests. All visual atoms and icons come from the
[component-registry](../component-registry/).

## Background

The extraction source's completion contract was already DOM-free and server-safe: a provider
declares a single trigger character, a `match()` that decides whether the caret is inside an
active token, an `items()` that resolves candidates (sync or async with `AbortSignal`), and an
`apply()` that rewrites the textarea value and caret. The popup measured the caret position to
anchor itself, supported keyboard nav with IME guards, flipped to avoid viewport clipping, and
exposed `role="listbox"`/`aria-activedescendant`. The composer wired the popup's keydown
handler ahead of its own, did Enter-to-send, atomic mention-token deletion, autosize via a
hidden measuring element, and a mention highlight overlay behind the textarea. The
application-specific pieces (agent fetch provider, model/tool selectors, attachment pipeline,
generative-UI bridges, UI-prefs store) MUST be left to the host.

## Requirements

### Headless Composer

- The package MUST export a `ChatInput` composer that manages a multiline text value and emits
  a submit event with the text and any attachments.
- `ChatInput` MUST support both **uncontrolled** use (it owns its value) and **controlled**
  use (`value` + `onChange`). The previous imperative-ref-only approach MUST be replaced by a
  first-class controlled option.
- `ChatInput` MUST call an `onSend(text, attachments?)` callback on submit and MUST clear its
  value/attachments afterward in uncontrolled mode.
- Submit MUST be gated: it MUST NOT fire when the trimmed value is empty and there are no
  attachments, when a `disabled` prop is set, or when an `isStreaming` prop indicates a
  response is in progress. While streaming, the send affordance MUST instead expose a `onStop`
  if provided.
- `Enter` (without Shift) MUST submit; `Shift+Enter` MUST insert a newline.
- The composer MUST autosize between one line and a configurable maximum number of lines, then
  scroll.
- The composer MUST be SSR-safe (DOM measurement confined to effects/handlers).

#### Scenario: Enter submits, Shift+Enter newlines

- **GIVEN** a focused composer with non-empty text and no active completion popup
- **WHEN** the user presses `Enter`
- **THEN** `onSend` fires with the text; **WHEN** the user presses `Shift+Enter` instead, a
  newline is inserted and `onSend` does not fire.

#### Scenario: Send gated while streaming

- **GIVEN** `isStreaming` is true
- **WHEN** the user presses `Enter`
- **THEN** `onSend` does not fire; if `onStop` is provided, a stop control is shown.

### Completion-Provider Interface

- The package MUST export a `CompletionProvider` contract that is DOM-free and safe to import
  outside the browser. A provider MUST declare:
  - `id: string` — stable identity (precedence + diagnostics).
  - `trigger: string` — a single character used as a fast pre-filter.
  - `match(text, caret): CompletionMatch | null` — returns `{ query, range:[start,end] }`
    where `range` includes the trigger char and covers the whole active token, or `null`.
  - `items(query, signal): Promise<TItem[]> | TItem[]` — sync or async; async MUST honor the
    `AbortSignal`.
  - `apply(item, before, after): { value, caret }` — returns the new full value and caret.
- A `CompletionItem` MUST carry at least `{ id, label, description?, icon? }` where `icon` is
  an OPTIONAL host-rendered node.
- The package MUST ship exactly one reference provider (a static, sync, trigger-based
  provider) for demos and tests, and MUST NOT ship any provider that fetches from a host
  server or encodes host domain concepts.

#### Scenario: Provider precedence

- **GIVEN** two providers whose triggers could both match at the caret
- **WHEN** the popup recomputes
- **THEN** the first matching provider in array order wins.

#### Scenario: Stale async results are discarded

- **GIVEN** a provider whose `items()` is async
- **WHEN** the query changes before a prior request resolves
- **THEN** the stale request is aborted and its results are never applied.

### Completion Popup

- The package MUST provide a completion popup that: anchors at the caret position; supports
  `ArrowUp`/`ArrowDown` (wrap-around), `Enter`/`Tab` to apply, and `Escape` to dismiss;
  guards against IME composition; flips to avoid viewport clipping; and renders via a portal.
- The popup MUST expose an imperative `handleKeyDown(event): boolean` that the composer calls
  **before** its own key handling, returning `true` when the key was consumed.
- The popup MUST be accessible: `role="listbox"`, options as `role="option"` with
  `aria-selected`, and `aria-activedescendant` maintained on the textarea so focus stays in
  the input.
- After Escape on a token, the popup MUST NOT reopen for that same token until the caret
  leaves it or the token changes.
- A short loading delay MUST elapse before showing a loading state, to avoid flicker on fast
  providers.
- Because the popup portals to `document.body`, it MUST carry the composer's themed context with
  it: it MUST copy the textarea's resolved `--chat-*` custom properties (any the HOST has defined
  — the package itself ships none; see change 0013) onto its own root so a host theme scoped to a
  wrapper around the composer still reaches the portaled popup. It MUST also copy the textarea's
  RESOLVED computed `font-family` as a real CSS property — NOT a token — so the popup paints in
  the same font as the composer even when the host's font is inherited from a wrapper (which would
  otherwise resolve against `<body>` once portaled).

#### Scenario: Keyboard apply keeps focus in textarea

- **GIVEN** an open popup with a highlighted item
- **WHEN** the user presses `Enter`
- **THEN** the item is applied, the textarea value/caret update, and focus remains in the
  textarea.

### Mention Parsing & Highlight

- The package MUST provide DOM-free helpers to parse `@`-mentions: a tokenizer producing
  ranges and a segmenter producing an interleaved array of plain-text strings and mention
  markers (each with a stable key) for rendering.
- The mention regex MUST treat a mention as `@<id>` at start-of-string or after whitespace
  (so `email@host` is not a mention), with an id charset documented as part of the contract.
- The composer MUST render a non-interactive highlight overlay behind the textarea using the
  segmenter, scroll-synced with the textarea. The overlay and the textarea MUST share ONE
  identical box (box model, font, line-height, wrapping) so highlighted runs line up exactly with
  the typed text. These shared alignment mechanics — the `.chat-input-field` positioning context
  and the shared `.chat-input-overlay` / `.chat-input-textarea` box — are layout, not theme, and
  are the composer mechanics shipped in the package's `structure.css` (the package is otherwise
  headless; see change 0013). The visible look (border color, padding scale) is host-supplied via
  `classNames`, but the overlay and textarea MUST keep matching metrics.
- The composer MUST support atomic mention deletion: `Backspace`/`Delete` at a mention
  boundary MUST remove the whole `@<id>` token (and a single adjacent space) in one keystroke.

#### Scenario: Atomic mention deletion

- **GIVEN** the value `hello @alice ` with the caret right after the mention
- **WHEN** the user presses `Backspace`
- **THEN** the entire `@alice` token (and one trailing space) is removed in a single press.

### Attachments (Headless Hooks)

- The composer MUST accept attachments produced by the host and surface them as removable
  chips/thumbnails, and MUST include them in the `onSend` payload.
- The composer MUST expose hooks/props for drag-drop, paste, and file-picker, but MUST NOT
  bundle a file-processing pipeline, upload logic, or any host storage. Converting a `File`
  to an `Attachment` is the host's responsibility (the package MAY provide a trivial
  object-URL helper for demos).
- The package MUST NOT include generative-UI attachment bridges or any global registry that
  lets unrelated components push into the composer.

## Design

### Architecture

```
<ChatInput value? onChange? onSend onStop? providers? attachments? disabled isStreaming>
  textarea (autosize) + mention overlay (segmenter)
  <CompletionPopup ref> ← providers[]      (portal, caret-anchored)
     composer.onKeyDown → popup.handleKeyDown(e) first → else Enter-send / mention-delete
  registry: Button, icons (send/stop/paperclip/close), ScrollArea for popup
```

### API Surface

Illustrative (authoritative contract; exact props finalized in implementation):

```ts
interface CompletionItem { id: string; label: string; description?: string; icon?: ReactNode }
interface CompletionMatch { query: string; range: [number, number] }   // range includes trigger
interface CompletionApplyResult { value: string; caret: number }

interface CompletionProvider<T extends CompletionItem = CompletionItem> {
  id: string
  trigger: string
  match(text: string, caret: number): CompletionMatch | null
  items(query: string, signal: AbortSignal): Promise<T[]> | T[]
  apply(item: T, before: string, after: string): CompletionApplyResult
}

interface ChatInputProps {
  value?: string
  onChange?: (value: string) => void
  onSend: (text: string, attachments?: Attachment[]) => void
  onStop?: () => void
  providers?: CompletionProvider[]
  attachments?: Attachment[]
  onAttachmentsChange?: (next: Attachment[]) => void
  disabled?: boolean
  isStreaming?: boolean
  maxLines?: number
  placeholder?: string
}
```

### Business Logic

- **caret measurement** — a framework-free mirror-div utility computes caret coordinates;
  SSR-safe and dependency-free.
- **popup recompute** — runs per render with O(1) early-outs; first-matching-provider wins;
  tracks a dismissed range for Escape suppression.
- **mention parser/segmenter** — single-pass, DOM-free, shared by overlay and any consumer.

## Constraints

- The provider contract and parser/segmenter MUST be importable in non-DOM environments.
- No host server calls, stores, routers, or UI-kit imports in this layer.
- The composer MUST NOT reach into render-layer global state; cross-component insertion is out
  of scope.

## Open Questions

- **Controlled vs uncontrolled default** — which mode is the documented default.
  - Current default: uncontrolled, with controlled fully supported.
- **Fuzzy ranking** — whether to ship the small scorer used for ranking items.
  - Current default: ship an OPTIONAL tiny scorer helper; providers may ignore it.
- **Attachment helper scope** — how much of object-URL handling to ship.
  - Current default: a minimal `fileToAttachment` demo helper only; real pipelines are host
    territory.

## References

- [component-registry](../component-registry/)
- [message-model](../message-model/)
- [message-rendering](../message-rendering/)

## Changelog

| Date | Change | Document |
|------|--------|----------|
| 2026-06-25 | Initial spec created | [0005-input-composer](../../changes/0005-input-composer.md) |
| 2026-06-27 | Completion popup copies the textarea's resolved computed `font-family` (not the `inherit`-default token) so the portaled popup matches the composer font | [0009-visual-density-parity](../../changes/0009-visual-density-parity.md) |
| 2026-06-29 | Package goes fully headless: composer/popup VISUALS are host-supplied via `classNames`. The mention-overlay alignment mechanics (`.chat-input-field` context + the shared `.chat-input-overlay` / `.chat-input-textarea` box) and the popup fixed-overlay positioning ship in `structure.css` as layout, not theme; the popup copies any HOST-defined `--chat-*` tokens (the package ships none) | [0013-headless-styling](../../changes/0013-headless-styling.md) |
