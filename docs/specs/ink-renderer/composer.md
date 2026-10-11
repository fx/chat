# Ink Renderer — Composer

Part of the [ink-renderer spec](./index.md). The base composer behavior (multi-line input, newline
keys, chunked input, history, completion, Tab/Enter rules) is in the index; this document owns the
additions fullscreen hosts use. All of them are opt-in: the uncontrolled, bordered composer stays
the default.

## Controlled State

- The composer MAY be controlled with a value of `{ text, caret, attachments }` and a change
  callback, so a host keeps a draft per conversation and can modify it (restore a queued message).
- Submission MUST pass the attachments and MUST be allowed with empty text when attachments exist.

## Layout

- A `plain` variant without a border: the prompt glyph on the first row only (`marker` role, chrome
  when unfocused), later rows indented to align.
- Rows MUST soft-wrap at the width by terminal cells (never inside a wide character) as well as at
  newlines; one cell stays free for the caret at a row's end.
- An OPTIONAL maximum of rows; past it the input scrolls inside itself to keep the caret's row
  visible. The package exports the composer's height for a value and width (input rows up to the
  maximum, the attachments row, the boxed border), so a host can size the rest of the screen.
- The caret (cursor role) MUST be drawn only while focused.
- An attachments row above the input when attachments exist: the attachment glyph (`link` role),
  descriptions (`description ?? name ?? mediaType`) joined by ` · `, then a host hint, truncated,
  dim.

## Keys

- ↑/↓ move by **visual** row, keeping the caret's cell column (landing at the end of a shorter row);
  at the first or last visual row they go to history.
- Ctrl+←/→ and Alt+←/→ jump a word (whitespace-separated).
- Ctrl+U clears to the line start (default) or the whole input (host option).
- An OPTIONAL kitty-keyboard mode pushes the protocol's disambiguate flag while the composer is
  focused, so Shift+Enter is reported, and pops it when focus leaves, on unmount and on process exit.
- History entries MAY carry attachments; recalling one restores them. Once an entry is recalled and
  not edited, ↑/↓ keep stepping through history even when it spans several rows; after an edit they
  move between rows again. Coming back past the newest entry restores the draft with its
  attachments. Entries the host adds while the composer is mounted (a message sent another way)
  join its history; the draft and a browse in progress are kept.

#### Scenario: Recalled multi-line message

- **GIVEN** history holding a 3-line message and an older one, and an empty input
- **WHEN** the user presses ↑ twice
- **THEN** the input holds the older message, not row 2 of the 3-line one.

## Routing

- A host key handler MUST be called **first** for every key; returning true means handled. Hosts
  implement their Esc layering this way (close details, clear text, drop the last attachment,
  unqueue, leave).
- Alternatively the composer MAY take its keys from the host (an imperative key handler) and
  register no input listener of its own, for hosts that route all keys through one dispatcher.
- A host paste handler MUST be called first for bracketed pastes; returning true means handled (e.g.
  pasted image paths become attachments). Pasted newlines are text, never Enter.
- Mouse reports and terminal replies reach input listeners as input; the composer and viewport MUST
  ignore them, and a predicate recognising them MUST be exported for hosts.
