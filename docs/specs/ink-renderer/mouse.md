# Ink Renderer — Mouse

Part of the [ink-renderer spec](./index.md). Mouse support is opt-in on the viewport (see
[layout](./layout.md)); without it the viewport has no mouse behavior.

## Reporting

- While the viewport is focused and mouse support is given, it MUST enable button-event tracking with
  SGR encoding, and disable both when focus leaves, on unmount, and on process exit, so a crash never
  leaves a shell receiving mouse reports. The terminal's own selection stays available with
  Shift+drag (documented). A terminal that still reports a Shift-modified press, drag or release
  gets no viewport behavior from it: it neither starts, extends nor ends a selection, clicks or
  copies, and a Shift release abandons a pending press. A Shift-modified wheel still scrolls.
  Horizontal wheel reports are ignored.
- A terminal may split a report (a mouse report, a reply to the image provider's query) across
  input chunks. The viewport MUST keep an unfinished report at the end of a chunk and complete it
  with the next; the kept tail is bounded, and dropped past the bound.
- Mapping a screen cell to a line needs the viewport's absolute screen position; finding it relies on
  renderer internals and MUST be isolated in one helper with its own test.

## Gestures

- **Wheel:** scrolls by a host-set step (default 3).
- **Drag-select:** press, drag and release within the transcript; dragging outside clamps to the
  first or last visible row. The highlight uses the `selection` role on content spans only — what is
  highlighted is what will be copied; selecting past a line's end highlights one cell. A grapheme
  is selected when any of its cells is, so an end inside a wide character takes it whole. A drag that
  starts inside a tool output box is clamped to that box. Release copies.
- **Copy extraction:** content spans only (chrome dropped, per-character replacements applied),
  decoration lines skipped, each line right-trimmed, soft-wrapped lines joined with a space and hard
  ones with nothing, other lines by newlines.
- **Copy transport:** an OSC 52 clipboard write through the host's writer, then the host's copy
  callback with the text and a short description of what was copied.
- **Double-click** (same line, within a host-set interval, default 400 ms): inside a tool output box
  copies that tool's whole output (pretty JSON for JSON); elsewhere the whole message as written (an
  answer's raw markdown). Not on toggle or image lines.
- **Click** (press and release on one cell): toggles a JSON member or a row; on an image, allows an
  `ask` image, toggles a ready image between thumbnail and expanded, and with Ctrl calls the host's
  open-URL callback (hosts SHOULD accept only http(s) there). Any key clears the selection.

#### Scenario: Copy skips decoration

- **GIVEN** an answer in the threaded frame with a code block and a table
- **WHEN** the whole answer is drag-selected
- **THEN** the copy holds no gutter, frame, separator or footer characters, and the code keeps its
  indentation.
