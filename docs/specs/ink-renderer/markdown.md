# Ink Renderer — Terminal Markdown

Part of the [ink-renderer spec](./index.md).

The markdown engine is injected, as in `@fx/chat` (see [architecture](../architecture/index.md)): the
line viewport takes a **markdown layout** slot — a function from source, width and options
(streaming, an image hook, the measure) to lines. The package ships a **dependency-free default**,
the terminal counterpart of the headless DOM markdown, which the line viewport uses unless the host
passes its own. The same layout is exported as an element, `TerminalMarkdown`, for the
element-based markdown slot of the inline transcript: it lays out to its box's measured width (the
terminal's width until the first layout pass, or an explicit `width`) and strips controls from the
source first. That slot's default stays plain; a host opts in by injecting `TerminalMarkdown`.

## Blocks

- **Headings:** `strong`, a blank line before, no `#` markers.
- **Paragraphs:** reflowed to the width; continuation lines join softly on copy; a word longer than
  the line is split with a hard join.
- **Lists:** bullet, ordered (keeping the start number), task (`[ ]` / `[x]`); hanging indent;
  nesting by indentation; bullet and task markers from the glyph set; the marker in the `marker`
  role, indent and marker as chrome.
- **Quotes:** a quote bar (chrome, dim) per line, nested content inside.
- **Rules:** a full-width rule line, decoration.
- **Fenced code:** never reflowed (long lines hard-split); a left bar (chrome); the language as a dim
  decoration line; code text in the `code` role; while streaming, an unclosed fence is code to the
  end.
- **GFM tables:** header, separator honouring alignment; rows split on unescaped pipes (`\|` and
  pipes inside backticks stay in their cell). Columns get natural widths; if they do not fit, columns
  within a fair share keep theirs and the rest share what remains; cells wrap in their column.
  Columns joined by a column glyph (chrome; a copy separates cells with a tab), the separator row
  with a cross glyph (decoration), no trailing padding; header `strong`. When even minimum widths do not fit, each row renders as
  `header: value` lines, rows separated by a blank line.

## Inline

- Code spans in the `code` role; `**bold**`, `*italic*` / `_italic_`, `***both***`, `~~strike~~`.
  Emphasis opens and closes only at word boundaries (`snake_case`, `2*3*4`, `file__name` stay as
  written); emphasis and link text nest.
- `[text](url)`: text in the `link` role, then ` (url)` muted when it differs from the text;
  autolinks in the `link` role.
- Character references: `&amp; &lt; &gt; &quot; &apos; &nbsp;` and numeric references decode
  outside code spans; a numeric reference naming a control character, a surrogate or no character
  stays as written, so decoding never produces a control.
- Images in running text, or without an image hook: the image glyph, alt, and source — a `data:` URL
  shown as its type, never its payload. A line that is only an image MAY be laid out by the image
  hook (see [images](./images.md)).

#### Scenario: Table too wide

- **GIVEN** a 9-column table and a 40-cell pane
- **WHEN** it is laid out
- **THEN** each row renders as `header: value` lines, and no line exceeds 40 cells.

#### Scenario: Copy rejoins a paragraph

- **GIVEN** a paragraph wrapped over 3 lines
- **WHEN** all three are copied
- **THEN** the copy is one line with words joined by single spaces.
