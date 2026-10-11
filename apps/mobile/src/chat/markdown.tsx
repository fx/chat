/**
 * Markdown slot backed by `react-markdown` + GFM (tables, task lists,
 * strikethrough, autolinks).
 *
 * The markdown engine is host-injected, not a library dependency: the library
 * only defines the `Markdown` slot contract and the app wires a real engine in.
 *
 * Answers are model output, so rendering one must never reach the network on
 * its own: raw HTML is skipped, remote images render as inert placeholders
 * linking to the image (only inline `data:` images are drawn), and links open
 * only when the user taps them.
 */
import type { MarkdownProps } from '@fx/chat'
import { ImageOff } from 'lucide-react'
import type { ComponentProps } from 'react'
import ReactMarkdown, { type UrlTransform, defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from './cn'

/** Inline image data: drawn without any request. */
const DATA_IMAGE = /^data:image\//i

/** Keep `data:` image sources; every other URL gets the default sanitising. */
const urlTransform: UrlTransform = (url, key) =>
  key === 'src' && DATA_IMAGE.test(url) ? url : defaultUrlTransform(url)

/** The host a URL points at, or the URL itself when it does not parse. */
function hostOf(src: string): string {
  try {
    return new URL(src).host || src
  } catch {
    return src
  }
}

function ExternalLink({ node: _node, ...props }: ComponentProps<'a'> & { node?: unknown }) {
  return <a {...props} target="_blank" rel="noopener noreferrer" />
}

/**
 * Markdown image: a `data:` image is drawn; any other source becomes a
 * placeholder showing the alt text and source host, linking to the image so
 * the user can open it in the browser.
 */
function SafeImage({ node: _node, src, alt, title }: ComponentProps<'img'> & { node?: unknown }) {
  if (src && DATA_IMAGE.test(src)) return <img src={src} alt={alt ?? ''} title={title} />
  const label = alt || 'image'
  const body = (
    <>
      <ImageOff size={14} aria-hidden />
      <span>{label}</span>
      {src ? <span className="text-muted-foreground">({hostOf(src)})</span> : null}
    </>
  )
  const className =
    'inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-xs no-underline'
  return src ? (
    <a
      href={src}
      title={title}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      data-image-placeholder=""
    >
      {body}
    </a>
  ) : (
    <span title={title} className={className} data-image-placeholder="">
      {body}
    </span>
  )
}

export function MarkdownView({ content, streaming }: MarkdownProps) {
  return (
    <div
      className={cn(
        'text-sm leading-relaxed [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs',
        '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:my-2 [&_table]:block [&_table]:overflow-x-auto [&_th]:border [&_th]:border-border [&_th]:px-2 [&_td]:border [&_td]:border-border [&_td]:px-2',
        '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre>code]:bg-transparent [&_pre>code]:p-0',
        '[&_img]:inline-block [&_img]:max-w-full',
      )}
      data-streaming={streaming ? 'true' : undefined}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={urlTransform}
        components={{ a: ExternalLink, img: SafeImage }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
