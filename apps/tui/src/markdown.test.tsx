import { InkChatProvider, stripControls } from '@fx/chat-ink'
import { renderToString } from 'ink'
import { describe, expect, it } from 'vitest'
import { TerminalMarkdown } from './markdown'

const md = (content: string) =>
  renderToString(
    <InkChatProvider>
      <TerminalMarkdown content={content} />
    </InkChatProvider>,
    { columns: 60 },
  )

describe('TerminalMarkdown', () => {
  it('renders block structure', () => {
    const out = md(
      '# Title\n\nSome **bold**, *it*, `code`, ~~gone~~, [link](https://x.test), <https://y.test> &amp; text  \nnext\n\n- one\n- [x] done\n\n3. three\n4. four\n\n> quoted\n\n```ts\nconst x = 1\n```\n\n```\nplain\n```\n\n| a | bb |\n|---|---|\n| 1 | 22 |\n| 3 |  |\n\n---\n\n<div>html</div>',
    )
    for (const piece of [
      'Title',
      'bold',
      'code',
      'gone',
      'link (https://x.test)',
      'https://y.test',
      '& text',
      'next',
      '• one',
      '[x] done',
      '3. three',
      '4. four',
      '│ quoted',
      'ts',
      'const x = 1',
      'plain',
      'a │ bb',
      '1 │ 22',
      '──',
      '<div>html</div>',
    ]) {
      expect(out).toContain(piece)
    }
  })

  it('renders an empty document', () => {
    expect(md('')).toBe('')
  })

  it('draws no terminal controls from content it is handed', () => {
    const out = md(
      'a\u009b2Jb\u007fc \u009d52;c;QQ==\u009c`x\u001b]52;c;QQ==\u0007y`\n\n```\nz\u009b0m\n```',
    )
    expect(out).toContain('abc')
    for (const bad of ['\u009b', '\u007f', '\u009d', '\u001b]52']) expect(out).not.toContain(bad)
  })

  it('draws no controls that marked decodes from numeric entities', () => {
    const entities = ['&#27;', '&#x1b;', '&#x9b;', '&#155;', '&#127;', '&#X1B;', '&#0027;']
    for (const e of entities) {
      const out = md(
        `# h${e}[31m${e}]52;c;QQ==\u0007x\n\np${e}[2Jq x${e}[31my **b${e}b** <span>${e}</span>\n\n- li${e}[31m\n\n| a${e}[31m | b |\n|---|---|\n| c${e}[31m | d |\n\n[l${e}[31mk](https://x.test/${e}) ![al${e}t](https://i.test/${e}) \`c${e}d\`\n\n\`\`\`\nk${e}[31m\n\`\`\``,
      )
      expect(out).toContain('li')
      // The test renderer draws no styling, so any control left is one the content smuggled in.
      expect(stripControls(out)).toBe(out)
    }
  })
})
