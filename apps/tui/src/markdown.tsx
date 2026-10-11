import { React, ink } from '@fx/chat-ink'
import {
  type InkMarkdownProps,
  Styled,
  appearanceProps,
  stripControls,
  useInkComponents,
} from '@fx/chat-ink'
import { type Token, type Tokens, lexer } from 'marked'
/** @jsxRuntime classic */
/** @jsx React.createElement */
/** @jsxFrag React.Fragment */
/**
 * Markdown → Ink, injected into `@fx/chat-ink`'s markdown slot. Uses `marked`'s
 * lexer for structure and draws every piece in a theme tone, so it follows the
 * tx theme like the rest of the transcript.
 */
import type { ComponentProps, ReactNode } from 'react'

/**
 * marked decodes numeric entities (`&#27;`, `&#x9b;`) into real control
 * characters after the entry guard has run, so every string drawn here goes
 * through this `ink.Text` wrapper, which strips them at the sink. Elements
 * other than fragments draw their own strings through this wrapper too.
 */
function clean(node: ReactNode): ReactNode {
  if (typeof node === 'string') return stripControls(node)
  if (Array.isArray(node)) return node.map(clean)
  if (React.isValidElement<{ children?: ReactNode }>(node) && node.type === React.Fragment)
    return React.cloneElement(node, undefined, ...kids(node.props.children))
  return node
}
const kids = (children: ReactNode): ReactNode[] =>
  Array.isArray(children) ? children.map(clean) : [clean(children)]

function Text({ children, ...props }: ComponentProps<typeof ink.Text>) {
  return React.createElement(ink.Text, props, ...kids(children))
}

function Inline({ tokens }: { tokens: Token[] | undefined }): ReactNode {
  const { theme } = useInkComponents()
  return (tokens ?? []).map((token, i) => {
    const key = `${i}-${token.type}`
    switch (token.type) {
      case 'strong':
        return (
          <Text key={key} bold>
            <Inline tokens={(token as Tokens.Strong).tokens} />
          </Text>
        )
      case 'em':
        return (
          <Text key={key} italic>
            <Inline tokens={(token as Tokens.Em).tokens} />
          </Text>
        )
      case 'del':
        return (
          <Text key={key} strikethrough>
            <Inline tokens={(token as Tokens.Del).tokens} />
          </Text>
        )
      case 'codespan':
        return (
          <Text key={key} {...appearanceProps(theme.caution)}>
            {(token as Tokens.Codespan).text}
          </Text>
        )
      case 'link': {
        const link = token as Tokens.Link
        const label = link.text
        return (
          <Text key={key}>
            <Text underline>
              <Inline tokens={link.tokens} />
            </Text>
            {label !== link.href ? (
              <Text {...appearanceProps(theme.muted)}> ({link.href})</Text>
            ) : null}
          </Text>
        )
      }
      case 'br':
        return <Text key={key}>{'\n'}</Text>
      case 'text': {
        const t = token as Tokens.Text
        return t.tokens ? (
          <Inline key={key} tokens={t.tokens} />
        ) : (
          <Text key={key}>{decode(t.text)}</Text>
        )
      }
      default:
        return <Text key={key}>{decode((token as { raw: string }).raw)}</Text>
    }
  })
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
}
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] as string)

function Block({ token }: { token: Token }): ReactNode {
  switch (token.type) {
    case 'heading':
      return (
        <Styled tone="strong">
          <Inline tokens={(token as Tokens.Heading).tokens} />
        </Styled>
      )
    case 'paragraph':
      return (
        <Text>
          <Inline tokens={(token as Tokens.Paragraph).tokens} />
        </Text>
      )
    case 'code': {
      const code = token as Tokens.Code
      return (
        <ink.Box flexDirection="column">
          {code.lang ? <Styled tone="muted">{code.lang}</Styled> : null}
          <ink.Box
            borderStyle="single"
            borderLeft
            borderTop={false}
            borderRight={false}
            borderBottom={false}
            borderDimColor
            paddingLeft={1}
          >
            <Text>{code.text}</Text>
          </ink.Box>
        </ink.Box>
      )
    }
    case 'blockquote':
      return (
        <ink.Box
          borderStyle="single"
          borderLeft
          borderTop={false}
          borderRight={false}
          borderBottom={false}
          borderDimColor
          paddingLeft={1}
          flexDirection="column"
        >
          <Blocks tokens={(token as Tokens.Blockquote).tokens} />
        </ink.Box>
      )
    case 'list': {
      const list = token as Tokens.List
      const start = typeof list.start === 'number' ? list.start : 1
      return (
        <ink.Box flexDirection="column">
          {list.items.map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: list items have no identity beyond position
            <ink.Box key={i}>
              <Styled tone="marker">
                {list.ordered
                  ? `${start + i}.`
                  : item.task
                    ? item.checked
                      ? '[x]'
                      : '[ ]'
                    : '•'}{' '}
              </Styled>
              <ink.Box flexDirection="column" flexGrow={1}>
                <Blocks tokens={item.tokens} />
              </ink.Box>
            </ink.Box>
          ))}
        </ink.Box>
      )
    }
    case 'table': {
      const table = token as Tokens.Table
      // Cleaned before measuring, so widths match what is drawn.
      const cell = (c: Tokens.TableCell) => stripControls(c.text)
      const widths = table.header.map((h, i) =>
        Math.max(cell(h).length, ...table.rows.map((r) => (r[i] ? cell(r[i]).length : 0))),
      )
      const line = (cells: string[]) =>
        cells.map((c, i) => c.padEnd(widths[i] as number)).join(' │ ')
      return (
        <ink.Box flexDirection="column">
          <Styled tone="strong">{line(table.header.map(cell))}</Styled>
          <Styled tone="chrome">{widths.map((w) => '─'.repeat(w)).join('─┼─')}</Styled>
          {table.rows.map((row, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity beyond position
            <Text key={i}>{line(row.map(cell))}</Text>
          ))}
        </ink.Box>
      )
    }
    case 'hr':
      return <Styled tone="chrome">{'─'.repeat(24)}</Styled>
    case 'space':
    // Task-list checkboxes are drawn by the list marker.
    case 'checkbox':
      return null
    case 'text': {
      const t = token as Tokens.Text
      return <Text>{t.tokens ? <Inline tokens={t.tokens} /> : decode(t.text)}</Text>
    }
    default:
      return <Text>{(token as { raw: string }).raw.trimEnd()}</Text>
  }
}

function Blocks({ tokens }: { tokens: Token[] }) {
  return tokens.map((token, i) => <Block key={`${i}-${token.type}`} token={token} />)
}

export function TerminalMarkdown({ content }: InkMarkdownProps) {
  // MessageView cleans content already; this slot guards its input too, and `Text` cleans what marked decodes.
  const tokens = lexer(stripControls(content)).filter((t) => t.type !== 'space')
  return (
    <ink.Box flexDirection="column" gap={1}>
      <Blocks tokens={tokens} />
    </ink.Box>
  )
}
