/**
 * Code + JSON view slots: a Tailwind-styled `<pre>`; `JsonView` pretty-prints
 * any value first. No syntax highlighting.
 */
import type { CodeBlockProps, JsonViewProps } from '@fx-/chat'
import { cn } from './cn'

export function CodeBlock({ code, language, className }: CodeBlockProps) {
  return (
    <pre
      className={cn('overflow-x-auto rounded-md bg-muted p-3 text-xs leading-relaxed', className)}
      {...(language ? { 'data-language': language } : {})}
    >
      <code>{code}</code>
    </pre>
  )
}

export function JsonView({ value, className }: JsonViewProps) {
  let text: string
  try {
    text = JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    text = String(value)
  }
  return <CodeBlock code={text} language="json" {...(className ? { className } : {})} />
}
