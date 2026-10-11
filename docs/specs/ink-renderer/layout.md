# Ink Renderer — Line Layout and Viewport

Part of the [ink-renderer spec](./index.md). Behavior of activity (tool labels, plan, outcome, footer
facts, live phase, placement, live tail) is owned by
[message-rendering § Agent Activity](../message-rendering/index.md#agent-activity); this document
owns how the terminal draws it.

## Line Model

A fullscreen pane scrolls by terminal line, renders only visible lines, maps a screen cell back to
what is under it, and caches finished messages. Element trees cannot be sliced by line or
hit-tested, so the viewport renders from a laid-out **line model**; the element-based message view
remains for the inline transcript.

- A **line** MUST be a list of **spans** plus metadata: its owner (message id, OPTIONAL block id), how
  it joins the previous line when copied (`soft` wrap — a space; `hard` — nothing; absent — a line
  break), whether it is pure decoration (`frame`: skipped by copy), and an OPTIONAL click **target**
  (`tool-output` of a block, a `json-toggle` with its path and open state, an `image` with its
  source, a `row-toggle` with its key).
- A **span** MUST carry text and MAY carry a theme role (resolved at render time), explicit
  attributes over the role (bold, italic, dim, underline, strikethrough, inverse), a literal colour
  (only where no role can say it), `chrome` (layout such as borders, gutters, indents and bars:
  drawn, never copied), and a per-character copy replacement (a fold marker drawn over indentation
  copies as spaces).
- Prefixing or suffixing spans onto a line MUST preserve its metadata.
- Every width MUST be measured in **terminal cells** (wide and emoji characters 2, combining marks
  0), with an injectable measure; truncation cuts with `…`, and hard splits never split a code point.

## Message Layout

- Laying out a message MUST be a pure function of the message, a layout context (width, detail
  level, placement, whether the message is live, the whole-second clock for live facts, JSON open
  state, the markdown layout, the image provider, glyphs, hint labels, custom block layouts, a
  measure) and the next message (which decides a frame's junction).
- A layout cache MUST key each message by its object identity plus a signature of everything layout
  reads (width, detail, placement, frame id, live tail, live footer, finished-activity mode,
  liveness and — when live — the second, the open-state and image versions, whether the next
  message shows, the host's footer facts, the hint labels, the resolved accent, the glyphs, the
  markdown layout, the measure, the image hook and the custom block layouts). Plain values (facts,
  hints, accent) count by value; the glyph set and injected functions count by identity, so hosts
  SHOULD pass stable ones (a new one lays every message out again). Finished messages MUST NOT be
  laid out again when only the live message changes. Hosts that mutate messages in place give a
  changed message a new identity.
- **Frames are injected.** The message frame — what surrounds a user message and an answer (box,
  gutter, footer corner, separators) — MUST be a replaceable layout slot. The package ships two:
  `compact` (the default: role glyph, rows, footer line) and an OPTIONAL `threaded` frame (user
  message in a round-cornered box with the time set into its top edge and its attachments listed;
  an answer hanging from it on a gutter with a footer corner). Frames draw only with injected roles
  and glyphs.
- An answer **shows** once it has content, reasoning, an outcome, a tool call or a plan. Before that,
  a live answer in the threaded frame draws nothing (the status line reports waiting); the compact
  frame keeps the pending row.
- A per-message **accent** (a role or appearance, default the `assistant` role) MUST colour a frame's
  gutter, footer corner and the live pulse; the host chooses it per message.
- Custom block kinds MUST lay out through host-supplied line layouts; without one, an inert labelled
  row (core summary label, `marker` role). Element-based custom renderers apply to the inline
  transcript only.

## Block Layouts

- **Reasoning:** wrapped, italic, `muted`.
- **Tool row:** one line — status glyph (success, error, running when its message is live, idle
  otherwise, unknown), the label, the input when it adds something, then the approval qualifier.
  Whitespace collapsed and truncated to the width; the glyph and qualifier are exempt from
  truncation.
- **Tool output box** (details and full): the output text, each line prefixed by an indented dotted
  bar (chrome), every line targeted at the block. Plain text is wrapped and dim and never cut (the
  inline transcript keeps its line clip). JSON is laid out with core's loose-JSON layout — folded in
  `details` (strings cut at 80, array members folded unless opened), open in `full`. Indentation is
  content (a copy keeps the JSON's shape); a foldable member draws a fold marker in place of its
  last indent step, its preview and a size label, and targets the toggle. Trailing non-JSON follows
  as text. Open state is per block and path, kept by the viewport or controlled by the host.
- **Plan:** one row per entry — status glyph (done, active, pending), the content with a hanging
  indent; completed entries dim; the active glyph bright while live.
- **Outcome:** an error row `✗ <message>` (glyph injected), wrapped, `danger`, after the content.
- **Footer:** the planned facts joined by a separator, with fact glyphs (reasoning, plan, tools) from
  the glyph set, then host-labelled hints: `retry` with an outcome, `details` when collapsed with
  activity, `openAll` in details with tool output, `close` in details or full. Hint labels default to
  empty, since the keys are the host's. A host MAY add its own facts per message and detail level
  (e.g. a turn id in details); they come after the message's facts and before the hints.

## Detail Levels

Three levels apply to every message in the viewport:

| Level | Finished message | Live message |
|---|---|---|
| `collapsed` | content; activity as a folded row and footer facts (or, by host option, footer facts only) | content; the live tail (reasoning while nothing else arrived, the plan, the newest tool rows after an `N earlier` row) |
| `details` | everything; JSON folded | same |
| `full` | everything; JSON open, nothing cut | same |

Per-member JSON opening is independent of the level and persists while the viewport is mounted.

## Viewport

- The viewport MUST render exactly its given height and draw only the lines in its window. Scrolling
  is either **follow** (the window is the last lines and stays there as content grows) or pinned to
  a **top** line (content arriving below does not move what the reader sees, and the count of lines
  below grows). Scrolling to or past the bottom returns to follow.
- Any message MAY be redrawn (width, detail, a toggle, an image arriving); there is no static output.
- The host owns scroll state (controlled) and receives geometry (total, first, rows, below). Scroll
  helpers clamp: by lines, by pages (a page is the rows minus two lines of context), home, end.
- An empty state renders when there are no lines — including a live answer that shows nothing yet
  as the only message.
- The rendered window MUST be memoised on a shape signature (message count, the live message's
  revision, width, detail, open/image versions, the live second, the window, the selection), so a
  keystroke in a sibling composer does not rebuild the transcript.
- The viewport's own keys (when focused and not consumed by the composer or the host): PgUp/PgDn
  page, Shift+↑/↓ scroll three lines, Home/End top/follow when there is no composer or it is empty,
  Ctrl+T cycles detail (reported to the host). A host MAY remap or disable them.
- A hook MUST expose the laid-out lines and geometry for hosts that draw extra chrome or hit-test.

#### Scenario: Reading while it streams

- **GIVEN** a viewport pinned 40 lines above the bottom while a message streams
- **WHEN** 10 more lines arrive
- **THEN** the visible lines are unchanged and `below` grew by 10.

## Status Line, Pending Rows, Empty State

- **Status line:** a full-width rule with a label set into it near the left, cut to fit. While a
  message is live: the pulse (frames from the glyph set, one step per clock tick, in the accent),
  the live phase (`waiting`, `thinking`, `running <tool label, ≤32 cells>`, `writing`, or a host
  label per phase), whole elapsed seconds, the tool count, an OPTIONAL slow-phase hint after a
  host-given delay, then host facts. Not live: a host notice (`✓`/`✗` in its tone), else the host's
  own state label and `↓ N more` (either or both), else a plain rule.
- **Pending rows** (for hosts that queue messages typed while an answer streams): at most a host
  maximum (default 3), newest last; each row the pending glyph, `+N` on the first row when more are
  hidden, an attachment count when present, then the collapsed text, truncated and dim.
- **Empty state:** title in the accent, subtitle and notes muted, centred in the viewport.

## Performance

- Everything that animates (pulse, live facts, timers, spinners) MUST follow the shared clock when
  the host provides one, and start no interval of its own then.
- Lines MUST render as runs that keep terminal width measurement on its fast path: consecutive ASCII
  spans as one run, each non-ASCII stretch as its own run, long repeats of one character cut into
  fixed short chunks, the split cached per line, and each line in a one-row clipped box (layout
  already wrapped it). Runs MUST be sibling text nodes: Ink merges nested text into one string per
  line before measuring it.
- Coalescing stream deltas is the host's (it owns the stream); the viewport stays correct when
  deltas are batched.
- The default measure MUST return exactly `string-width`'s widths (what Ink lays out by), measuring
  each distinct grapheme cluster once. Ink's own measuring uses the host's `string-width`; on Bun the
  host should make that fast too.
- The default markdown layout MUST cost a streamed delta only the unfinished tail of the message:
  finished top-level blocks are laid out once per width and reused.
