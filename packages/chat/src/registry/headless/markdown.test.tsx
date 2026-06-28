import { render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChatProvider } from '../context'
import { HeadlessMarkdown, parseBlocks } from './markdown'

describe('parseBlocks', () => {
  it('splits paragraphs on blank lines', () => {
    const blocks = parseBlocks('one\n\ntwo')
    expect(blocks).toEqual([
      { kind: 'paragraph', lines: ['one'] },
      { kind: 'paragraph', lines: ['two'] },
    ])
  })

  it('captures a fenced code block with a language', () => {
    const blocks = parseBlocks('```ts\nconst a = 1\n```')
    expect(blocks).toEqual([{ kind: 'code', language: 'ts', code: 'const a = 1' }])
  })

  it('captures a fenced code block without a language', () => {
    const blocks = parseBlocks('```\nplain\n```')
    expect(blocks).toEqual([{ kind: 'code', code: 'plain' }])
  })

  it('runs an unterminated fence to end of input', () => {
    const blocks = parseBlocks('```\na\nb')
    expect(blocks).toEqual([{ kind: 'code', code: 'a\nb' }])
  })

  it('flushes a pending paragraph before a fence', () => {
    const blocks = parseBlocks('para\n```\ncode\n```')
    expect(blocks).toEqual([
      { kind: 'paragraph', lines: ['para'] },
      { kind: 'code', code: 'code' },
    ])
  })

  it('returns no blocks for empty/whitespace-only content', () => {
    expect(parseBlocks('')).toEqual([])
    expect(parseBlocks('\n\n')).toEqual([])
  })
})

describe('HeadlessMarkdown', () => {
  it('renders a paragraph of plain text', () => {
    render(<HeadlessMarkdown content="hello world" />)
    expect(screen.getByText('hello world')).toBeInTheDocument()
  })

  it('renders a code fence as a <pre> with data-language', () => {
    const { container } = render(<HeadlessMarkdown content={'```ts\nx()\n```'} />)
    const pre = container.querySelector('pre.chat-md-pre') as HTMLElement
    expect(pre).toHaveAttribute('data-language', 'ts')
    expect(pre.textContent).toBe('x()')
  })

  it('renders a code fence without a language (no data-language)', () => {
    const { container } = render(<HeadlessMarkdown content={'```\nplain\n```'} />)
    const pre = container.querySelector('pre.chat-md-pre') as HTMLElement
    expect(pre).not.toHaveAttribute('data-language')
  })

  it('renders inline code', () => {
    const { container } = render(<HeadlessMarkdown content="use `foo` now" />)
    const code = container.querySelector('code.chat-md-code-inline') as HTMLElement
    expect(code).toHaveTextContent('foo')
  })

  it('renders a safe http link as an anchor', () => {
    render(<HeadlessMarkdown content="see [docs](https://example.com)" />)
    const link = screen.getByRole('link', { name: 'docs' })
    expect(link).toHaveAttribute('href', 'https://example.com')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders a mailto link as an anchor', () => {
    render(<HeadlessMarkdown content="[mail](mailto:a@b.com)" />)
    expect(screen.getByRole('link', { name: 'mail' })).toHaveAttribute('href', 'mailto:a@b.com')
  })

  it('renders an unsafe-scheme link as escaped text, not an anchor', () => {
    const { container } = render(<HeadlessMarkdown content="[x](javascript:alert(1))" />)
    expect(container.querySelector('a')).toBeNull()
    expect(container.textContent).toContain('[x](javascript:alert(1))')
  })

  it('renders text before and after an inline match', () => {
    const { container } = render(<HeadlessMarkdown content="a `b` c" />)
    expect(container.textContent).toBe('a b c')
    expect(container.querySelector('code.chat-md-code-inline')).toHaveTextContent('b')
  })

  it('prefers the earliest match and handles link-before-code', () => {
    render(<HeadlessMarkdown content="[l](https://e.com) then `code`" />)
    expect(screen.getByRole('link', { name: 'l' })).toBeInTheDocument()
    expect(screen.getByText('code')).toHaveClass('chat-md-code-inline')
  })

  it('prefers the link on an index tie', () => {
    // A construct where a link and code regex could both anchor early; the link
    // starts first, so it must win.
    render(<HeadlessMarkdown content="[a](https://e.com)`c`" />)
    expect(screen.getByRole('link', { name: 'a' })).toBeInTheDocument()
    expect(screen.getByText('c')).toHaveClass('chat-md-code-inline')
  })

  it('renders multi-line paragraphs with <br> between lines', () => {
    const { container } = render(<HeadlessMarkdown content={'line1\nline2'} />)
    expect(container.querySelector('br')).toBeTruthy()
    expect(container.textContent).toContain('line1')
    expect(container.textContent).toContain('line2')
  })

  it('sets data-streaming when streaming is true and omits it otherwise', () => {
    const { container, rerender } = render(<HeadlessMarkdown content="x" streaming />)
    expect(container.querySelector('.chat-md')).toHaveAttribute('data-streaming', 'true')
    rerender(<HeadlessMarkdown content="x" />)
    expect(container.querySelector('.chat-md')).not.toHaveAttribute('data-streaming')
  })

  it('is SSR-safe via renderToStaticMarkup', () => {
    const markup = renderToStaticMarkup(
      <HeadlessMarkdown content={'p\n\n```ts\nc\n```\n\nuse `x` and [y](https://e.com)'} />,
    )
    expect(markup).toContain('chat-md')
    expect(markup).toContain('<pre')
    expect(markup).toContain('<a')
  })

  it('forwards the className prop onto the root, after the stable hook', () => {
    const { container } = render(<HeadlessMarkdown content="x" className="host-md" />)
    const root = container.querySelector('.chat-md.host-md')
    expect(root).not.toBeNull()
    // Stable hook stays first; the forwarded class is appended.
    expect(root?.className).toBe('chat-md host-md')
  })

  it('appends injected classNames to the root + every markdown atom', () => {
    const { container } = render(
      <ChatProvider
        classNames={{
          md: 'md-x',
          mdP: 'mdp-x',
          mdPre: 'mdpre-x',
          mdLink: 'mdlink-x',
          mdCodeInline: 'mdcode-x',
        }}
      >
        <HeadlessMarkdown content={'use `c` and [l](https://e.com)\n\n```ts\nx()\n```'} />
      </ChatProvider>,
    )
    expect(container.querySelector('.chat-md.md-x')).not.toBeNull()
    expect(container.querySelector('.chat-md-p.mdp-x')).not.toBeNull()
    expect(container.querySelector('.chat-md-pre.mdpre-x')).not.toBeNull()
    expect(container.querySelector('.chat-md-link.mdlink-x')).not.toBeNull()
    expect(container.querySelector('.chat-md-code-inline.mdcode-x')).not.toBeNull()
  })

  it('combines the className prop and the injected md class (hook, prop, injected order)', () => {
    const { container } = render(
      <ChatProvider classNames={{ md: 'md-x' }}>
        <HeadlessMarkdown content="x" className="host-md" />
      </ChatProvider>,
    )
    expect(container.querySelector('.chat-md')?.className).toBe('chat-md host-md md-x')
  })
})
