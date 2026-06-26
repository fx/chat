# 0008: User Attachment Rendering

## Summary

Render a `user` message's `attachments` in the message log. The model already defines
message-level `attachments` (`{ url, mediaType, kind: 'image'|'video'|'audio'|'file', name? }`),
but the render layer does not display them (a gap found during the rendering designer pass).
Add an attachment region that shows images as a responsive thumbnail grid with an expand/lightbox
affordance, and video/audio/file as chips with a scheme-safe download/open affordance — all via
the registry, accessible, responsive, and theme-aware. Add an OPTIONAL `Lightbox`/`ImageOverlay`
registry slot for the enlarged-image overlay.

**Spec:** [message-rendering](../specs/message-rendering/),
[component-registry](../specs/component-registry/)
**Status:** draft
**Depends On:** 0002, 0004

## Motivation

`attachments` are first-class on the message model but invisible in the render layer: a user who
attaches images or files sees nothing. This change closes that gap with an accessible,
theme-aware, registry-driven attachment surface that does not hard-code a UI kit, and that
refuses unsafe URL schemes so attachment rendering can't become an injection vector.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see
[architecture › Testing](../specs/architecture/index.md#testing)). CI enforces these as merge
gates:

- Every renderer (image grid, lightbox/overlay, media/file chip) MUST have unit tests covering
  its GIVEN/WHEN/THEN scenarios.
- The scheme-safe URL guard MUST be unit-tested as a pure function: `http(s):`/`data:`/`blob:`
  allowed; `javascript:` and other schemes refused.
- Lightbox keyboard behavior MUST be tested: open via keyboard, `Escape` closes, focus trapped
  while open, focus restored to the originating thumbnail on close.
- Accessibility MUST be tested: thumbnails carry alt text (name when present, fallback
  otherwise); chips expose accessible labels and an operable download/open control.
- The design-system-agnostic guarantee MUST hold: attachment atoms (thumbnail, chip, overlay,
  icons) come from the registry; a render test MUST exercise the headless registry and one styled
  stub, including a host-overridden `Lightbox`.
- Additivity MUST be tested: messages without attachments render identically to today.
- No `.only`/`.skip`; coverage at or above the configured threshold.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not
in the rule.

### Attachment Region

- `MessageItem` MUST render a `user` message's `attachments` (when present) in a dedicated region
  distinct from text blocks. Messages without attachments MUST render exactly as today.
- Attachment rendering MUST draw every atom from the registry via `useChatComponents()`; the
  package MUST NOT hard-code a UI kit, and MUST be SSR-safe (DOM/portal access in
  effects/handlers).

### Image Grid & Lightbox

- `kind:'image'` attachments MUST render as a responsive thumbnail grid: lazy-loaded, accessible
  alt text (attachment `name` when present, otherwise a generic fallback), reflowing by available
  width, theme-aware via the package CSS custom properties.
- The grid MUST provide an expand/lightbox affordance: activating a thumbnail (click or keyboard)
  MUST open an enlarged view via the registry `Lightbox`/`ImageOverlay` slot. The overlay MUST be
  keyboard-dismissable (`Escape` + close control), MUST trap focus while open, MUST restore focus
  to the originating thumbnail on close, and MUST honor `prefers-reduced-motion`.

#### Scenario: Image attachments render as an accessible grid

- **GIVEN** a `user` message with three `kind:'image'` attachments
- **WHEN** the message renders
- **THEN** three lazy-loaded thumbnails render in a responsive grid, each with accessible alt
  text, driven by the package theme tokens.

#### Scenario: Lightbox open/close is keyboard-operable

- **GIVEN** a rendered image thumbnail
- **WHEN** the user activates it via keyboard and then presses `Escape`
- **THEN** the overlay opens with the enlarged image, focus is trapped while open, and on
  `Escape` the overlay closes and focus returns to the originating thumbnail.

### Media/File Chips & Safe URLs

- `kind:'video'|'audio'|'file'` attachments MUST render as chips showing the `name` (or a derived
  label when absent) with a kind-appropriate registry icon (`video`/`audio`/`file`), and MUST
  offer a download/open affordance.
- The renderer MUST only honor `http(s):`, `data:`, and `blob:` URLs; any other scheme (e.g.
  `javascript:`) MUST render as an inert, non-interactive chip and MUST NOT be linked or executed.

#### Scenario: Non-image attachment chip with safe download

- **GIVEN** a `user` message with a `kind:'file'` attachment named `report.pdf` at an `https:`
  URL
- **WHEN** the message renders
- **THEN** a chip shows `report.pdf` with the `file` icon and a download/open affordance pointing
  at the safe URL.

#### Scenario: Unsafe scheme is refused

- **GIVEN** an attachment whose `url` uses a `javascript:` scheme
- **WHEN** the message renders
- **THEN** the attachment renders as an inert, non-interactive chip and the unsafe URL is not
  linked or executed.

### Registry Slot

- The registry MUST gain an OPTIONAL `Lightbox`/`ImageOverlay` slot receiving at least
  `{ src; alt; open; onClose }`, with an accessible self-contained headless default and host
  override support (see [component-registry](../specs/component-registry/)).
- The icon set MUST gain `download` and `expand` for the attachment affordances.

## Design

### Approach

- Add a `MessageAttachments` renderer composing: `AttachmentImageGrid` (thumbnail grid + lightbox
  trigger), the registry `Lightbox` overlay, and `AttachmentChip` (video/audio/file).
- Add a pure `isSafeAttachmentUrl(url)` guard (allow `http(s):`/`data:`/`blob:`) shared by grid
  and chips; unsafe URLs render inert.
- Render `MessageAttachments` from `MessageItem` for `user` messages, after/around the text
  region, gated on `attachments?.length`.
- Add the `Lightbox` slot + headless default to the registry and the `download`/`expand` icons to
  the headless icon set.

### Decisions

- **Decision**: Add a dedicated registry `Lightbox` slot rather than reusing a generic overlay.
  - **Why**: the overlay has specific a11y obligations (focus trap, restore, reduced motion) and
    hosts will want to map it to their own dialog/lightbox.
  - **Alternatives considered**: inline ad-hoc overlay (rejected — not host-overridable, harder
    to make accessible consistently).
- **Decision**: Scheme allow-list (`http(s):`/`data:`/`blob:`) with inert fallback.
  - **Why**: attachment URLs are host-provided data; refusing unknown schemes prevents
    `javascript:`-style injection while supporting the common cases.
  - **Alternatives considered**: render all URLs (rejected — unsafe); block `data:`/`blob:`
    (rejected — these are legitimate for inline/generated media).
- **Decision**: Images lazy-load and thumbnails carry alt text from `name`.
  - **Why**: performance and accessibility defaults that hosts shouldn't have to wire.

### Non-Goals

- No upload/compose-side attachment handling (that is the composer's concern).
- No media transcoding, EXIF stripping, or server-side processing — the package renders given
  URLs only.
- No new core block variant; attachments stay message-level per the model.

## Tasks

- [ ] Add `isSafeAttachmentUrl` pure guard + tests
- [ ] Add the `Lightbox`/`ImageOverlay` registry slot, accessible headless default, and
      `download`/`expand` icons
- [ ] Implement `AttachmentImageGrid` (lazy thumbnails, alt text, responsive, theme-aware) with
      the lightbox trigger
- [ ] Implement `AttachmentChip` for video/audio/file with safe download/open affordance
- [ ] Wire `MessageAttachments` into `MessageItem` for `user` messages (gated on
      `attachments?.length`; no change when absent)
- [ ] Tests: grid a11y, lightbox keyboard/focus-trap/restore, chip labels + download, URL guard,
      additivity (no-attachment parity), cross-registry agnosticism incl. host-overridden
      `Lightbox`

## Open Questions

- [ ] Whether the headless `Lightbox` is a required slot or remains OPTIONAL with an inline
      headless fallback (current default: OPTIONAL slot + headless default)
- [ ] Whether to support `kind:'video'`/`'audio'` inline players in-grid vs chip-only (current
      default: chip-only; inline players are a host override)

## References

- Spec: [message-rendering](../specs/message-rendering/),
  [component-registry](../specs/component-registry/)
- Related: [0002-message-model](./0002-message-model.md),
  [0004-message-rendering](./0004-message-rendering.md)
