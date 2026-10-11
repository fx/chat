import type { Attachment } from '@fx/chat-core'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatProvider } from '../registry'
import type { LightboxProps } from '../registry'
import { MessageAttachments, deriveAttachmentLabel } from './MessageAttachments'
import { stubMatchMedia } from './test-helpers'

beforeEach(() => {
  stubMatchMedia(false)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const img = (over: Partial<Attachment> = {}): Attachment => ({
  url: 'https://x/a.png',
  mediaType: 'image/png',
  kind: 'image',
  ...over,
})

function renderAttachments(attachments: Attachment[]) {
  return render(
    <ChatProvider>
      <MessageAttachments attachments={attachments} />
    </ChatProvider>,
  )
}

describe('deriveAttachmentLabel', () => {
  it('uses the name when present', () => {
    expect(deriveAttachmentLabel(img({ name: 'cat.png' }))).toBe('cat.png')
  })

  it('trims the name when present', () => {
    expect(deriveAttachmentLabel(img({ name: '  cat.png  ' }))).toBe('cat.png')
  })

  it('derives the last path segment from the URL when unnamed', () => {
    expect(deriveAttachmentLabel(img({ url: 'https://x/dir/report.pdf', kind: 'file' }))).toBe(
      'report.pdf',
    )
  })

  it('treats a whitespace-only name as absent and derives from the URL', () => {
    expect(
      deriveAttachmentLabel(img({ url: 'https://x/dir/report.pdf', kind: 'file', name: '   ' })),
    ).toBe('report.pdf')
  })

  it('strips query and hash before taking the segment', () => {
    expect(
      deriveAttachmentLabel(img({ url: 'https://x/dir/clip.mp4?token=1#t=2', kind: 'video' })),
    ).toBe('clip.mp4')
  })

  it('percent-decodes the segment', () => {
    expect(deriveAttachmentLabel(img({ url: 'https://x/my%20file.pdf', kind: 'file' }))).toBe(
      'my file.pdf',
    )
  })

  it('returns the raw segment when percent-decoding fails', () => {
    expect(deriveAttachmentLabel(img({ url: 'https://x/bad%E0%A4%A.pdf', kind: 'file' }))).toBe(
      'bad%E0%A4%A.pdf',
    )
  })

  it('falls back to the kind when the URL has no usable path segment', () => {
    expect(deriveAttachmentLabel(img({ url: '', kind: 'file' }))).toBe('file')
    expect(deriveAttachmentLabel(img({ url: '/', kind: 'audio' }))).toBe('audio')
  })
})

describe('MessageAttachments image grid', () => {
  it('renders a lazy-loaded thumbnail per image with accessible alt (name or fallback)', () => {
    renderAttachments([
      img({ name: 'first.png' }),
      img({ url: 'https://x/b.png' }),
      img({ url: 'https://x/c.png', name: 'third.png' }),
    ])
    const thumbs = screen.getAllByRole('img')
    expect(thumbs).toHaveLength(3)
    expect(screen.getByAltText('first.png')).toHaveAttribute('loading', 'lazy')
    // Unnamed image uses the generic fallback.
    expect(screen.getByAltText('image attachment')).toBeInTheDocument()
    expect(screen.getByAltText('third.png')).toBeInTheDocument()
  })

  it('uses the fallback alt when an image name is empty or whitespace', () => {
    renderAttachments([
      img({ url: 'https://x/d.png', name: '' }),
      img({ url: 'https://x/e.png', name: '   ' }),
    ])
    // Both blank-named images collapse onto the generic fallback alt.
    expect(screen.getAllByAltText('image attachment')).toHaveLength(2)
  })

  it('opens the lightbox with the enlarged image when a thumbnail is expanded', () => {
    renderAttachments([img({ name: 'first.png' })])
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Expand first.png' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('img', { name: 'first.png' })).toHaveAttribute(
      'src',
      'https://x/a.png',
    )
  })

  it('opens the lightbox with the fallback alt for an unnamed image', () => {
    renderAttachments([img({ url: 'https://x/b.png' })])
    fireEvent.click(screen.getByRole('button', { name: 'Expand image attachment' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('img', { name: 'image attachment' })).toHaveAttribute(
      'src',
      'https://x/b.png',
    )
  })

  it('closes the lightbox via the close control', () => {
    renderAttachments([img({ name: 'first.png' })])
    fireEvent.click(screen.getByRole('button', { name: 'Expand first.png' }))
    fireEvent.click(screen.getByLabelText('Close'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders an unsafe-scheme image inert (no img src, no expand control)', () => {
    const { container } = renderAttachments([img({ url: 'javascript:alert(1)', name: 'evil.png' })])
    // No expand button, no <img> — only an inert labelled placeholder.
    expect(screen.queryByRole('button', { name: /Expand/ })).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    const inert = container.querySelector('[data-inert="true"]') as HTMLElement
    expect(inert).toHaveAttribute('aria-label', 'evil.png')
  })
})

describe('MessageAttachments chips', () => {
  it('renders a file chip with the file icon name, label, and a safe download link', () => {
    const { container } = renderAttachments([
      {
        url: 'https://x/report.pdf',
        mediaType: 'application/pdf',
        kind: 'file',
        name: 'report.pdf',
      },
    ])
    const chip = container.querySelector('.chat-attachment-chip') as HTMLElement
    expect(chip).toHaveAttribute('data-kind', 'file')
    expect(within(chip).getByText('report.pdf')).toBeInTheDocument()
    const link = within(chip).getByRole('link', { name: 'Download report.pdf' })
    expect(link).toHaveAttribute('href', 'https://x/report.pdf')
    expect(link).toHaveAttribute('download')
  })

  it('falls back to the URL-derived label and a non-blank download label for a whitespace-only name', () => {
    const { container } = renderAttachments([
      {
        url: 'https://x/report.pdf',
        mediaType: 'application/pdf',
        kind: 'file',
        name: '   ',
      },
    ])
    const chip = container.querySelector('.chat-attachment-chip') as HTMLElement
    expect(within(chip).getByText('report.pdf')).toBeInTheDocument()
    const link = within(chip).getByRole('link', { name: 'Download report.pdf' })
    expect(link).toHaveAttribute('href', 'https://x/report.pdf')
  })

  it('renders video and audio chips with their kinds', () => {
    const { container } = renderAttachments([
      { url: 'https://x/clip.mp4', mediaType: 'video/mp4', kind: 'video', name: 'clip.mp4' },
      { url: 'https://x/song.mp3', mediaType: 'audio/mpeg', kind: 'audio', name: 'song.mp3' },
    ])
    const kinds = Array.from(container.querySelectorAll('.chat-attachment-chip')).map((el) =>
      el.getAttribute('data-kind'),
    )
    expect(kinds).toEqual(['video', 'audio'])
  })

  it('renders an unsafe-scheme chip inert (no download link)', () => {
    const { container } = renderAttachments([
      { url: 'javascript:alert(1)', mediaType: 'application/pdf', kind: 'file', name: 'evil.pdf' },
    ])
    const chip = container.querySelector('.chat-attachment-chip') as HTMLElement
    expect(chip).toHaveAttribute('data-safe', 'false')
    expect(within(chip).queryByRole('link')).toBeNull()
    expect(within(chip).getByText('evil.pdf')).toBeInTheDocument()
  })
})

describe('MessageAttachments mixed + registry', () => {
  it('renders both images and chips together', () => {
    const { container } = renderAttachments([
      img({ name: 'pic.png' }),
      { url: 'https://x/doc.pdf', mediaType: 'application/pdf', kind: 'file', name: 'doc.pdf' },
    ])
    expect(container.querySelector('.chat-attachment-grid')).not.toBeNull()
    expect(container.querySelector('.chat-attachment-chips')).not.toBeNull()
  })

  it('uses a host-overridden Lightbox from the registry', () => {
    const HostLightbox = ({ src, alt, open, onClose }: LightboxProps) =>
      open ? (
        <div data-stub="host-lightbox">
          <img src={src} alt={alt} />
          <button type="button" onClick={onClose}>
            host-close
          </button>
        </div>
      ) : null
    render(
      <ChatProvider components={{ Lightbox: HostLightbox }}>
        <MessageAttachments attachments={[img({ name: 'pic.png' })]} />
      </ChatProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Expand pic.png' }))
    expect(
      screen.getByTestId('message-attachments').querySelector('[data-stub="host-lightbox"]'),
    ).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'host-close' }))
    expect(document.querySelector('[data-stub="host-lightbox"]')).toBeNull()
  })
})
