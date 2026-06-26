/**
 * Markdown slot backed by `react-markdown`, shared by the styled (fx-ui +
 * shadcn) adapters.
 *
 * Demonstrates that the markdown engine is host-injected (not a library
 * dependency): the library only defines the `Markdown` slot contract, and the
 * adapters wire a real engine into it. Styling uses Tailwind utility classes
 * scoped to the rendered nodes — both adapters render against the same
 * `--background`/`--muted`/`--primary` design tokens, so this is shared.
 */
import type { MarkdownProps } from '@fx/chat'
import ReactMarkdown from 'react-markdown'
import { cn } from './cn'

export function MarkdownView({ content, streaming }: MarkdownProps) {
  return (
    <div
      className={cn(
        'text-sm leading-relaxed [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs',
        '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre>code]:bg-transparent [&_pre>code]:p-0',
      )}
      data-streaming={streaming ? 'true' : undefined}
    >
      <ReactMarkdown
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
