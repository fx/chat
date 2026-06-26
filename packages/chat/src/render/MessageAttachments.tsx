/**
 * `MessageAttachments` — renders a message's `attachments` region.
 *
 * Composes two surfaces, both driven entirely by the component registry
 * (`useChatComponents()`); the package hard-codes no UI kit:
 *  - `kind: 'image'` attachments render as a responsive, lazy-loaded thumbnail
 *    grid. Each thumbnail carries accessible alt text (the attachment `name`, or
 *    a generic fallback) and an expand affordance that opens the registry
 *    `Lightbox` overlay with the enlarged image.
 *  - `kind: 'video' | 'audio' | 'file'` attachments render as chips: a
 *    kind-appropriate icon, the name (or a label derived from the URL), and a
 *    download/open affordance.
 *
 * Every URL is scheme-checked (`isSafeAttachmentUrl`): an unsafe scheme (e.g.
 * `javascript:`) renders inert — no `src`, no link — so attachment rendering can
 * never become an injection vector.
 *
 * SSR-safe: DOM/overlay access lives in the registry `Lightbox`'s effects; this
 * component only tracks which image is enlarged via React state.
 */
import { useCallback, useState } from 'react'
import type { Attachment } from '../model'
import { useChatComponents } from '../registry'
import type { IconName } from '../registry'
import { isSafeAttachmentUrl } from './url'

/** Props for {@link MessageAttachments}. */
export interface MessageAttachmentsProps {
  /** The owning message's attachments. */
  attachments: Attachment[]
}

/** Generic accessible fallback when an image attachment has no usable `name`. */
const IMAGE_ALT_FALLBACK = 'image attachment'

/**
 * Resolve accessible alt text for an image attachment: its `name` when it is a
 * non-empty (non-whitespace) string, otherwise the generic fallback. Guards
 * against an empty/blank `name` (allowed by the model) producing an empty,
 * inaccessible `alt`/`aria-label`.
 */
function imageAlt(name: string | undefined): string {
  return name && name.trim().length > 0 ? name : IMAGE_ALT_FALLBACK
}

/** Maps a non-image attachment kind to its registry icon name. */
const CHIP_ICON: Record<'video' | 'audio' | 'file', IconName> = {
  video: 'video',
  audio: 'audio',
  file: 'file',
}

/**
 * Derive a display label for a chip whose attachment has no `name`: use the last
 * non-empty path segment of the URL, else fall back to the `kind`. Pure string
 * work — never throws on malformed URLs.
 */
export function deriveAttachmentLabel(attachment: Attachment): string {
  if (attachment.name) return attachment.name
  // Strip any query/hash, then take the last path segment.
  const path = attachment.url.replace(/[?#].*$/, '')
  const segments = path.split('/').filter(Boolean)
  const last = segments[segments.length - 1]
  return last && last.length > 0 ? decodeSegment(last) : attachment.kind
}

/** Best-effort percent-decode of a path segment; returns the raw value on error. */
function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/** The responsive grid of image thumbnails with the expand/lightbox affordance. */
function ImageGrid({
  images,
  onExpand,
}: {
  images: Attachment[]
  onExpand: (attachment: Attachment) => void
}) {
  const { icons } = useChatComponents()
  const ExpandIcon = icons.expand
  return (
    <ul className="chat-attachment-grid">
      {images.map((image, index) => {
        const alt = imageAlt(image.name)
        const safe = isSafeAttachmentUrl(image.url)
        return (
          <li
            // Attachments are a stable, non-reordering positional list; the
            // url keeps keys distinct when two entries share an index slot.
            key={`img-${index}-${image.url}`}
            className="chat-attachment-grid-item"
            data-safe={safe ? 'true' : 'false'}
          >
            {safe ? (
              <button
                type="button"
                className="chat-attachment-thumb"
                onClick={() => onExpand(image)}
                aria-label={`Expand ${alt}`}
              >
                <img
                  className="chat-attachment-thumb-image"
                  src={image.url}
                  alt={alt}
                  loading="lazy"
                />
                <span className="chat-attachment-thumb-expand" aria-hidden="true">
                  <ExpandIcon />
                </span>
              </button>
            ) : (
              // Unsafe scheme: render inert — no `src`, no expand control.
              <span
                className="chat-attachment-thumb"
                data-inert="true"
                role="img"
                aria-label={alt}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** A single video/audio/file chip with a scheme-safe download/open affordance. */
function AttachmentChip({ attachment }: { attachment: Attachment }) {
  const { icons } = useChatComponents()
  const kind = attachment.kind as 'video' | 'audio' | 'file'
  const Icon = icons[CHIP_ICON[kind]]
  const DownloadIcon = icons.download
  const label = deriveAttachmentLabel(attachment)
  const safe = isSafeAttachmentUrl(attachment.url)
  return (
    <li className="chat-attachment-chip" data-kind={kind} data-safe={safe ? 'true' : 'false'}>
      <span className="chat-attachment-chip-icon" aria-hidden="true">
        <Icon />
      </span>
      <span className="chat-attachment-chip-name">{label}</span>
      {safe ? (
        <a
          className="chat-attachment-chip-download"
          href={attachment.url}
          download
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Download ${label}`}
        >
          <DownloadIcon />
        </a>
      ) : (
        // Unsafe scheme: no link is rendered, so the URL is never followed.
        <span className="chat-attachment-chip-download" data-inert="true" aria-hidden="true">
          <DownloadIcon />
        </span>
      )}
    </li>
  )
}

/** Renders the attachment region for a message (images grid + media/file chips). */
export function MessageAttachments({ attachments }: MessageAttachmentsProps) {
  const { Lightbox } = useChatComponents()
  // The currently-enlarged image attachment, or `null` when the overlay is closed.
  const [active, setActive] = useState<Attachment | null>(null)

  const handleExpand = useCallback((attachment: Attachment) => setActive(attachment), [])
  const handleClose = useCallback(() => setActive(null), [])

  const images = attachments.filter((a) => a.kind === 'image')
  const others = attachments.filter((a) => a.kind !== 'image')

  return (
    <div className="chat-attachments" data-testid="message-attachments">
      {images.length > 0 ? <ImageGrid images={images} onExpand={handleExpand} /> : null}
      {others.length > 0 ? (
        <ul className="chat-attachment-chips">
          {others.map((attachment, index) => (
            <AttachmentChip
              // Positional, non-reordering list; url disambiguates the index.
              key={`chip-${index}-${attachment.url}`}
              attachment={attachment}
            />
          ))}
        </ul>
      ) : null}
      {/* The `Lightbox` slot is OPTIONAL in the contract, but the headless
          registry always supplies it and `mergeRegistry` preserves inherited
          slots, so a host can override but never REMOVE it — the absent (`:
          null`) branch is unreachable through the public provider API and is a
          defensive guard only. */}
      {/* c8 ignore start -- Lightbox is always present via the headless fallback; the absent branch is a defensive guard for the optional contract slot */}
      {Lightbox ? (
        <Lightbox
          src={active?.url ?? ''}
          alt={imageAlt(active?.name)}
          open={active !== null}
          onClose={handleClose}
        />
      ) : null}
      {/* c8 ignore stop */}
    </div>
  )
}
