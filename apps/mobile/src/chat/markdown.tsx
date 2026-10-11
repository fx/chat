/**
 * Markdown slot backed by `react-markdown` + GFM (tables, task lists,
 * strikethrough, autolinks).
 *
 * The markdown engine is host-injected, not a library dependency: the library
 * only defines the `Markdown` slot contract and the app wires a real engine in.
 */
import type { MarkdownProps } from '@fx/chat'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from './cn'

export function MarkdownView({ content, streaming }: MarkdownProps) {
  return (
    <div
      className={cn(
        'text-sm leading-relaxed [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs',
        '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:my-2 [&_table]:block [&_table]:overflow-x-auto [&_th]:border [&_th]:border-border [&_th]:px-2 [&_td]:border [&_td]:border-border [&_td]:px-2',
        '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre>code]:bg-transparent [&_pre>code]:p-0',
      )}
      data-streaming={streaming ? 'true' : undefined}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
