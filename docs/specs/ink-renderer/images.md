# Ink Renderer — Images

Part of the [ink-renderer spec](./index.md).

## Provider Contract

How images are drawn is injected. An **image provider** answers, for a source and a cell box, one of:
`ask` (policy: wait for a click), `loading`, `failed` (with an error), or `ready` (one string per
cell row, drawn as text, plus a colour); or nothing, meaning "not mine — render as text". It also
accepts an `allow` for a source (a click on an `ask` image), exposes a version bumped on any change
(part of the layout cache key), and lets the viewport subscribe to changes.

- A block image renders its `ready` rows — a **thumbnail** (at most 32×8 cells) unless expanded, then
  the pane width by a maximum image height (default: the viewport height minus 8) — followed by a
  caption: the image glyph, the alt in italics, the whole source (`link` role; `data:` URLs
  abbreviated to their type) and a state hint (`click to show`, `loading…`, `✗ <error>`, `click to
  enlarge` / `click to shrink`), wrapped. Image and caption lines target the source.
- Without a provider, or when it declines, only the caption is drawn, without a hint.
- Expanded state is kept per source by the viewport.

## Kitty Provider (opt-in subpath)

The package MAY be used with a built-in provider for terminals implementing the kitty graphics
protocol, on its own subpath so hosts that do not use it never load it.

- **Detection:** `TERM_PROGRAM` of `ghostty` or `kitty`, or `GHOSTTY_RESOURCES_DIR` /
  `KITTY_WINDOW_ID` set, or `TERM` of `xterm-ghostty` / `xterm-kitty` — and not inside tmux or
  screen.
- **Drawing with Unicode placeholders:** each image is transmitted once, quietly, with one virtual
  placement sized to its cell box, and drawn by printing the placeholder character per cell, the
  image id in a 256-colour foreground and row/column in combining diacritics. The image is ordinary
  text the renderer lays out, scrolls and clips; the escapes are written through the host's writer
  before the frame that shows the placeholders.
- **Ids** are 1–255; when a new image needs an id, the image holding the oldest is forgotten and
  fetched again if it returns to view.
- **Formats:** PNG is sent as is. Other formats need a decoder that returns PNG bytes; without one
  they stay captions. The main entries bundle no image codecs; an OPTIONAL subpath ships a JPEG
  decoder that downscales to a bound (1600 × 1600 by default) before encoding, with its codecs as
  optional peer dependencies.
- **Sizing** follows the cell size in pixels, asked once through a terminal query whose reply the
  provider recognises; until then 9×18 is assumed. A new cell size bumps the version. A provider
  MAY expose its query and reply recogniser; the viewport then writes the query once and hands the
  provider the terminal's input before its own mouse handling.
- **Fetch policy (security).** An image URL in an answer is attacker-controllable and can leak the
  conversation through its query string. Only `data:` URLs are fetched without a click by default;
  hosts widen this per URL. Any other source is `ask` until allowed. Fetches without a click MUST
  NOT follow redirects; clicked fetches may. A timeout (default 15 s) and a size cap (default 20 MB)
  apply to both. The cap MUST hold before the bytes are held whole: a declared `Content-Length`
  above it fails at once, an undeclared body is read in chunks and cancelled once it passes the
  cap, and a `data:` URL fails before decoding when its body decodes to more than the cap — counted
  from the encoded body without decoding it (base64 by its length, never undercounting;
  percent-encoding exactly, each valid `%XX` one byte and any other character its UTF-8 length).
  A percent-encoded body decodes to raw bytes. The JPEG decoder refuses an image above a
  megapixel bound (default 50) before allocating its pixels.
